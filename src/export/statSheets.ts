import {
  Country,
  CountryPreview,
  Factory,
  GameState,
  PolicyCategoryRule,
  PolicyOptionRule,
  RESOURCE_TYPES,
  ResourceBag,
  ResourceType,
  Settlement,
  SettlementTier,
  TurnPreview
} from "../types";
import { previewNextTurn, stockpileForCountry } from "../engine/calculations";
import { findFactoryRule } from "../rules/factoryRules";
import { countryShortName } from "../utils/names";

type SheetFormat = "polished" | "verbatim";
type SettlementCategory = "Food" | "Wood" | "Coal" | "Iron" | "Bauxite" | "Copper" | "Gold";

const settlementCategories: SettlementCategory[] = ["Food", "Wood", "Coal", "Iron", "Bauxite", "Copper", "Gold"];
const tierOrder: SettlementTier[] = ["metropole", "large_city", "city", "village"];
const basicResources: ResourceType[] = ["food", "wood", "coal", "iron", "bauxite", "copper", "gold_ore"];

const tierLabels: Record<SettlementTier, string> = {
  metropole: "Metropoles",
  large_city: "Large cities",
  city: "Cities",
  village: "Villages"
};

const formulaTierOrder: SettlementTier[] = ["village", "city", "large_city", "metropole"];

const resourceLabels: Record<string, string> = {
  food: "food",
  wood: "wood",
  plank: "plank",
  coal: "coal",
  iron: "iron",
  iron_parts: "iron parts",
  bauxite: "bauxite",
  aluminium: "aluminium",
  aluminium_parts: "aluminium parts",
  copper: "copper",
  copper_parts: "copper parts",
  gold_ore: "gold",
  gold_ingot: "gold ingot",
  equipment: "equipment",
  high_quality_equipment: "high quality equipment",
  fine_machinery: "fine machinery",
  tank_parts: "tank parts",
  tank_electronics: "tank electronics",
  tanks: "tanks",
  necessities: "necessities",
  supply: "supply",
  gold: "gold"
};

const relationLabels: Record<string, string> = {
  War: "Wars",
  "Military Alliance": "Military alliances",
  "Defensive Pact": "Defensive pacts",
  "Harbour Access": "Harbour access",
  "Coastal Fort Protection": "Coastal fort protections",
  "Non-Aggression Pact": "Non aggression pacts",
  "Economic Alliance": "Economic alliances",
  "Railway Access": "Railway access",
  "Troop Movement Authorization": "Troop movement authorisations",
  "Troop Passthrough Authorization": "Troop movement authorisations",
  Guarantee: "Guarantee"
};

const formatNumber = (value: number): string => {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded).toLocaleString("de-DE")}`;
};

const formatSignedNumber = (value: number): string => `${value >= 0 ? "+" : "-"}${formatNumber(Math.abs(value))}`;

const rulePartyName = (party: string): string => (party === "Democratic" ? "Democracy" : party);

const resourceLabel = (resource: string): string => resourceLabels[resource] ?? resource.split("_").join(" ");

const formatBag = (bag: ResourceBag, resources: ResourceType[] = RESOURCE_TYPES as unknown as ResourceType[]): string => {
  const entries = resources
    .map((resource) => [resource, Number(bag[resource] ?? 0)] as const)
    .filter(([, amount]) => amount !== 0);
  if (entries.length === 0) return "None";
  return entries.map(([resource, amount]) => `${formatSignedNumber(amount)} ${resourceLabel(resource)}`).join(", ");
};

const formatUnsignedBag = (bag: ResourceBag, resources: ResourceType[] = basicResources): string =>
  resources.map((resource) => `${formatNumber(Number(bag[resource] ?? 0))} ${resourceLabel(resource)}`).join(", ");

const compactParts = (parts: string[]): string => parts.filter(Boolean).join(" ");

const getCountryPreview = (preview: TurnPreview, countryId: string): CountryPreview =>
  preview.countries.find((item) => item.countryId === countryId) ??
  (() => {
    throw new Error(`Missing preview for ${countryId}`);
  })();

const selectedPolicy = (
  state: GameState,
  countryId: string,
  category: PolicyCategoryRule
): PolicyOptionRule | undefined => {
  const selected =
    state.policies.find((item) => item.country_id === countryId && item.policy_category === category.category)
      ?.selected_option ?? category.base_option;
  return category.options.find((option) => option.name === selected);
};

const isAgricultural = (state: GameState, countryId: string): boolean => {
  const category = state.rules.policyCategories.find((item) => item.category === "Economical Focus");
  return Boolean(category && selectedPolicy(state, countryId, category)?.name === "Agricultural");
};

const settlementCategory = (settlement: Settlement): SettlementCategory => {
  const biome = settlement.biome_or_resource_type;
  if (biome.includes("wood") || biome.includes("forest") || biome.includes("jungle")) return "Wood";
  if (biome.includes("coal")) return "Coal";
  if (biome.includes("iron")) return "Iron";
  if (biome.includes("bauxite")) return "Bauxite";
  if (biome.includes("copper")) return "Copper";
  if (biome.includes("gold")) return "Gold";
  return "Food";
};

const settlementProduction = (state: GameState, settlement: Settlement): ResourceBag => {
  const tierRule = state.rules.settlementTiers[settlement.tier];
  const base = state.rules.resourceProduction[settlement.biome_or_resource_type] ?? {};
  const produced: ResourceBag = {};
  const agricultural = isAgricultural(state, settlement.country_id);
  Object.entries(base).forEach(([resource, amount]) => {
    if (resource === "cannot_be_settled" || typeof amount !== "number" || amount === 0) return;
    produced[resource as ResourceType] =
      amount * tierRule.tier_multiplier * (agricultural && resource === "food" ? 2 : 1);
  });
  return produced;
};

const addBag = (target: ResourceBag, source: ResourceBag) => {
  Object.entries(source).forEach(([resource, amount]) => {
    target[resource as ResourceType] = Number(target[resource as ResourceType] ?? 0) + Number(amount ?? 0);
  });
};

const negateBag = (bag: ResourceBag): ResourceBag =>
  Object.fromEntries(Object.entries(bag).map(([resource, amount]) => [resource, -Number(amount ?? 0)])) as ResourceBag;

const formulaForTierValue = (
  state: GameState,
  settlements: Settlement[],
  field: "gold_per_turn" | "manpower_gain_per_turn" | "manpower_cap_bonus"
): { formula: string; total: number } => {
  const parts: string[] = [];
  let total = 0;
  formulaTierOrder.forEach((tier) => {
    const count = settlements.filter((settlement) => settlement.tier === tier).length;
    if (count === 0) return;
    const value = state.rules.settlementTiers[tier][field];
    total += count * value;
    parts.push(`${count} X ${formatNumber(value)}`);
  });
  return { formula: parts.join(" + "), total };
};

const policyEffectParts = (state: GameState, countryId: string, type: "gold" | "stability" | "manpower"): string[] =>
  state.rules.policyCategories.flatMap((category) => {
    const option = selectedPolicy(state, countryId, category);
    const value =
      type === "gold"
        ? option?.gold_per_turn ?? 0
        : type === "stability"
          ? option?.stability_per_turn ?? 0
          : option?.manpower_per_turn ?? 0;
    return value === 0 ? [] : [`${formatSignedNumber(value)}(${category.abbreviation})`];
  });

const policyEffectTotal = (state: GameState, countryId: string, type: "gold" | "stability" | "manpower"): number =>
  state.rules.policyCategories.reduce((sum, category) => {
    const option = selectedPolicy(state, countryId, category);
    if (type === "gold") return sum + (option?.gold_per_turn ?? 0);
    if (type === "stability") return sum + (option?.stability_per_turn ?? 0);
    return sum + (option?.manpower_per_turn ?? 0);
  }, 0);

const policyDescription = (option?: PolicyOptionRule): string => {
  if (!option) return "Nothing";
  const parts = [
    option.gold_per_turn ? `${formatSignedNumber(option.gold_per_turn)} gold per turn` : "",
    option.stability_per_turn ? `${formatSignedNumber(option.stability_per_turn)} stability per turn` : "",
    option.manpower_per_turn ? `${formatSignedNumber(option.manpower_per_turn)} manpower per turn` : "",
    option.special ? option.special : ""
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Nothing";
};

const relationsFor = (state: GameState, country: Country, relationType: string): string => {
  const names = state.diplomacy
    .filter(
      (relation) =>
        relation.active &&
        relation.relation_type === relationType &&
        (relation.country_a_id === country.id || relation.country_b_id === country.id)
    )
    .map((relation) => {
      const otherId = relation.country_a_id === country.id ? relation.country_b_id : relation.country_a_id;
      return countryShortName(state, otherId);
    });
  return names.length > 0 ? names.join(", ") : "";
};

const tradeLines = (state: GameState, country: Country, direction: "imports" | "exports"): string => {
  const rows = state.trades.filter((trade) =>
    direction === "imports" ? trade.receiver_country_id === country.id : trade.sender_country_id === country.id
  );
  if (rows.length === 0) return "";
  return rows
    .map((trade) => {
      const otherId = direction === "imports" ? trade.sender_country_id : trade.receiver_country_id;
      return `${formatNumber(trade.amount_per_turn)} ${resourceLabel(trade.resource_type)} ${direction === "imports" ? "from" : "to"} ${countryShortName(state, otherId)}`;
    })
    .join(", ");
};

const constructionLine = (state: GameState, factory: Factory, index: number): string => {
  const rule = findFactoryRule(state.rules, factory.type);
  const inputs = rule ? formatBag(negateBag(rule.inputs_per_turn)) : "unknown inputs";
  const outputs = rule ? formatBag(rule.outputs_per_turn as ResourceBag) : "unknown outputs";
  const flags = [factory.active ? "" : "inactive", factory.damaged ? "damaged" : "", factory.bombed ? "bombed" : ""].filter(Boolean);
  return `${index} (0) ${factory.type}: ${inputs}, ${outputs}${flags.length ? ` (${flags.join(", ")})` : ""}`;
};

const settlementLine = (state: GameState, settlement: Settlement, index: number): string => {
  const tierRule = state.rules.settlementTiers[settlement.tier];
  const production = settlementProduction(state, settlement);
  const upkeep = tierRule.upkeep[settlement.upkeep_option ?? "A"] ?? {};
  const productionText = formatBag(production);
  const upkeepText = formatBag(negateBag(upkeep));
  const resourceText = [productionText === "None" ? "" : productionText, upkeepText === "None" ? "" : upkeepText].filter(Boolean).join(", ");
  return `${index} (+${formatNumber(tierRule.gold_per_turn)}) ${settlement.name}: ${resourceText || "No resources"}${settlement.is_capital ? " (Capital)" : ""}`;
};

const countrySettlements = (state: GameState, country: Country): Settlement[] =>
  state.settlements.filter((settlement) => settlement.country_id === country.id);

const countryFactories = (state: GameState, country: Country): Factory[] =>
  state.factories.filter((factory) => factory.country_id === country.id);

const currentAndProducedBasicResources = (state: GameState, country: Country, preview: CountryPreview) => {
  const stockpile = stockpileForCountry(state, country.id);
  const produced: ResourceBag = {};
  countrySettlements(state, country).forEach((settlement) => addBag(produced, settlementProduction(state, settlement)));
  return {
    stockpile: formatUnsignedBag(stockpile),
    produced: formatUnsignedBag(produced),
    net: formatBag(preview.resourceDelta)
  };
};

const buildGoldFormula = (state: GameState, country: Country, preview: CountryPreview): string => {
  const settlements = countrySettlements(state, country);
  const settlementFormula = formulaForTierValue(state, settlements, "gold_per_turn");
  const parts = [
    settlementFormula.formula ? `( ${settlementFormula.formula} = ${formatNumber(settlementFormula.total)} )` : "",
    preview.policyGold ? `${formatSignedNumber(preview.policyGold)}(ideology)` : "",
    preview.rulingPartyGold ? `${formatSignedNumber(preview.rulingPartyGold)}(party)` : "",
    preview.capitalGold ? `${formatSignedNumber(preview.capitalGold)}(Capital)` : "",
    preview.bankGold ? `${formatSignedNumber(preview.bankGold)}(factories)` : "",
    preview.stabilityBandGold ? `${formatSignedNumber(preview.stabilityBandGold)}(stability)` : "",
    preview.tradeGoldNet ? `${formatSignedNumber(preview.tradeGoldNet)}(trade)` : "",
    preview.puppetTributePaid ? `-${formatNumber(preview.puppetTributePaid)}(puppet tribute)` : "",
    preview.puppetTributeReceived ? `+${formatNumber(preview.puppetTributeReceived)}(puppet tribute)` : ""
  ].filter(Boolean);
  return `${parts.join(" ")} = ${formatNumber(preview.goldDelta)}`;
};

const buildManpowerGainFormula = (state: GameState, country: Country, preview: CountryPreview): string => {
  const settlementFormula = formulaForTierValue(state, countrySettlements(state, country), "manpower_gain_per_turn");
  const policy = policyEffectParts(state, country.id, "manpower").join(" ");
  return `${settlementFormula.formula ? `( ${settlementFormula.formula} = ${formatNumber(settlementFormula.total)} ) ` : ""}+${formatNumber(state.rules.settings.base_manpower_gain_per_turn)}(base)${policy ? ` ${policy}` : ""} = ${formatNumber(preview.manpowerGain)}`;
};

const buildManpowerCapFormula = (state: GameState, country: Country, preview: CountryPreview): string => {
  const settlementFormula = formulaForTierValue(state, countrySettlements(state, country), "manpower_cap_bonus");
  return `${settlementFormula.formula ? `( ${settlementFormula.formula} = ${formatNumber(settlementFormula.total)} ) ` : ""}+${formatNumber(state.rules.settings.base_manpower_cap)}(base) = ${formatNumber(preview.manpowerCapAfter)}`;
};

const buildStabilityFormula = (state: GameState, preview: CountryPreview): string => {
  const breakdown = preview.formulaBreakdown.stability as Record<string, number> | undefined;
  return compactParts([
    `${formatSignedNumber(breakdown?.base ?? state.rules.stabilityRules.base_stability_gain_per_turn)}(base)`,
    `${formatSignedNumber(breakdown?.policy ?? 0)}(ideo)`,
    `${formatSignedNumber(breakdown?.rulingParty ?? 0)}(Party)`,
    (breakdown?.peace ?? 0) ? `${formatSignedNumber(breakdown?.peace ?? 0)}(Peace)` : "",
    `${formatSignedNumber(breakdown?.necessities ?? 0)}(Necessities)`
  ]);
};

const renderSettlements = (state: GameState, country: Country): string[] => {
  const settlements = countrySettlements(state, country);
  const lines: string[] = ["## Settlements:"];
  tierOrder.forEach((tier) => {
    lines.push("", `### ${tierLabels[tier]}:`);
    settlementCategories.forEach((category) => {
      const rows = settlements.filter((settlement) => settlement.tier === tier && settlementCategory(settlement) === category);
      lines.push(`**${category}:**`);
      rows.forEach((settlement, index) => lines.push(settlementLine(state, settlement, index + 1)));
    });
  });
  return lines;
};

const renderConstructions = (state: GameState, country: Country): string[] => {
  const factories = countryFactories(state, country);
  return ["### Constructions:", ...(factories.length ? factories.map((factory, index) => constructionLine(state, factory, index + 1)) : ["None"])];
};

const renderPolicies = (state: GameState, country: Country): string[] => {
  const goldParts = policyEffectParts(state, country.id, "gold");
  const stabilityParts = policyEffectParts(state, country.id, "stability");
  const lines = [
    "## Ideology policies:",
    "",
    `Gold gain/loss: ${goldParts.length ? `${goldParts.join(" ")} = ${formatSignedNumber(policyEffectTotal(state, country.id, "gold"))}` : "Nothing"}`,
    `Stability gain/loss: ${stabilityParts.length ? stabilityParts.join(" ") : "Nothing"}`,
    ""
  ];
  state.rules.policyCategories.forEach((category) => {
    const option = selectedPolicy(state, country.id, category);
    lines.push(`**${category.category} [${category.abbreviation}]:** ${option?.name ?? category.base_option}: ${policyDescription(option)}`);
  });
  return lines;
};

const renderDiplomacy = (state: GameState, country: Country): string[] => {
  const relationTypes = [
    "War",
    "Military Alliance",
    "Defensive Pact",
    "Harbour Access",
    "Coastal Fort Protection",
    "Non-Aggression Pact",
    "Economic Alliance",
    "Railway Access",
    "Troop Movement Authorization",
    "Guarantee"
  ];
  return [
    "## Diplomatics",
    "",
    ...relationTypes.map((type) => `**${relationLabels[type]}:** ${relationsFor(state, country, type)}`)
  ];
};

export const renderVerbatimCountryStatSheet = (
  state: GameState,
  country: Country,
  preview: TurnPreview = previewNextTurn(state)
): string => {
  const countryPreview = getCountryPreview(preview, country.id);
  const resources = currentAndProducedBasicResources(state, country, countryPreview);
  const lines = [
    `# ${country.name}`,
    "",
    "## Main Statistics",
    "",
    `**Gold:** ${formatNumber(countryPreview.goldAfter)} (Income: ${buildGoldFormula(state, country, countryPreview)})`,
    `**Stability:** ${formatNumber(countryPreview.stabilityAfter)}/${formatNumber(countryPreview.stabilityCap)} ${buildStabilityFormula(state, countryPreview)}`,
    `**Ruling Party:** ${rulePartyName(country.ruling_party)}`,
    "",
    `**Reserve:** ${formatNumber(country.reserve)}/${formatNumber(countryPreview.reserveCap)} (Cap: manpower cap X ${formatNumber(state.rules.settings.reserve_cap_multiplier)})`,
    `**Equipment Stockpile:** ${formatNumber(countryPreview.resourcesAfter.equipment ?? country.equipment)} (Gain: ${formatSignedNumber(countryPreview.resourceDelta.equipment ?? 0)})`,
    `**Manpower:** ${formatNumber(countryPreview.manpowerAfter)} (Gain: ${buildManpowerGainFormula(state, country, countryPreview)})`,
    `**Manpower cap:** ${formatNumber(countryPreview.manpowerCapAfter)} (Cap: ${buildManpowerCapFormula(state, country, countryPreview)})`,
    `**Necessities:** ${formatNumber(countryPreview.necessitiesProduced)}/${formatNumber(countryPreview.necessitiesRequired)} available (1 needed per ${formatNumber(state.rules.settings.necessities_manpower_cap_divisor)} manpower cap)`,
    "",
    ...renderSettlements(state, country),
    ...renderConstructions(state, country),
    "",
    "## Resources:",
    "",
    `**Resources stockpiled:** ${resources.stockpile}`,
    `**Resources gained by turn:** ${resources.produced}`,
    `**Net resources after factories/trades/upkeep:** ${resources.net}`,
    `**Trades to (imports) and amount:** ${tradeLines(state, country, "imports")}`,
    `**Trades to (exports) and amount:** ${tradeLines(state, country, "exports")}`,
    "",
    ...renderPolicies(state, country),
    "",
    ...renderDiplomacy(state, country)
  ];
  return lines.join("\n").trim();
};

const renderPolishedCountryStatSheet = (
  state: GameState,
  country: Country,
  preview: TurnPreview = previewNextTurn(state)
): string => {
  const countryPreview = getCountryPreview(preview, country.id);
  const resources = currentAndProducedBasicResources(state, country, countryPreview);
  return [
    `# ${country.name}`,
    "",
    `**Player country:** ${country.is_player_country ? "Yes" : "No"}`,
    `**Ruling party:** ${rulePartyName(country.ruling_party)}`,
    `**Projected gold:** ${formatNumber(country.gold)} -> ${formatNumber(countryPreview.goldAfter)} (${formatSignedNumber(countryPreview.goldDelta)})`,
    `**Projected stability:** ${formatNumber(country.stability)}/${formatNumber(countryPreview.stabilityCap)} -> ${formatNumber(countryPreview.stabilityAfter)}/${formatNumber(countryPreview.stabilityCap)} (${formatSignedNumber(countryPreview.stabilityDelta)})`,
    `**Projected manpower:** ${formatNumber(country.manpower)} -> ${formatNumber(countryPreview.manpowerAfter)} (${formatSignedNumber(countryPreview.manpowerGain)})`,
    `**Manpower cap:** ${formatNumber(countryPreview.manpowerCapAfter)}; **Reserve:** ${formatNumber(country.reserve)}/${formatNumber(countryPreview.reserveCap)}`,
    `**Necessities:** ${formatNumber(countryPreview.necessitiesProduced)}/${formatNumber(countryPreview.necessitiesRequired)} available (${countryPreview.necessitiesMet ? "met" : "not met"})`,
    "",
    "## Gold breakdown",
    "",
    `**Net gold:** ${formatNumber(countryPreview.goldDelta)}`,
    `**Gross income:** ${formatNumber(countryPreview.grossGoldIncome)}`,
    `**Formula:** ${buildGoldFormula(state, country, countryPreview)}`,
    "",
    "## Stability breakdown",
    "",
    `**Formula:** ${buildStabilityFormula(state, countryPreview)} = ${formatSignedNumber(countryPreview.stabilityDelta)}`,
    "",
    "## Resources",
    "",
    `**Current stockpile:** ${resources.stockpile}`,
    `**Settlement production:** ${resources.produced}`,
    `**Turn total:** ${resources.net}`,
    "",
    "## Settlements and constructions",
    "",
    ...renderSettlements(state, country),
    ...renderConstructions(state, country),
    "",
    ...renderPolicies(state, country),
    "",
    ...renderDiplomacy(state, country)
  ].join("\n").trim();
};

export const renderAllCountryStatSheets = (state: GameState, format: SheetFormat): string => {
  const preview = previewNextTurn(state);
  return state.countries
    .map((country) =>
      format === "polished"
        ? renderPolishedCountryStatSheet(state, country, preview)
        : renderVerbatimCountryStatSheet(state, country, preview)
    )
    .join("\n\n---\n\n");
};
