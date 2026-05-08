import { GameState, TurnPreview } from "../types";

export type WarningSeverity = "error" | "warning" | "info";
export type WarningEntityType =
  | "country"
  | "settlement"
  | "factory"
  | "resource"
  | "trade"
  | "diplomacy"
  | "puppet"
  | "operation"
  | "rules"
  | "global";

export type WarningCountryTab =
  | "Overview"
  | "Settlements"
  | "Production"
  | "Policies"
  | "Trade/Diplomacy"
  | "Military"
  | "Dice/History";

export type WarningRulesSection =
  | "settings"
  | "settlementTiers"
  | "resourceProduction"
  | "factoryRules"
  | "policyCategories"
  | "rulingParties"
  | "stabilityRules"
  | "diplomacyRelationTypes"
  | "puppetTypes"
  | "dice";

export interface WarningTarget {
  view: "dashboard" | "country" | "rules" | "graph" | "dice";
  label: string;
  countryId?: string;
  countryTab?: WarningCountryTab;
  rulesSection?: WarningRulesSection;
  entityId?: string;
  focusId?: string;
}

export interface NormalizedWarning {
  id: string;
  severity: WarningSeverity;
  countryId?: string;
  countryName?: string;
  entityType: WarningEntityType;
  entityId?: string;
  fieldPath: string;
  message: string;
  recommendedAction: string;
  sourceMessage: string;
  target: WarningTarget;
}

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

const humanizeResource = (value: string): string => value.replace(/_/g, " ");

const warningId = (
  countryId: string | undefined,
  entityType: WarningEntityType,
  fieldPath: string,
  message: string,
  index: number
): string => [countryId ?? "global", entityType, slug(fieldPath), slug(message), index].filter(Boolean).join(":");

export const focusIdForResource = (countryId: string, resource: string): string =>
  `resource-${countryId}-${resource}`;

export const focusIdForSettlement = (settlementId: string): string => `settlement-${settlementId}`;

export const focusIdForFactory = (factoryId: string): string => `factory-${factoryId}`;

const countryTarget = (
  label: string,
  countryId: string,
  countryTab: WarningCountryTab,
  focusId?: string,
  entityId?: string
): WarningTarget => ({
  view: "country",
  label,
  countryId,
  countryTab,
  focusId,
  entityId
});

const rulesTarget = (label: string, rulesSection: WarningRulesSection, focusId?: string): WarningTarget => ({
  view: "rules",
  label,
  rulesSection,
  focusId
});

const findSettlementByName = (state: GameState, countryId: string, name: string) =>
  state.settlements.find(
    (settlement) => settlement.country_id === countryId && settlement.name.toLowerCase() === name.toLowerCase()
  );

const findFactoryByType = (state: GameState, countryId: string, type: string) =>
  state.factories.find((factory) => factory.country_id === countryId && factory.type === type);

const findOperationByName = (state: GameState, countryId: string, name: string) =>
  state.operations.find(
    (operation) =>
      operation.name.toLowerCase() === name.toLowerCase() &&
      (operation.attacker_country_id === countryId || operation.defender_country_id === countryId)
  );

const parseMissingAmount = (source: string): number | null => {
  const match = source.match(/:\s*(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.max(0, Number(match[2]) - Number(match[1]));
};

const normalizeGlobalWarning = (state: GameState, sourceMessage: string, index: number): NormalizedWarning => {
  let severity: WarningSeverity = "warning";
  let entityType: WarningEntityType = "diplomacy";
  let fieldPath = "diplomacy";
  let message = sourceMessage;
  let recommendedAction = "Open the relations graph and resolve the conflicting relation or mark the exception in notes.";
  let target: WarningTarget = {
    view: "graph",
    label: "Open relations graph"
  };

  const routeMatch = sourceMessage.match(/Trade route ([^ ]+) appears affected by an embargo/i);
  if (routeMatch) {
    const route = state.trades.find((trade) => trade.id === routeMatch[1]);
    severity = "warning";
    entityType = "trade";
    fieldPath = "trades.blocked_by_embargo";
    message = `Trade route ${routeMatch[1]} may be blocked by an embargo but is not marked blocked.`;
    recommendedAction = "Open the trade row and either mark it blocked by embargo or remove the conflicting embargo.";
    target = route
      ? countryTarget(
          "Open trade route",
          route.sender_country_id,
          "Trade/Diplomacy",
          `trade-${route.id}`,
          route.id
        )
      : { view: "graph", label: "Open relations graph" };
  } else if (/non-aggression pact and war/i.test(sourceMessage)) {
    severity = "error";
    fieldPath = "diplomacy.relation_type";
    message = "War and non-aggression pact exist for the same country pair.";
    recommendedAction = "Remove one of the conflicting relations or mark one inactive before committing the turn.";
  } else if (/war on a puppet/i.test(sourceMessage)) {
    fieldPath = "puppets.master_country_id";
    message = "War against a puppet may also require a matching war against its master.";
    recommendedAction = "Open diplomacy, confirm the master relation, and add or adjust the required war relation.";
  } else if (/alliance|defensive pact/i.test(sourceMessage)) {
    fieldPath = "diplomacy.relation_type";
    recommendedAction = "Review alliance and pact relations in the graph before committing war-state changes.";
  }

  return {
    id: warningId(undefined, entityType, fieldPath, sourceMessage, index),
    severity,
    entityType,
    fieldPath,
    message,
    recommendedAction,
    sourceMessage,
    target
  };
};

const normalizeCountryWarning = (
  state: GameState,
  countryId: string,
  countryName: string,
  sourceMessage: string,
  index: number
): NormalizedWarning => {
  let severity: WarningSeverity = "warning";
  let entityType: WarningEntityType = "country";
  let entityId: string | undefined = countryId;
  let fieldPath = "country";
  let message = sourceMessage;
  let recommendedAction = "Open the country sheet and resolve the highlighted field before committing.";
  let target = countryTarget("Open country overview", countryId, "Overview", `country-${countryId}-overview`, countryId);

  const necessitiesMatch = sourceMessage.match(/Necessities not met: ([^/]+)\/([^.]+)\./);
  if (necessitiesMatch) {
    const missing = parseMissingAmount(sourceMessage) ?? 0;
    severity = "error";
    entityType = "resource";
    entityId = "necessities";
    fieldPath = "stockpiles.necessities";
    message = `Missing ${missing} necessities for next turn (${necessitiesMatch[1]}/${necessitiesMatch[2]} available).`;
    recommendedAction =
      "Add necessities in Production, activate or build necessities production, or adjust imports before committing.";
    target = countryTarget(
      "Fix necessities stockpile",
      countryId,
      "Production",
      focusIdForResource(countryId, "necessities"),
      "necessities"
    );
  } else {
    const upkeepMatch = sourceMessage.match(/^(.+) missing upkeep: (.+)\.$/);
    const disconnectedMatch = sourceMessage.match(/^(.+) is not connected for upkeep\.$/);
    const cannotSettleMatch = sourceMessage.match(/^(.+) uses a biome marked cannot be settled\.$/);
    const factoryMissingMatch = sourceMessage.match(/^(.+) missing inputs: (.+)\.$/);
    const factoryDisabledMatch = sourceMessage.match(/^(.+) is damaged or bombed and produces nothing\.$/);
    const factoryRulesMatch = sourceMessage.match(/^Factory type "(.+)" is missing from rules\.$/);
    const tradeMatch = sourceMessage.match(/(?:trade route|trade|Sender lacks|Sea trade|blocked by embargo|Inactive trade route|Invalid trade route)/i);
    const operationSupplyMatch = sourceMessage.match(/^(.+) has insufficient supply:/);

    if (upkeepMatch || disconnectedMatch || cannotSettleMatch) {
      const name = (upkeepMatch ?? disconnectedMatch ?? cannotSettleMatch)?.[1] ?? "";
      const settlement = findSettlementByName(state, countryId, name);
      severity = upkeepMatch || disconnectedMatch ? "error" : "warning";
      entityType = "settlement";
      entityId = settlement?.id ?? name;
      fieldPath = disconnectedMatch ? "settlements.connected_for_upkeep" : "settlements.upkeep";
      message = upkeepMatch
        ? `${name} lacks required upkeep resources: ${upkeepMatch[2]}.`
        : disconnectedMatch
          ? `${name} is disconnected for upkeep and cannot consume required resources.`
          : `${name} uses a biome that rules mark as not settleable.`;
      recommendedAction = disconnectedMatch
        ? "Open Settlements and mark the settlement connected, or adjust the settlement/rule if it should stay disconnected."
        : "Open Settlements and add imports/resources, change upkeep option, or repair the settlement before committing.";
      target = countryTarget(
        "Open settlement row",
        countryId,
        "Settlements",
        settlement ? focusIdForSettlement(settlement.id) : undefined,
        settlement?.id
      );
    } else if (factoryMissingMatch || factoryDisabledMatch) {
      const type = (factoryMissingMatch ?? factoryDisabledMatch)?.[1] ?? "";
      const factory = findFactoryByType(state, countryId, type);
      severity = factoryMissingMatch ? "error" : "warning";
      entityType = "factory";
      entityId = factory?.id ?? type;
      fieldPath = factoryMissingMatch ? "factories.inputs_per_turn" : "factories.active_status";
      message = factoryMissingMatch
        ? `${type} cannot run because inputs are short: ${factoryMissingMatch[2]}.`
        : `${type} is damaged or bombed and will not produce this turn.`;
      recommendedAction = factoryMissingMatch
        ? "Open Production and add the missing inputs, disable the factory, or adjust trade before committing."
        : "Open Production and repair the factory or mark it inactive if the outage is intentional.";
      target = countryTarget(
        "Open factory row",
        countryId,
        "Production",
        factory ? focusIdForFactory(factory.id) : undefined,
        factory?.id
      );
    } else if (factoryRulesMatch) {
      const type = factoryRulesMatch[1];
      severity = "error";
      entityType = "rules";
      entityId = type;
      fieldPath = "rules.factoryRules";
      message = `${type} is used by a country but has no factory rule.`;
      recommendedAction = "Open Factory rules and add the missing rule or change the factory type.";
      target = rulesTarget("Open factory rules", "factoryRules", `rule-factory-${slug(type)}`);
    } else if (/No capital selected/i.test(sourceMessage) || /Multiple capitals/i.test(sourceMessage)) {
      severity = "error";
      entityType = "settlement";
      entityId = countryId;
      fieldPath = "settlements.is_capital";
      message = /No capital selected/i.test(sourceMessage)
        ? "Country has 5 or more settlements but no capital selected."
        : "Country has multiple capital settlements selected.";
      recommendedAction = "Open Settlements and choose exactly one capital for this country.";
      target = countryTarget("Fix capital selection", countryId, "Settlements", `settlements-${countryId}`, countryId);
    } else if (/Negative gold/i.test(sourceMessage)) {
      severity = "error";
      entityType = "country";
      fieldPath = "countries.gold";
      recommendedAction = "Open Overview and add gold, reduce expenses, or adjust trades before committing.";
      target = countryTarget("Fix projected gold", countryId, "Overview", `country-${countryId}-gold`, countryId);
    } else if (/Negative .* stockpile/i.test(sourceMessage)) {
      const resource = sourceMessage.match(/Negative ([a-z_]+) stockpile/i)?.[1] ?? "resource";
      severity = "error";
      entityType = "resource";
      entityId = resource;
      fieldPath = `stockpiles.${resource}`;
      message = `${humanizeResource(resource)} would become negative after the turn.`;
      recommendedAction = "Open Production and add stockpile, reduce consumption, or adjust trades before committing.";
      target = countryTarget(
        "Fix resource stockpile",
        countryId,
        "Production",
        focusIdForResource(countryId, resource),
        resource
      );
    } else if (/Stability at 0/i.test(sourceMessage) || /Stability below 30/i.test(sourceMessage)) {
      severity = /Stability at 0/i.test(sourceMessage) ? "error" : "warning";
      entityType = "country";
      fieldPath = "countries.stability";
      recommendedAction = "Open Overview or Policies and improve stability inputs before committing.";
      target = countryTarget("Fix stability", countryId, "Overview", `country-${countryId}-stability`, countryId);
    } else if (/Puppet tribute|pays .* puppet tribute|Puppet eligible/i.test(sourceMessage)) {
      severity = /eligible/i.test(sourceMessage) ? "warning" : "info";
      entityType = "puppet";
      fieldPath = "puppets";
      recommendedAction = /eligible/i.test(sourceMessage)
        ? "Open Trade/Diplomacy and review puppet stability, immunity, and rebellion status."
        : "Open Trade/Diplomacy to review tribute settings if this transfer is unexpected.";
      target = countryTarget("Open puppet relations", countryId, "Trade/Diplomacy", `puppets-${countryId}`, countryId);
    } else if (tradeMatch) {
      severity = /lacks|unaffordable|blocked|invalid/i.test(sourceMessage) ? "error" : "warning";
      entityType = "trade";
      fieldPath = "trades";
      recommendedAction = "Open Trade/Diplomacy and fix the route validity, embargo flag, payment, or stockpile.";
      target = countryTarget("Open trade routes", countryId, "Trade/Diplomacy", `trades-${countryId}`, countryId);
    } else if (operationSupplyMatch) {
      const operation = findOperationByName(state, countryId, operationSupplyMatch[1]);
      severity = "error";
      entityType = "operation";
      entityId = operation?.id ?? operationSupplyMatch[1];
      fieldPath = "operations.supply_allocated";
      recommendedAction = "Open Military and allocate enough supply or reduce the operation requirement.";
      target = countryTarget(
        "Open military operation",
        countryId,
        "Military",
        operation ? `operation-${operation.id}` : `operations-${countryId}`,
        operation?.id
      );
    } else if (/fewer than .* players/i.test(sourceMessage)) {
      severity = "warning";
      entityType = "country";
      fieldPath = "countries.council_player_count";
      recommendedAction = "Open Policies and update council player count or change the ruling party.";
      target = countryTarget("Open policies", countryId, "Policies", `policies-${countryId}`, countryId);
    }
  }

  return {
    id: warningId(countryId, entityType, fieldPath, sourceMessage, index),
    severity,
    countryId,
    countryName,
    entityType,
    entityId,
    fieldPath,
    message,
    recommendedAction,
    sourceMessage,
    target
  };
};

export const normalizePreviewWarnings = (state: GameState, preview: TurnPreview): NormalizedWarning[] => [
  ...preview.globalWarnings.map((warning, index) => normalizeGlobalWarning(state, warning, index)),
  ...preview.countries.flatMap((country) =>
    country.warnings.map((warning, index) =>
      normalizeCountryWarning(state, country.countryId, country.countryName, warning, index)
    )
  )
];

export const severityRank = (severity: WarningSeverity): number => {
  if (severity === "error") return 0;
  if (severity === "warning") return 1;
  return 2;
};

export const sortWarnings = (warnings: NormalizedWarning[]): NormalizedWarning[] =>
  warnings.slice().sort((a, b) => {
    const severity = severityRank(a.severity) - severityRank(b.severity);
    if (severity !== 0) return severity;
    return (a.countryName ?? "Global").localeCompare(b.countryName ?? "Global") || a.message.localeCompare(b.message);
  });
