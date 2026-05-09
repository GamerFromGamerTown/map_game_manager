import { validateGameState } from "../data/validation";
import { defaultRules } from "../rules/defaultRules";
import { canonicalFactoryType } from "../rules/factoryRules";
import {
  Country,
  DiplomaticRelation,
  Factory,
  GameState,
  RESOURCE_TYPES,
  ResourceStockpile,
  Settlement,
  SettlementTier,
  TradeRoute
} from "../types";
import {
  ParsedStatSheet,
  StatSheetCountryAlias,
  StatSheetImportBundle,
  StatSheetImportResult,
  StatSheetIssue,
  StatSheetReport
} from "./statSheetTypes";

const emptyReport = (): StatSheetReport => ({ warnings: [], errors: [] });

const clone = <T>(value: T): T => structuredClone(value);

const normalizeKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const slug = (value: string): string =>
  normalizeKey(value)
    .replace(/\s+/g, "-")
    .replace(/^-|-$/g, "") || "item";

const uniqueStrings = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const normalizedReferenceKeys = (value: string): string[] => {
  const stripped = value
    .replace(/^<@!?/, "")
    .replace(/>$/, "")
    .replace(/^@+/, "")
    .trim();
  const key = normalizeKey(stripped);
  if (!key) return [];
  return uniqueStrings([key, key.replace(/\s+/g, "")]);
};

const referencesMatch = (left: string, right: string): boolean => {
  const rightKeys = new Set(normalizedReferenceKeys(right));
  return normalizedReferenceKeys(left).some((key) => rightKeys.has(key));
};

const wordsContainSequence = (larger: string, smaller: string): boolean => {
  const largerWords = larger.split(" ").filter(Boolean);
  const smallerWords = smaller.split(" ").filter(Boolean);
  if (smallerWords.length === 0 || largerWords.length < smallerWords.length) return false;
  return largerWords.some((_, index) =>
    smallerWords.every((word, offset) => largerWords[index + offset] === word)
  );
};

const countryNamesLooselyMatch = (left: string, right: string): boolean =>
  normalizedReferenceKeys(left).some((leftKey) =>
    normalizedReferenceKeys(right).some(
      (rightKey) =>
        leftKey === rightKey ||
        wordsContainSequence(leftKey, rightKey) ||
        wordsContainSequence(rightKey, leftKey)
    )
  );

const aliasValuesForCountry = (country: Country): string[] =>
  uniqueStrings([country.name, country.short_name ?? "", ...(country.aliases ?? [])]);

const aliasValuesForSheet = (sheet: ParsedStatSheet): string[] =>
  uniqueStrings([sheet.country.name, sheet.country.short_name ?? "", ...(sheet.country.aliases ?? [])]);

const aliasValuesForEntry = (entry: StatSheetCountryAlias): string[] =>
  uniqueStrings([entry.country_name, ...(entry.aliases ?? [])]);

const matchingAliasEntry = (
  values: string[],
  entries: StatSheetCountryAlias[]
): StatSheetCountryAlias | undefined => {
  const keys = new Set(values.flatMap(normalizedReferenceKeys));
  return entries.find(
    (entry) =>
      aliasValuesForEntry(entry).some((value) => normalizedReferenceKeys(value).some((key) => keys.has(key))) ||
      values.some((value) => countryNamesLooselyMatch(value, entry.country_name))
  );
};

const aliasesForCountryName = (countryName: string, aliases: string[]): string[] =>
  uniqueStrings(aliases).filter((alias) => !referencesMatch(alias, countryName));

const mergeAliases = (countryName: string, ...aliasLists: string[][]): string[] | undefined => {
  const aliases = aliasesForCountryName(countryName, aliasLists.flat());
  return aliases.length > 0 ? aliases : undefined;
};

interface CountryResolver {
  resolve: (reference: string) => { country?: Country; ambiguous?: Country[] };
}

const createCountryResolver = (countries: Country[]): CountryResolver => {
  const index = new Map<string, Country[]>();
  countries.forEach((country) => {
    aliasValuesForCountry(country).forEach((value) => {
      normalizedReferenceKeys(value).forEach((key) => {
        const existing = index.get(key) ?? [];
        if (!existing.some((item) => item.id === country.id)) {
          index.set(key, [...existing, country]);
        }
      });
    });
  });

  return {
    resolve(reference: string) {
      const matches = uniqueStrings(normalizedReferenceKeys(reference).flatMap((key) => (index.get(key) ?? []).map((country) => country.id)))
        .map((id) => countries.find((country) => country.id === id))
        .filter((country): country is Country => Boolean(country));
      if (matches.length === 1) return { country: matches[0] };
      if (matches.length > 1) return { ambiguous: matches };
      return {};
    }
  };
};

const colorForName = (name: string): string => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 0xffffff;
  return `#${hash.toString(16).padStart(6, "0")}`;
};

const reportError = (message: string, suggestedFix: string): StatSheetIssue => ({
  severity: "error",
  message,
  suggestedFix
});

const isBundle = (value: unknown): value is StatSheetImportBundle => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.kind === "gm-stat-sheet-import" && record.version === 1 && Array.isArray(record.sheets);
};

const findCountry = (state: GameState, sheet: ParsedStatSheet): Country | undefined => {
  const resolver = createCountryResolver(state.countries);
  for (const value of aliasValuesForSheet(sheet)) {
    const resolved = resolver.resolve(value);
    if (resolved.country) return resolved.country;
  }
  return undefined;
};

const defaultCountry = (sheet: ParsedStatSheet, turnNumber: number): Country => ({
  id: `country-${slug(sheet.country.name)}`,
  name: sheet.country.name,
  short_name: sheet.country.short_name,
  aliases: mergeAliases(sheet.country.name, sheet.country.aliases ?? []),
  color: colorForName(sheet.country.name),
  is_player_country: true,
  ruling_party: sheet.country.ruling_party ?? Object.keys(defaultRules.rulingParties)[0] ?? "Democratic",
  gold: sheet.country.gold ?? 0,
  stability: sheet.country.stability ?? defaultRules.stabilityRules.base_stability,
  manpower: sheet.country.manpower ?? 0,
  manpower_cap: sheet.country.manpower_cap ?? defaultRules.settings.base_manpower_cap,
  manual_manpower_cap_override: null,
  reserve: sheet.country.reserve ?? 0,
  equipment: sheet.country.equipment ?? 0,
  high_quality_equipment: sheet.country.high_quality_equipment ?? 0,
  tanks: sheet.country.tanks ?? 0,
  supply: sheet.country.supply ?? 0,
  current_turn_created: turnNumber,
  at_war: false,
  peace_turns_count: 0,
  notes: ""
});

const mergeCountry = (existing: Country, sheet: ParsedStatSheet): Country => ({
  ...existing,
  name: sheet.country.name || existing.name,
  short_name: sheet.country.short_name ?? existing.short_name,
  aliases: mergeAliases(sheet.country.name || existing.name, existing.aliases ?? [], sheet.country.aliases ?? []),
  ruling_party: sheet.country.ruling_party ?? existing.ruling_party,
  gold: sheet.country.gold ?? existing.gold,
  stability: sheet.country.stability ?? existing.stability,
  manpower: sheet.country.manpower ?? existing.manpower,
  manpower_cap: sheet.country.manpower_cap ?? existing.manpower_cap,
  reserve: sheet.country.reserve ?? existing.reserve,
  equipment: sheet.country.equipment ?? existing.equipment,
  high_quality_equipment: sheet.country.high_quality_equipment ?? existing.high_quality_equipment,
  tanks: sheet.country.tanks ?? existing.tanks,
  supply: sheet.country.supply ?? existing.supply
});

const toSettlement = (
  sheet: ParsedStatSheet,
  countryId: string,
  index: number,
  turnNumber: number
): Settlement => ({
  id: `settlement-${slug(countryId)}-${index + 1}-${slug(sheet.settlements[index].name)}`,
  country_id: countryId,
  name: sheet.settlements[index].name,
  tier: sheet.settlements[index].tier as SettlementTier,
  is_capital: sheet.settlements[index].is_capital,
  biome_or_resource_type: sheet.settlements[index].biome_or_resource_type,
  manual_resource_override: null,
  upkeep_option: sheet.settlements[index].upkeep_option ?? "A",
  occupied_by_country_id: null,
  damaged: false,
  bombed: false,
  connected_for_upkeep: true,
  notes: sheet.settlements[index].notes ?? "",
  created_turn: turnNumber
});

const toFactory = (sheet: ParsedStatSheet, state: GameState, countryId: string, index: number, turnNumber: number): Factory => ({
  id: `factory-${slug(countryId)}-${index + 1}-${slug(sheet.factories[index].type)}`,
  country_id: countryId,
  type: canonicalFactoryType(state.rules, sheet.factories[index].type),
  active: sheet.factories[index].active ?? true,
  damaged: sheet.factories[index].damaged ?? false,
  bombed: sheet.factories[index].bombed ?? false,
  notes: sheet.factories[index].notes ?? "",
  created_turn: turnNumber
});

const stockpilesForSheet = (sheet: ParsedStatSheet, countryId: string): ResourceStockpile[] =>
  RESOURCE_TYPES.map((resource_type) => ({
    country_id: countryId,
    resource_type,
    amount: Number(sheet.stockpiles[resource_type] ?? 0)
  }));

const prepareSheet = (
  sheet: ParsedStatSheet,
  aliasEntries: StatSheetCountryAlias[],
  report: StatSheetReport
): ParsedStatSheet => {
  const entry = matchingAliasEntry(aliasValuesForSheet(sheet), aliasEntries);
  const sheetNameIsEntryAlias =
    Boolean(sheet.country.name && entry?.aliases.some((alias) => referencesMatch(alias, sheet.country.name)));
  const countryName = !sheet.country.name || sheetNameIsEntryAlias ? entry?.country_name ?? sheet.country.name : sheet.country.name;
  const aliases = mergeAliases(
    countryName,
    sheet.country.aliases ?? [],
    entry ? [entry.country_name, ...entry.aliases] : []
  );

  if (!countryName) {
    report.errors.push(
      reportError(
        "A stat sheet is missing its country name and its player aliases do not match the import bundle.",
        "Add a '# Country Name' heading or add a matching country alias entry to the stat-sheet import JSON."
      )
    );
  }

  return {
    ...sheet,
    country: {
      ...sheet.country,
      name: countryName,
      aliases
    }
  };
};

const applyAliasEntriesToCountries = (state: GameState, aliasEntries: StatSheetCountryAlias[]) => {
  if (aliasEntries.length === 0) return;
  state.countries = state.countries.map((country) => {
    const entry = matchingAliasEntry(aliasValuesForCountry(country), aliasEntries);
    if (!entry) return country;
    return {
      ...country,
      aliases: mergeAliases(country.name, country.aliases ?? [], [entry.country_name, ...entry.aliases])
    };
  });
};

const relationKey = (relation: DiplomaticRelation): string =>
  relation.relation_type === "Guarantee"
    ? `${relation.relation_type}:${relation.country_a_id}->${relation.country_b_id}`
    : `${relation.relation_type}:${[relation.country_a_id, relation.country_b_id].sort().join("::")}`;

const tradeKey = (trade: TradeRoute): string =>
  `${trade.sender_country_id}->${trade.receiver_country_id}:${trade.resource_type}:${trade.amount_per_turn}`;

const toRelations = (
  resolver: CountryResolver,
  sheet: ParsedStatSheet,
  countryId: string,
  report: StatSheetReport,
  turnNumber: number
): DiplomaticRelation[] =>
  sheet.diplomacy.flatMap((relation, index) => {
    const resolved = resolver.resolve(relation.counterpart_name);
    const counterpart = resolved.country;
    if (resolved.ambiguous) {
      report.errors.push(
        reportError(
          `Diplomacy relation reference ${relation.counterpart_name} matches more than one country.`,
          "Make that player/country alias unique in the imported save or stat-sheet alias map."
        )
      );
      return [];
    }
    if (!counterpart) {
      report.errors.push(
        reportError(
          `Diplomacy relation references unknown country ${relation.counterpart_name}.`,
          "Import that country in the same bundle or create it before importing this stat sheet."
        )
      );
      return [];
    }
    if (counterpart.id === countryId) return [];
    return [
      {
        id: `relation-${slug(countryId)}-${index + 1}-${slug(relation.relation_type)}-${slug(counterpart.id)}`,
        relation_type: relation.relation_type,
        country_a_id: countryId,
        country_b_id: counterpart.id,
        active: true,
        notes: relation.relation_type === "Guarantee" ? `${sheet.country.name} guarantees ${counterpart.name}` : "",
        graph_custom:
          relation.relation_type === "Guarantee"
            ? {
                enabled: true,
                line_type: "solid",
                color: "#8fb7ff",
                hover_text: `${sheet.country.name} guarantees ${counterpart.name}`,
                directed: true
              }
            : undefined,
        created_turn: turnNumber
      }
    ];
  });

const toTrades = (
  state: GameState,
  resolver: CountryResolver,
  sheet: ParsedStatSheet,
  countryId: string,
  report: StatSheetReport,
  turnNumber: number
): TradeRoute[] =>
  sheet.trades.flatMap((trade, index) => {
    const resolved = resolver.resolve(trade.counterpart_name);
    const counterpart = resolved.country;
    if (resolved.ambiguous) {
      report.errors.push(
        reportError(
          `Trade route reference ${trade.counterpart_name} matches more than one country.`,
          "Make that player/country alias unique in the imported save or stat-sheet alias map."
        )
      );
      return [];
    }
    if (!counterpart) {
      report.errors.push(
        reportError(
          `Trade route references unknown country ${trade.counterpart_name}.`,
          "Import that country in the same bundle or create it before importing this stat sheet."
        )
      );
      return [];
    }
    if (counterpart.id === countryId) return [];
    const senderId = trade.direction === "import" ? counterpart.id : countryId;
    const receiverId = trade.direction === "import" ? countryId : counterpart.id;
    return [
      {
        id: `trade-${slug(senderId)}-${slug(receiverId)}-${index + 1}-${slug(trade.resource_type)}`,
        sender_country_id: senderId,
        receiver_country_id: receiverId,
        resource_type: trade.resource_type,
        amount_per_turn: trade.amount_per_turn,
        payment_gold_per_turn: 0,
        recurring: true,
        route_type: "abstract",
        sea_transport_cost_per_unit: state.rules.settings.sea_transport_cost_per_unit_resource,
        sea_cost_payer: "sender",
        route_valid: true,
        blocked_by_embargo: false,
        active: true,
        notes: trade.notes ?? "",
        created_turn: turnNumber
      }
    ];
  });

const baselineTurnForImport = (turnNumber: number): number => turnNumber - 1;

const mergeReport = (bundle: StatSheetImportBundle): StatSheetReport => ({
  warnings: [...(bundle.report?.warnings ?? [])],
  errors: [...(bundle.report?.errors ?? [])]
});

export const applyStatSheetImport = (state: GameState, bundleValue: unknown): StatSheetImportResult => {
  const next = clone(state);

  if (!isBundle(bundleValue)) {
    const report = emptyReport();
    report.errors.push(
      reportError(
        "This file is not a stat-sheet import bundle.",
        "Choose a JSON file with kind \"gm-stat-sheet-import\" and version 1."
      )
    );
    return { applied: false, state, report };
  }

  const bundle = bundleValue;
  const report = mergeReport(bundle);
  if (report.errors.length > 0) {
    return { applied: false, state, report };
  }
  const aliasEntries = bundle.countryAliases ?? [];
  const sheets = bundle.sheets.map((sheet) => prepareSheet(sheet, aliasEntries, report));

  const seenNames = new Set<string>();
  for (const sheet of sheets) {
    if (!sheet.country.name) {
      report.errors.push(reportError("A stat sheet is missing its country name.", "Add a '# Country Name' heading."));
      continue;
    }
    const key = normalizeKey(sheet.country.name);
    if (seenNames.has(key)) {
      report.errors.push(
        reportError(
          `More than one stat sheet is named ${sheet.country.name}.`,
          "Rename one sheet or give it a distinct short name before importing."
        )
      );
      continue;
    }
    seenNames.add(key);
  }

  if (report.errors.length > 0) return { applied: false, state, report };

  const importedCountryIds = new Set<string>();
  const importedSheets: Array<{ sheet: ParsedStatSheet; countryId: string }> = [];

  for (const sheet of sheets) {
    const existing = findCountry(next, sheet);
    const country = existing ? mergeCountry(existing, sheet) : defaultCountry(sheet, next.turnNumber);
    const baselineTurn = baselineTurnForImport(next.turnNumber);
    importedCountryIds.add(country.id);
    importedSheets.push({ sheet, countryId: country.id });
    if (existing) {
      next.countries = next.countries.map((item) => (item.id === existing.id ? country : item));
    } else {
      next.countries = [...next.countries, country];
    }

    next.settlements = [
      ...next.settlements.filter((settlement) => settlement.country_id !== country.id),
      ...sheet.settlements.map((_, index) => toSettlement(sheet, country.id, index, baselineTurn))
    ];
    next.factories = [
      ...next.factories.filter((factory) => factory.country_id !== country.id),
      ...sheet.factories.map((_, index) => toFactory(sheet, next, country.id, index, baselineTurn))
    ];
    next.stockpiles = [
      ...next.stockpiles.filter((stockpile) => stockpile.country_id !== country.id),
      ...stockpilesForSheet(sheet, country.id)
    ];
    next.policies = [
      ...next.policies.filter((policy) => policy.country_id !== country.id),
      ...next.rules.policyCategories.map((category) => {
        const parsed = sheet.policies.find(
          (policy) => normalizeKey(policy.policy_category) === normalizeKey(category.category)
        );
        return {
          country_id: country.id,
          policy_category: category.category,
          selected_option: parsed?.selected_option ?? category.base_option,
          last_changed_turn: baselineTurn
        };
      })
    ];
  }

  applyAliasEntriesToCountries(next, aliasEntries);

  next.diplomacy = next.diplomacy.filter(
    (relation) => !importedCountryIds.has(relation.country_a_id) && !importedCountryIds.has(relation.country_b_id)
  );
  next.trades = next.trades.filter(
    (trade) => !importedCountryIds.has(trade.sender_country_id) && !importedCountryIds.has(trade.receiver_country_id)
  );

  const countryResolver = createCountryResolver(next.countries);
  const parsedRelations = importedSheets.flatMap(({ sheet, countryId }) =>
    toRelations(countryResolver, sheet, countryId, report, baselineTurnForImport(next.turnNumber))
  );
  const dedupedRelations = new Map<string, DiplomaticRelation>();
  parsedRelations.forEach((relation) => dedupedRelations.set(relationKey(relation), relation));
  next.diplomacy = [...next.diplomacy, ...dedupedRelations.values()];

  const parsedTrades = importedSheets.flatMap(({ sheet, countryId }) =>
    toTrades(next, countryResolver, sheet, countryId, report, baselineTurnForImport(next.turnNumber))
  );
  const dedupedTrades = new Map<string, TradeRoute>();
  parsedTrades.forEach((trade) => dedupedTrades.set(tradeKey(trade), trade));
  next.trades = [...next.trades, ...dedupedTrades.values()];

  if (report.errors.length > 0) return { applied: false, state, report };

  try {
    validateGameState(next);
  } catch (error) {
    report.errors.push(
      reportError(
        error instanceof Error ? error.message : "The imported stat sheets produced an invalid game state.",
        "Review the listed stat sheets, fix the named field, and import again."
      )
    );
    return { applied: false, state, report };
  }

  return { applied: true, state: next, report };
};
