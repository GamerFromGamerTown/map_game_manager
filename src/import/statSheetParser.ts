import { RESOURCE_TYPES, ResourceBag, ResourceType, SettlementTier, TradableType } from "../types";
import {
  ParsedStatSheetCountry,
  ParsedStatSheet,
  ParsedStatSheetFactory,
  ParsedStatSheetPolicy,
  ParsedStatSheetRelation,
  ParsedStatSheetSettlement,
  ParsedStatSheetTrade,
  StatSheetImportBundle,
  StatSheetIssue,
  StatSheetReport,
  StatSheetTextSource
} from "./statSheetTypes";

interface ParseContext {
  threadId?: string;
  messageId?: string;
  threadName?: string;
}

interface MutableParseResult {
  sheet: ParsedStatSheet;
  report: StatSheetReport;
}

const tierFromHeading: Record<string, SettlementTier> = {
  metropoles: "metropole",
  metropole: "metropole",
  "large cities": "large_city",
  "large city": "large_city",
  cities: "city",
  city: "city",
  villages: "village",
  village: "village"
};

const tierHeadingLabels = Object.keys(tierFromHeading);

const resourceAliases: Record<string, ResourceType> = {
  food: "food",
  wood: "wood",
  plank: "plank",
  planks: "plank",
  coal: "coal",
  iron: "iron",
  "iron part": "iron_parts",
  "iron parts": "iron_parts",
  bauxite: "bauxite",
  aluminium: "aluminium",
  aluminum: "aluminium",
  "aluminium part": "aluminium_parts",
  "aluminium parts": "aluminium_parts",
  "aluminum part": "aluminium_parts",
  "aluminum parts": "aluminium_parts",
  copper: "copper",
  "copper part": "copper_parts",
  "copper parts": "copper_parts",
  gold: "gold_ore",
  "gold ore": "gold_ore",
  "gold ingot": "gold_ingot",
  equipment: "equipment",
  "high quality equipment": "high_quality_equipment",
  "fine machinery": "fine_machinery",
  "tank part": "tank_parts",
  "tank parts": "tank_parts",
  "tank electronic": "tank_electronics",
  "tank electronics": "tank_electronics",
  tank: "tanks",
  tanks: "tanks",
  necessities: "necessities",
  supply: "supply"
};

const settlementCategoryTypes: Record<string, string> = {
  food: "stat_food",
  wood: "stat_wood",
  forest: "stat_wood",
  coal: "stat_coal",
  iron: "stat_iron",
  bauxite: "stat_bauxite",
  copper: "stat_copper",
  gold: "stat_gold",
  "food bauxite": "stat_food_bauxite",
  "bauxite food": "stat_food_bauxite",
  "food coal": "stat_food_coal",
  "coal food": "stat_food_coal",
  "food gold": "stat_food_gold",
  "gold food": "stat_food_gold"
};

const diplomacyLabelTypes: Record<string, string> = {
  war: "War",
  wars: "War",
  "military alliance": "Military Alliance",
  "military alliances": "Military Alliance",
  "defensive pact": "Defensive Pact",
  "defensive pacts": "Defensive Pact",
  "harbour access": "Harbour Access",
  "harbor access": "Harbour Access",
  "coastal fort protection": "Coastal Fort Protection",
  "coastal fort protections": "Coastal Fort Protection",
  "non aggression pact": "Non-Aggression Pact",
  "non aggression pacts": "Non-Aggression Pact",
  "nonaggression pact": "Non-Aggression Pact",
  "economic alliance": "Economic Alliance",
  "economic alliances": "Economic Alliance",
  "railway access": "Railway Access",
  "troop movement authorization": "Troop Movement Authorization",
  "troop movement authorisations": "Troop Movement Authorization",
  "troop movement authorizations": "Troop Movement Authorization",
  "troop passthrough authorization": "Troop Passthrough Authorization",
  "guarantee": "Guarantee",
  guarantees: "Guarantee",
  embargo: "Embargo",
  embargoes: "Embargo"
};

const emptyReport = (): StatSheetReport => ({ warnings: [], errors: [] });

const issue = (
  severity: "warning" | "error",
  message: string,
  suggestedFix: string,
  context: ParseContext,
  lineNumber?: number,
  sourceLine?: string,
  countryName?: string
): StatSheetIssue => ({
  severity,
  message,
  suggestedFix,
  threadId: context.threadId,
  lineNumber,
  sourceLine,
  countryName
});

const pushIssue = (report: StatSheetReport, item: StatSheetIssue) => {
  if (item.severity === "error") {
    report.errors.push(item);
  } else {
    report.warnings.push(item);
  }
};

const stripMarkdown = (value: string): string =>
  value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^#+\s*/, "")
    .trim();

const normalizeLabel = (value: string): string =>
  stripMarkdown(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const uniqueStrings = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const cleanAlias = (value: string): string | undefined => {
  const cleaned = stripMarkdown(value)
    .replace(/^<@!?/, "")
    .replace(/>$/, "")
    .replace(/^@+/, "")
    .replace(/[;,:]+$/g, "")
    .trim();
  return cleaned && !/^none$/i.test(cleaned) ? cleaned : undefined;
};

const parseStatBlockHeaderAliases = (line: string): string[] => {
  const clean = stripMarkdown(line);
  const match = clean.match(/^below\s+i[fs]\s+the\s+stat\s+block\s+of\s+(.+)$/i);
  if (!match) return [];
  return uniqueStrings(
    match[1]
      .split(/\s*,\s*|\s+\band\b\s+/i)
      .map((item) => cleanAlias(item) ?? "")
  );
};

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + cost
      );
    }
    previous = current;
  }
  return previous[right.length];
};

const fuzzyTierFromHeading = (line: string): SettlementTier | undefined => {
  const isMarkdownHeading = /^#+\s*/.test(line.trim());
  const normalized = normalizeLabel(line);
  const withoutTrailingCount = normalized.replace(/\s+\d+$/, "").trim();
  const exact = tierFromHeading[withoutTrailingCount] ?? tierFromHeading[normalized];
  if (exact) return exact;
  if (!isMarkdownHeading || !withoutTrailingCount) return undefined;

  let bestMatch: { label: string; distance: number } | undefined;
  for (const label of tierHeadingLabels) {
    const distance = levenshteinDistance(withoutTrailingCount, label);
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { label, distance };
    }
  }

  if (!bestMatch) return undefined;
  const maxDistance = withoutTrailingCount.length >= 8 ? 2 : 1;
  return bestMatch.distance <= maxDistance ? tierFromHeading[bestMatch.label] : undefined;
};

const parseNumber = (value: string): number | undefined => {
  const match = value.match(/[+-]?\d[\d., ]*/);
  if (!match) return undefined;
  const raw = match[0].trim().replace(/\s+/g, "");
  const thousandsStyle = raw.includes(".") && !raw.includes(",");
  const normalized = thousandsStyle ? raw.replace(/\./g, "") : raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

interface FieldValueOptions {
  plainValue?: "any" | "numeric" | "colon-only";
}

const fieldValue = (line: string, labels: string[], options: FieldValueOptions = {}): string | undefined => {
  const clean = stripMarkdown(line);
  const plainValue = options.plainValue ?? "any";
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const colon = clean.match(new RegExp(`^${escaped}\\s*:\\s*(.+)$`, "i"));
    if (colon) return colon[1].trim();

    if (plainValue === "colon-only") continue;
    const plain = clean.match(new RegExp(`^${escaped}\\s+(.+)$`, "i"));
    if (plain) {
      const value = plain[1].trim();
      if (plainValue === "numeric" && !/^[+-]?\s*\d/.test(value)) continue;
      return value;
    }
  }
  return undefined;
};

const resolveResource = (value: string): ResourceType | undefined => {
  const normalized = value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (resourceAliases[normalized]) return resourceAliases[normalized];
  const underscored = normalized.replace(/\s+/g, "_");
  return RESOURCE_TYPES.includes(underscored as ResourceType) ? (underscored as ResourceType) : undefined;
};

const parseResourceBag = (text: string): ResourceBag => {
  const bag: ResourceBag = {};
  const matcher = /([+-]?\d[\d., ]*)\s+([a-zA-Z][a-zA-Z _-]*?)(?=,|$|\)|\()/g;
  for (const match of text.matchAll(matcher)) {
    const amount = parseNumber(match[1]);
    const resource = resolveResource(match[2]);
    if (amount === undefined || !resource) continue;
    bag[resource] = Number(bag[resource] ?? 0) + amount;
  }
  return bag;
};

const resourceTypeForCategory = (category: string): string | undefined =>
  settlementCategoryTypes[normalizeLabel(category)];

const resourceTypeFromPositiveOutput = (line: string): string => {
  const bag = parseResourceBag(line);
  const hasFood = Number(bag.food ?? 0) > 0;
  const hasWood = Number(bag.wood ?? 0) > 0;
  const hasCoal = Number(bag.coal ?? 0) > 0;
  const hasIron = Number(bag.iron ?? 0) > 0;
  const hasBauxite = Number(bag.bauxite ?? 0) > 0;
  const hasCopper = Number(bag.copper ?? 0) > 0;
  const hasGold = Number(bag.gold_ore ?? 0) > 0;
  if (hasFood && hasBauxite) return "stat_food_bauxite";
  if (hasFood && hasCoal) return "stat_food_coal";
  if (hasFood && hasGold) return "stat_food_gold";
  if (hasWood) return "stat_wood";
  if (hasCoal) return "stat_coal";
  if (hasIron) return "stat_iron";
  if (hasBauxite) return "stat_bauxite";
  if (hasCopper) return "stat_copper";
  if (hasGold) return "stat_gold";
  if (hasFood) return "stat_food";
  return "stat_empty";
};

const upkeepOptionFromResourceText = (
  tier: SettlementTier,
  resourceText: string,
  context: ParseContext,
  report: StatSheetReport,
  lineNumber: number,
  sourceLine: string,
  countryName: string
): "A" | "B" | undefined => {
  if (tier === "village") return undefined;
  const bag = parseResourceBag(resourceText);
  const consumesAluminiumParts = Number(bag.aluminium_parts ?? 0) < 0;
  const consumesIronParts = Number(bag.iron_parts ?? 0) < 0;
  if (consumesAluminiumParts && consumesIronParts) {
    pushIssue(
      report,
      issue(
        "error",
        "Settlement line lists both aluminium-parts and iron-parts upkeep routes.",
        "Choose one upkeep route in the stat sheet line before importing.",
        context,
        lineNumber,
        sourceLine,
        countryName
      )
    );
    return undefined;
  }
  if (consumesIronParts) return "B";
  if (consumesAluminiumParts) return "A";
  return undefined;
};

const parseSettlement = (
  line: string,
  tier: SettlementTier,
  category: string,
  context: ParseContext,
  report: StatSheetReport,
  lineNumber: number,
  countryName: string
): ParsedStatSheetSettlement | null => {
  const clean = stripMarkdown(line);
  if (fuzzyTierFromHeading(line) || resourceTypeForCategory(clean.replace(/:$/, ""))) return null;
  const match = clean.match(/^(?:\d+\s*)?(?:\([^)]*\)\s*)?(.+?)(?::|-)\s*(.*)$/);
  if (!match) return null;
  const name = match[1].trim();
  if (!name || /^none$/i.test(name)) return null;
  const resourceText = match[2] ?? "";
  const unclosed = (line.match(/\(/g)?.length ?? 0) > (line.match(/\)/g)?.length ?? 0);
  if (unclosed) {
    pushIssue(
      report,
      issue(
        "warning",
        "Line has a missing closing parenthesis; parsed the settlement name and resources anyway.",
        "Add the missing ')' around the formula or status note.",
        context,
        lineNumber,
        line,
        countryName
      )
    );
  }
  return {
    name,
    tier,
    is_capital: /capital/i.test(line),
    biome_or_resource_type: resourceTypeForCategory(category) ?? resourceTypeFromPositiveOutput(resourceText || name),
    upkeep_option: upkeepOptionFromResourceText(tier, resourceText, context, report, lineNumber, line, countryName),
    notes: resourceText.trim()
  };
};

const parseFactory = (line: string): ParsedStatSheetFactory | null => {
  const clean = stripMarkdown(line);
  if (!clean || /^none$/i.test(clean) || /^#+?\s*constructions/i.test(clean)) return null;
  const match = clean.match(/^(?:\d+\s*)?(?:\([^)]*\)\s*)?([^:]+)(?::\s*(.*))?$/);
  if (!match) return null;
  const type = match[1].trim();
  if (!type || /^(food|wood|coal|iron|bauxite|copper|gold)$/i.test(type)) return null;
  const details = match[2] ?? "";
  return {
    type,
    active: !/inactive/i.test(details),
    damaged: /damaged/i.test(details),
    bombed: /bombed/i.test(details),
    notes: details.trim()
  };
};

const parsePolicy = (line: string): ParsedStatSheetPolicy | null => {
  const clean = stripMarkdown(line);
  const match = clean.match(/^([^:\[]+)(?:\s*\[[^\]]+\])?\s*:\s*([^:]+?)(?:\s*:\s*.*)?$/);
  if (!match) return null;
  const category = match[1].trim();
  const selected = match[2].trim();
  if (!category || !selected || /gain|loss/i.test(category)) return null;
  return { policy_category: category, selected_option: selected };
};

const splitListItems = (text: string): string[] =>
  text
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseTradeList = (
  text: string,
  direction: "import" | "export",
  context: ParseContext,
  report: StatSheetReport,
  lineNumber: number,
  sourceLine: string,
  countryName: string
): ParsedStatSheetTrade[] => {
  if (!text || /^none$/i.test(text)) return [];
  return splitListItems(text).flatMap((item) => {
    const match = item.match(/^([+-]?\d[\d., ]*)\s+(.+?)\s+(?:from|to)\s+(.+)$/i);
    if (!match) {
      pushIssue(
        report,
        issue(
          "warning",
          "Trade line could not be parsed.",
          "Use a format like '2 iron parts from Country' or '1 food to Country'.",
          context,
          lineNumber,
          sourceLine,
          countryName
        )
      );
      return [];
    }
    const amount = parseNumber(match[1]);
    const rawResource = match[2].trim();
    const resource = normalizeLabel(rawResource) === "gold" ? "gold" : resolveResource(rawResource);
    if (amount === undefined || !resource) {
      pushIssue(
        report,
        issue(
          "warning",
          "Trade line has an unknown resource or amount.",
          "Use a known resource name and a numeric amount.",
          context,
          lineNumber,
          sourceLine,
          countryName
        )
      );
      return [];
    }
    return [
      {
        direction,
        counterpart_name: match[3].trim(),
        resource_type: resource as TradableType,
        amount_per_turn: amount,
        notes: item
      }
    ];
  });
};

const parseDiplomacyLine = (line: string): ParsedStatSheetRelation[] => {
  const clean = stripMarkdown(line);
  const match = clean.match(/^([^:]+):\s*(.*)$/);
  if (!match) return [];
  const relationType = diplomacyLabelTypes[normalizeLabel(match[1])];
  if (!relationType || !match[2].trim() || /^none$/i.test(match[2].trim())) return [];
  return splitListItems(match[2]).map((counterpartName) => ({
    relation_type: relationType,
    counterpart_name: counterpartName
  }));
};

export const parseStatSheetText = (text: string, context: ParseContext = {}): MutableParseResult => {
  const report = emptyReport();
  const lines = text.split(/\r?\n/);
  const country: ParsedStatSheetCountry = {
    name: ""
  };
  const settlements: ParsedStatSheetSettlement[] = [];
  const factories: ParsedStatSheetFactory[] = [];
  const stockpiles: ResourceBag = {};
  const policies: ParsedStatSheetPolicy[] = [];
  const diplomacy: ParsedStatSheetRelation[] = [];
  const trades: ParsedStatSheetTrade[] = [];
  let section = "";
  let currentTier: SettlementTier = "village";
  let currentCategory = "";
  let sawStructuredStatContent = false;

  const addCountryAliases = (aliases: string[]) => {
    const combined = uniqueStrings([...(country.aliases ?? []), ...aliases]);
    if (combined.length > 0) {
      country.aliases = combined;
    }
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const clean = stripMarkdown(line);
    if (!clean) return;

    const statBlockAliases = parseStatBlockHeaderAliases(line);
    if (statBlockAliases.length > 0) {
      addCountryAliases(statBlockAliases);
      return;
    }

    if ((line.match(/\(/g)?.length ?? 0) > (line.match(/\)/g)?.length ?? 0)) {
      pushIssue(
        report,
        issue(
          "warning",
          "Line has a missing closing parenthesis; parsed the recognizable values anyway.",
          "Add the missing ')' to make the stat sheet easier to audit.",
          context,
          lineNumber,
          line,
          country.name || undefined
        )
      );
    }

    if (line.startsWith("# ") && !country.name && !sawStructuredStatContent) {
      country.name = clean;
      return;
    }

    const heading = normalizeLabel(line);
    const isKnownSectionHeading =
      heading === "settlements" ||
      heading === "constructions" ||
      heading === "resources" ||
      heading === "ideology policies" ||
      heading === "diplomatics" ||
      heading === "diplomacy";
    if (
      isKnownSectionHeading ||
      fuzzyTierFromHeading(line) ||
      resourceTypeForCategory(clean.replace(/:$/, "")) ||
      fieldValue(line, ["Gold", "Stability", "Ruling Party", "Ruling party"], { plainValue: "colon-only" })
    ) {
      sawStructuredStatContent = true;
    }
    if (heading === "settlements") {
      section = "settlements";
      return;
    }
    if (heading === "constructions") {
      section = "constructions";
      return;
    }
    if (heading === "resources") {
      section = "resources";
      return;
    }
    if (heading === "ideology policies") {
      section = "policies";
      return;
    }
    if (heading === "diplomatics" || heading === "diplomacy") {
      section = "diplomacy";
      return;
    }
    const tierHeading = fuzzyTierFromHeading(line);
    if (tierHeading) {
      section = "settlements";
      currentTier = tierHeading;
      currentCategory = "";
      return;
    }
    if (resourceTypeForCategory(clean.replace(/:$/, ""))) {
      currentCategory = clean.replace(/:$/, "");
      return;
    }

    const gold = fieldValue(line, ["Gold"], { plainValue: "numeric" });
    if (gold !== undefined) country.gold = parseNumber(gold);
    const stability = fieldValue(line, ["Stability", "Projected stability"], { plainValue: "numeric" });
    if (stability !== undefined) country.stability = parseNumber(stability);
    const rulingParty = fieldValue(line, ["Ruling Party", "Ruling party"]);
    if (rulingParty !== undefined) country.ruling_party = rulingParty.replace(/\s*\(.*/, "").trim();
    const reserve = fieldValue(line, ["Reserve"], { plainValue: "numeric" });
    if (reserve !== undefined) country.reserve = parseNumber(reserve);
    const equipment = fieldValue(line, ["Equipment Stockpile", "Equipment"], { plainValue: "numeric" });
    if (equipment !== undefined) country.equipment = parseNumber(equipment);
    const highQualityEquipment = fieldValue(line, ["High-quality equipment", "High quality equipment"], { plainValue: "numeric" });
    if (highQualityEquipment !== undefined) country.high_quality_equipment = parseNumber(highQualityEquipment);
    const tanks = fieldValue(line, ["Tanks"], { plainValue: "numeric" });
    if (tanks !== undefined) country.tanks = parseNumber(tanks);
    const supply = fieldValue(line, ["Supply"], { plainValue: "numeric" });
    if (supply !== undefined) country.supply = parseNumber(supply);
    const manpower = fieldValue(line, ["Manpower"], { plainValue: "numeric" });
    if (manpower !== undefined) country.manpower = parseNumber(manpower);
    const manpowerCap = fieldValue(line, ["Manpower cap"], { plainValue: "numeric" });
    if (manpowerCap !== undefined) country.manpower_cap = parseNumber(manpowerCap);

    const stockpileText = fieldValue(line, ["Resources stockpiled", "Current stockpile"]);
    if (stockpileText !== undefined) {
      Object.assign(stockpiles, parseResourceBag(stockpileText));
      section = "resources";
      return;
    }
    const importText = fieldValue(line, ["Trades to (imports) and amount", "Trades imports", "Imports"]);
    if (importText !== undefined) {
      trades.push(...parseTradeList(importText, "import", context, report, lineNumber, line, country.name));
      section = "resources";
      return;
    }
    const exportText = fieldValue(line, ["Trades to (exports) and amount", "Trades exports", "Exports"]);
    if (exportText !== undefined) {
      trades.push(...parseTradeList(exportText, "export", context, report, lineNumber, line, country.name));
      section = "resources";
      return;
    }

    if (section === "settlements") {
      const settlement = parseSettlement(line, currentTier, currentCategory, context, report, lineNumber, country.name);
      if (settlement) settlements.push(settlement);
    } else if (section === "constructions") {
      const factory = parseFactory(line);
      if (factory) factories.push(factory);
    } else if (section === "policies") {
      const policy = parsePolicy(line);
      if (policy) policies.push(policy);
    } else if (section === "diplomacy") {
      diplomacy.push(...parseDiplomacyLine(line));
    }
  });

  if (!country.name && context.threadName) {
    country.name = stripMarkdown(context.threadName);
    pushIssue(
      report,
      issue(
        "warning",
        "Could not find a country name heading in the sheet body; used the Discord thread title instead.",
        "Add a top-level Markdown heading like '# Country Name' at the start of the sheet body (or ensure the thread title matches the country).",
        context
      )
    );
  }

  if (!country.name && country.aliases?.length) {
    pushIssue(
      report,
      issue(
        "warning",
        "Could not find a country name heading in the sheet body; importer will resolve the stat-block owner from player aliases.",
        "Provide a matching country alias in the stat-sheet import bundle or add a country heading.",
        context
      )
    );
  } else if (!country.name) {
    pushIssue(
      report,
      issue(
        "error",
        "Could not find a country name in this stat sheet.",
        "Add a top-level Markdown heading like '# Country Name' at the start of the sheet.",
        context
      )
    );
  }

  return {
    sheet: {
      country,
      settlements,
      factories,
      stockpiles,
      policies,
      diplomacy,
      trades,
      rawText: text,
      threadId: context.threadId,
      messageId: context.messageId
    },
    report
  };
};

const mergeReports = (reports: StatSheetReport[]): StatSheetReport => ({
  warnings: reports.flatMap((report) => report.warnings),
  errors: reports.flatMap((report) => report.errors)
});

export const buildStatSheetBundleFromTexts = (sources: StatSheetTextSource[]): StatSheetImportBundle => {
  const parsed = sources.map((source) => parseStatSheetText(source.content, source));
  return {
    kind: "gm-stat-sheet-import",
    version: 1,
    source: {
      generatedAt: new Date().toISOString(),
      threads: sources.map((source) => ({
        threadId: source.threadId ?? "",
        url: source.url,
        messageCount: source.messageCount ?? 1
      }))
    },
    sheets: parsed.map((item) => item.sheet),
    report: mergeReports(parsed.map((item) => item.report))
  };
};
