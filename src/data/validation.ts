import { GameState, RESOURCE_TYPES } from "../types";

const REQUIRED_ARRAYS = [
  "countries",
  "settlements",
  "factories",
  "stockpiles",
  "policies",
  "diplomacy",
  "puppets",
  "trades",
  "operations",
  "diceRolls",
  "turnLogs",
  "overrides"
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const requireString = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
};

const requireNumber = (value: unknown, label: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
};

const requireBoolean = (value: unknown, label: string) => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
};

const requireOptionalString = (value: unknown, label: string) => {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
};

const validateTurnTracking = (value: Record<string, unknown>, label: string) => {
  if (value.created_turn !== undefined) {
    requireNumber(value.created_turn, `${label}.created_turn`);
  }
  if (value.updated_turn !== undefined) {
    requireNumber(value.updated_turn, `${label}.updated_turn`);
  }
  if (value.updated_fields !== undefined) {
    requireArray(value.updated_fields, `${label}.updated_fields`).forEach((field) =>
      requireString(field, `${label}.updated_fields[]`)
    );
  }
};

const requireArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is missing or is not an array.`);
  }
  return value;
};

const validateCountry = (value: unknown) => {
  const country = requireRecord(value, "country");
  requireString(country.id, "country.id");
  requireString(country.name, "country.name");
  requireString(country.color, "country.color");
  requireString(country.ruling_party, "country.ruling_party");
  requireBoolean(country.is_player_country, "country.is_player_country");
  requireBoolean(country.at_war, "country.at_war");
  ["gold", "stability", "manpower", "manpower_cap", "reserve", "equipment", "high_quality_equipment", "tanks", "supply", "current_turn_created", "peace_turns_count"].forEach(
    (field) => requireNumber(country[field], `country.${field}`)
  );
};

const validateRules = (value: unknown) => {
  const rules = requireRecord(value, "rules");
  const settings = requireRecord(rules.settings, "rules.settings");
  [
    "sea_transport_cost_per_unit_resource",
    "base_manpower_cap",
    "base_manpower_gain_per_turn",
    "reserve_cap_multiplier",
    "necessities_manpower_cap_divisor",
    "necessities_met_stability_per_turn",
    "necessities_missing_stability_per_turn"
  ].forEach((field) => requireNumber(settings[field], `rules.settings.${field}`));
  ["auto_downgrade_settlements_on_missing_upkeep", "partial_factory_production", "partial_trade_transfer", "apply_capital_bonus"].forEach(
    (field) => requireBoolean(settings[field], `rules.settings.${field}`)
  );
  requireRecord(rules.settlementTiers, "rules.settlementTiers");
  requireRecord(rules.resourceProduction, "rules.resourceProduction");
  requireArray(rules.factoryRules, "rules.factoryRules");
  requireArray(rules.policyCategories, "rules.policyCategories");
  requireRecord(rules.rulingParties, "rules.rulingParties");
  requireRecord(rules.stabilityRules, "rules.stabilityRules");
  requireRecord(rules.dice, "rules.dice");
};

const requireCountryRef = (countryIds: Set<string>, value: unknown, label: string) => {
  requireString(value, label);
  if (!countryIds.has(value as string)) {
    throw new Error(`${label} references unknown country ${String(value)}.`);
  }
};

export const validateGameState = (value: unknown): GameState => {
  const state = requireRecord(value, "game state");

  requireNumber(state.schemaVersion, "schemaVersion");
  if (state.schemaVersion !== 2) {
    throw new Error(`Incompatible game state schema version: ${String(state.schemaVersion)}.`);
  }
  requireNumber(state.turnNumber, "turnNumber");
  validateRules(state.rules);

  REQUIRED_ARRAYS.forEach((field) => requireArray(state[field], field));
  requireRecord(state.graphPositions, "graphPositions");

  const countries = requireArray(state.countries, "countries");
  countries.forEach(validateCountry);
  const countryIds = new Set(countries.map((country) => (country as Record<string, unknown>).id as string));

  requireArray(state.settlements, "settlements").forEach((value) => {
    const settlement = requireRecord(value, "settlement");
    requireString(settlement.id, "settlement.id");
    requireString(settlement.country_id, "settlement.country_id");
    validateTurnTracking(settlement, "settlement");
    const countryId = settlement.country_id as string;
    if (!countryIds.has(countryId)) {
      throw new Error(`settlement ${settlement.id} references unknown country ${settlement.country_id}.`);
    }
  });

  requireArray(state.stockpiles, "stockpiles").forEach((value) => {
    const row = requireRecord(value, "stockpile");
    requireString(row.country_id, "stockpile.country_id");
    const countryId = row.country_id as string;
    if (!countryIds.has(countryId)) {
      throw new Error(`stockpile references unknown country ${row.country_id}.`);
    }
    if (!RESOURCE_TYPES.includes(row.resource_type as never)) {
      throw new Error(`stockpile has invalid resource type ${String(row.resource_type)}.`);
    }
    requireNumber(row.amount, "stockpile.amount");
  });

  requireArray(state.factories, "factories").forEach((value) => {
    const factory = requireRecord(value, "factory");
    requireString(factory.id, "factory.id");
    requireCountryRef(countryIds, factory.country_id, "factory.country_id");
    validateTurnTracking(factory, "factory");
  });

  requireArray(state.policies, "policies").forEach((value) => {
    const policy = requireRecord(value, "policy");
    requireCountryRef(countryIds, policy.country_id, "policy.country_id");
    requireString(policy.policy_category, "policy.policy_category");
    requireString(policy.selected_option, "policy.selected_option");
  });

  requireArray(state.diplomacy, "diplomacy").forEach((value) => {
    const relation = requireRecord(value, "diplomatic relation");
    requireString(relation.id, "diplomacy.id");
    requireCountryRef(countryIds, relation.country_a_id, "diplomacy.country_a_id");
    requireCountryRef(countryIds, relation.country_b_id, "diplomacy.country_b_id");
    validateTurnTracking(relation, "diplomacy");
    if (relation.graph_custom !== undefined) {
      const graphCustom = requireRecord(relation.graph_custom, "diplomacy.graph_custom");
      requireBoolean(graphCustom.enabled, "diplomacy.graph_custom.enabled");
      if (!["solid", "dashed", "dotted"].includes(String(graphCustom.line_type))) {
        throw new Error("diplomacy.graph_custom.line_type must be solid, dashed, or dotted.");
      }
      requireString(graphCustom.color, "diplomacy.graph_custom.color");
      requireOptionalString(graphCustom.hover_text, "diplomacy.graph_custom.hover_text");
      if (graphCustom.directed !== undefined) {
        requireBoolean(graphCustom.directed, "diplomacy.graph_custom.directed");
      }
      requireOptionalString(graphCustom.group_id, "diplomacy.graph_custom.group_id");
    }
  });

  requireArray(state.puppets, "puppets").forEach((value) => {
    const puppet = requireRecord(value, "puppet relation");
    requireString(puppet.id, "puppet.id");
    requireCountryRef(countryIds, puppet.master_country_id, "puppet.master_country_id");
    requireCountryRef(countryIds, puppet.puppet_country_id, "puppet.puppet_country_id");
    validateTurnTracking(puppet, "puppet");
  });

  requireArray(state.trades, "trades").forEach((value) => {
    const trade = requireRecord(value, "trade route");
    requireString(trade.id, "trade.id");
    requireCountryRef(countryIds, trade.sender_country_id, "trade.sender_country_id");
    requireCountryRef(countryIds, trade.receiver_country_id, "trade.receiver_country_id");
    validateTurnTracking(trade, "trade");
  });

  requireArray(state.operations, "operations").forEach((value) => {
    const operation = requireRecord(value, "military operation");
    requireString(operation.id, "operation.id");
    requireCountryRef(countryIds, operation.attacker_country_id, "operation.attacker_country_id");
    requireCountryRef(countryIds, operation.defender_country_id, "operation.defender_country_id");
    validateTurnTracking(operation, "operation");
  });

  requireArray(state.diceRolls, "diceRolls").forEach((value) => {
    const roll = requireRecord(value, "dice roll");
    requireString(roll.id, "diceRoll.id");
    requireCountryRef(countryIds, roll.country_id, "diceRoll.country_id");
  });

  requireArray(state.turnLogs, "turnLogs").forEach((value) => {
    const log = requireRecord(value, "turn log");
    requireString(log.id, "turnLog.id");
    requireCountryRef(countryIds, log.country_id, "turnLog.country_id");
  });

  return value as GameState;
};

export const parseGameStateJson = (json: string): GameState => validateGameState(JSON.parse(json) as unknown);
