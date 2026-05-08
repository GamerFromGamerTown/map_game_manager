import assert from "node:assert/strict";
import { commitTurn, previewNextTurn, settlementProductionForCountry } from "../src/engine/calculations";
import { createEmptyState } from "../src/data/defaultState";
import { normalizeLoadedState } from "../src/data/migrations";
import { validateGameState } from "../src/data/validation";
import { policyChangeStabilityCost } from "../src/engine/policies";
import { buildRelationsGraphEdges, countryNodeRadius, createDefaultGraphPositions } from "../src/components/DiplomacyGraph";
import { renderAllCountryStatSheets, renderVerbatimCountryStatSheet } from "../src/export/statSheets";
import { RESOURCE_TYPES, Country, GameState, ResourceBag, ResourceStockpile, Settlement } from "../src/types";

const test = (name: string, run: () => void) => {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

const clone = <T>(value: T): T => structuredClone(value);

const previewForCountry = (state: GameState, countryId: string) => {
  const item = previewNextTurn(state).countries.find((entry) => entry.countryId === countryId);
  assert.ok(item, `missing preview for ${countryId}`);
  return item;
};

const zeroStockpiles = (countryId: string): ResourceStockpile[] =>
  RESOURCE_TYPES.map((resource_type) => ({ country_id: countryId, resource_type, amount: 0 }));

const defaultPolicies = (state: GameState, countryId: string) =>
  state.rules.policyCategories.map((category) => ({
    country_id: countryId,
    policy_category: category.category,
    selected_option: category.base_option,
    last_changed_turn: state.turnNumber
  }));

const makeCountry = (id: string, patch: Partial<Country> = {}): Country => ({
  id,
  name: `Country ${id.toUpperCase()}`,
  short_name: id.toUpperCase(),
  color: "#4f8cff",
  is_player_country: false,
  ruling_party: "Democratic",
  gold: 1000,
  stability: 50,
  manpower: 0,
  manpower_cap: 0,
  manual_manpower_cap_override: null,
  reserve: 0,
  equipment: 0,
  high_quality_equipment: 0,
  tanks: 0,
  supply: 0,
  current_turn_created: 0,
  at_war: false,
  peace_turns_count: 0,
  notes: "",
  ...patch
});

const makeSettlement = (
  countryId: string,
  id: string,
  patch: Partial<Settlement> = {}
): Settlement => ({
  id,
  country_id: countryId,
  name: `Settlement ${id.toUpperCase()}`,
  tier: "village",
  is_capital: false,
  biome_or_resource_type: "plains",
  manual_resource_override: null,
  upkeep_option: "A",
  occupied_by_country_id: null,
  damaged: false,
  bombed: false,
  connected_for_upkeep: true,
  notes: "",
  ...patch
});

const stateWithCountries = (countryIds: string[]): GameState => {
  const state = createEmptyState();
  state.countries = countryIds.map((id) => makeCountry(id));
  state.policies = countryIds.flatMap((id) => defaultPolicies(state, id));
  state.stockpiles = countryIds.flatMap((id) => zeroStockpiles(id));
  return state;
};

const nonZeroBag = (bag: ResourceBag): Record<string, number> =>
  Object.fromEntries(Object.entries(bag).filter(([, value]) => Number(value) !== 0));

test("validation accepts the empty default save and rejects malformed imports", () => {
  const initialState = createEmptyState();
  assert.doesNotThrow(() => validateGameState(initialState));
  assert.throws(() => validateGameState({ schemaVersion: 2, countries: [] }), /missing|must/i);

  const invalidSettlement = stateWithCountries(["a"]);
  invalidSettlement.settlements = [makeSettlement("missing-country", "invalid")];
  assert.throws(() => validateGameState(invalidSettlement), /unknown country/i);

  const invalidCustomRelation = stateWithCountries(["a", "b"]);
  invalidCustomRelation.diplomacy = [
    {
      id: "relation-custom",
      relation_type: "Custom Relation",
      country_a_id: "a",
      country_b_id: "b",
      active: true,
      notes: "",
      graph_custom: {
        enabled: true,
        line_type: "zigzag" as never,
        color: "#ff00aa",
        hover_text: ""
      }
    }
  ];
  assert.throws(() => validateGameState(invalidCustomRelation), /graph_custom/i);
});

test("normalization fills newly-added rule defaults without country data", () => {
  const state = createEmptyState();
  delete (state.rules.settings as Partial<typeof state.rules.settings>).base_capital_gold_per_turn;
  delete state.rules.rulingParties.Democratic.stability_per_turn_at_peace;

  const normalized = normalizeLoadedState(state);

  assert.equal(normalized.rules.settings.base_capital_gold_per_turn, 2000);
  assert.equal(normalized.rules.rulingParties.Democratic.stability_per_turn_at_peace, 10);
  assert.equal(previewNextTurn(normalized).countries.length, 0);
});

test("commit recomputes preview from the current state instead of trusting stale previews", () => {
  const state = stateWithCountries(["a"]);
  state.settlements = [makeSettlement("a", "capital", { is_capital: true })];
  const stalePreview = previewNextTurn(state);
  const current = clone(state);
  current.rules.settings.base_manpower_gain_per_turn += 1234;
  const currentPreview = previewForCountry(current, "a");

  const committed = commitTurn(current, stalePreview, "recomputed");
  const log = committed.turnLogs.find((item) => item.country_id === "a");
  const breakdown = JSON.parse(log?.formula_breakdown_json ?? "{}") as {
    manpower?: { baseAndSettlementsBeforePolicy?: number };
  };

  assert.equal(log?.manpower_after, currentPreview.manpowerAfter);
  assert.equal(
    breakdown.manpower?.baseAndSettlementsBeforePolicy,
    currentPreview.formulaBreakdown.manpower.baseAndSettlementsBeforePolicy
  );
});

test("ruling party effects use editable rule config values", () => {
  const state = stateWithCountries(["a"]);
  const country = state.countries[0];
  country.stability = 40;
  state.rules.rulingParties.Democratic.stability_per_turn_at_peace = 42;
  state.rules.rulingParties.Democratic.stability_cap_at_peace = 90;

  const preview = previewForCountry(state, "a");
  const stability = preview.formulaBreakdown.stability as { rulingParty: number };

  assert.equal(stability.rulingParty, 42);
  assert.equal(preview.stabilityDelta, 57);
  assert.equal(preview.stabilityCap, 90);
});

test("military service policy change costs use editable policy config values", () => {
  const state = stateWithCountries(["a"]);
  const category = state.rules.policyCategories.find((item) => item.category === "Military Service");
  const country = state.countries[0];
  assert.ok(category);
  category.military_service_upward_peace_step_cost = 99;
  category.military_service_downward_step_cost = 7;
  category.military_service_at_war_step_cost = 3;

  assert.equal(policyChangeStabilityCost(category, "Volunteer Army", "Conscription", country), 99);
  assert.equal(policyChangeStabilityCost(category, "Conscription", "Volunteer Army", country), 7);
  assert.equal(policyChangeStabilityCost(category, "Volunteer Army", "All Adults Serve", { ...country, at_war: true }), 9);
});

test("capital income uses editable rule config values", () => {
  const state = stateWithCountries(["a"]);
  state.settlements = [makeSettlement("a", "capital", { is_capital: true })];
  state.rules.settings.base_capital_gold_per_turn = 123;

  const preview = previewForCountry(state, "a");

  assert.equal(preview.capitalGold, 123);
});

test("manpower arithmetic stays additive across settlement tiers", () => {
  const state = stateWithCountries(["a"]);
  state.policies = defaultPolicies(state, "a");

  const withTier = (tier: Settlement["tier"]) => {
    state.settlements = [makeSettlement("a", tier, { tier })];
    return previewForCountry(state, "a");
  };

  const emptyPreview = previewForCountry(state, "a");
  assert.equal(emptyPreview.manpowerCapAfter, 40000);
  assert.equal(emptyPreview.manpowerGain, 2000);

  const village = withTier("village");
  assert.equal(village.manpowerCapAfter, 42000);
  assert.equal(village.manpowerGain, 3000);

  const city = withTier("city");
  assert.equal(city.manpowerCapAfter, 60000);
  assert.equal(city.manpowerGain, 7000);

  const largeCity = withTier("large_city");
  assert.equal(largeCity.manpowerCapAfter, 90000);
  assert.equal(largeCity.manpowerGain, 17000);

  const metropole = withTier("metropole");
  assert.equal(metropole.manpowerCapAfter, 240000);
  assert.equal(metropole.manpowerGain, 32000);
});

test("settlement editor production summaries use derived rule production without overrides", () => {
  const state = stateWithCountries(["a"]);
  const settlement = makeSettlement("a", "forest", {
    tier: "large_city",
    biome_or_resource_type: "forest",
    manual_resource_override: { gold_ore: 99 }
  });

  const production = settlementProductionForCountry(state, settlement);

  assert.deepEqual(nonZeroBag(production), { wood: 3 });
});

test("empty default save carries no entities or manual overrides", () => {
  const state = createEmptyState();

  assert.deepEqual(state.countries, []);
  assert.deepEqual(state.settlements, []);
  assert.deepEqual(state.factories, []);
  assert.deepEqual(state.stockpiles, []);
  assert.deepEqual(state.policies, []);
  assert.deepEqual(state.diplomacy, []);
  assert.deepEqual(state.puppets, []);
  assert.deepEqual(state.trades, []);
  assert.deepEqual(state.operations, []);
  assert.deepEqual(state.turnLogs, []);
  assert.deepEqual(state.overrides, []);
});

test("necessities shortfalls only affect stability and do not create warnings", () => {
  const state = stateWithCountries(["a"]);
  state.countries[0].manual_manpower_cap_override = 100000;

  const preview = previewForCountry(state, "a");
  const stability = preview.formulaBreakdown.stability as { necessities: number };

  assert.equal(preview.necessitiesRequired, 2);
  assert.equal(preview.necessitiesMet, false);
  assert.equal(stability.necessities, -5);
  assert.equal(preview.warnings.some((warning) => warning.startsWith("Necessities not met")), false);
});

test("factory inputs can be paid from existing stockpiles", () => {
  const state = stateWithCountries(["a"]);
  state.stockpiles = zeroStockpiles("a").map((stockpile) => {
    if (stockpile.resource_type === "coal" || stockpile.resource_type === "gold_ore") {
      return { ...stockpile, amount: 1 };
    }
    return stockpile;
  });
  state.factories = [
    {
      id: "factory-a",
      country_id: "a",
      type: "Gold Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: ""
    }
  ];

  const preview = previewForCountry(state, "a");

  assert.equal(preview.warnings.some((warning) => warning.includes("missing inputs")), false);
  assert.equal(preview.factoryOutputs.gold_ingot, 1);
});

test("incoming resource trades can satisfy factory inputs", () => {
  const state = stateWithCountries(["a", "b"]);
  state.stockpiles = [
    ...zeroStockpiles("a").map((stockpile) => {
      if (stockpile.resource_type === "coal" || stockpile.resource_type === "gold_ore") {
        return { ...stockpile, amount: 1 };
      }
      return stockpile;
    }),
    ...zeroStockpiles("b")
  ];
  state.factories = [
    {
      id: "factory-b",
      country_id: "b",
      type: "Gold Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: ""
    }
  ];
  state.trades = [
    {
      id: "trade-coal",
      sender_country_id: "a",
      receiver_country_id: "b",
      resource_type: "coal",
      amount_per_turn: 1,
      recurring: true,
      route_type: "abstract",
      sea_transport_cost_per_unit: 0,
      route_valid: true,
      blocked_by_embargo: false,
      active: true,
      notes: ""
    },
    {
      id: "trade-ore",
      sender_country_id: "a",
      receiver_country_id: "b",
      resource_type: "gold_ore",
      amount_per_turn: 1,
      recurring: true,
      route_type: "abstract",
      sea_transport_cost_per_unit: 0,
      route_valid: true,
      blocked_by_embargo: false,
      active: true,
      notes: ""
    }
  ];

  const preview = previewForCountry(state, "b");

  assert.equal(preview.warnings.some((warning) => warning.includes("missing inputs")), false);
  assert.equal(preview.factoryOutputs.gold_ingot, 1);
});

test("default relations graph layout positions every provided country inside the canvas", () => {
  const emptyPositions = createDefaultGraphPositions(createEmptyState());
  assert.deepEqual(emptyPositions, {});

  const state = stateWithCountries(["a", "b", "c"]);
  const positions = createDefaultGraphPositions(state);
  const countryIds = state.countries.map((country) => country.id).sort();

  assert.deepEqual(Object.keys(positions).sort(), countryIds);
  Object.values(positions).forEach((position) => {
    assert.ok(position.x >= 0 && position.x <= 900);
    assert.ok(position.y >= 0 && position.y <= 560);
  });
});

test("relations graph includes directed weighted trade lines filtered by material", () => {
  const state = stateWithCountries(["a", "b"]);
  state.trades = [
    {
      id: "trade-supply",
      sender_country_id: "a",
      receiver_country_id: "b",
      resource_type: "supply",
      amount_per_turn: 15,
      payment_gold_per_turn: 5,
      recurring: true,
      route_type: "abstract",
      sea_transport_cost_per_unit: 0,
      route_valid: true,
      blocked_by_embargo: false,
      active: true,
      notes: "priority shipment"
    },
    {
      id: "trade-food",
      sender_country_id: "b",
      receiver_country_id: "a",
      resource_type: "food",
      amount_per_turn: 3,
      recurring: true,
      route_type: "abstract",
      sea_transport_cost_per_unit: 0,
      route_valid: true,
      blocked_by_embargo: false,
      active: true,
      notes: ""
    }
  ];

  const edges = buildRelationsGraphEdges(state, {
    hiddenRelationTypes: new Set(),
    visibleTradeMaterials: new Set(["supply"])
  });

  assert.equal(edges.length, 1);
  assert.equal(edges[0].kind, "trade");
  assert.equal(edges[0].sourceCountryId, "a");
  assert.equal(edges[0].targetCountryId, "b");
  assert.equal(edges[0].directed, true);
  assert.equal(edges[0].label, "SUP");
  assert.ok(edges[0].strokeWidth > 2);
  assert.match(edges[0].hoverText, /15 Supply/);
  assert.match(edges[0].hoverText, /5 gold payment/);
});

test("relations graph marks non-aggression pacts as directed relation lines", () => {
  const state = stateWithCountries(["a", "b"]);
  state.diplomacy = [
    {
      id: "relation-nap",
      relation_type: "Non-Aggression Pact",
      country_a_id: "a",
      country_b_id: "b",
      active: true,
      notes: ""
    }
  ];

  const edges = buildRelationsGraphEdges(state, {
    hiddenRelationTypes: new Set(),
    visibleTradeMaterials: new Set(["all"])
  });

  assert.equal(edges.length, 1);
  assert.equal(edges[0].kind, "relation");
  assert.equal(edges[0].sourceCountryId, "a");
  assert.equal(edges[0].targetCountryId, "b");
  assert.equal(edges[0].directed, true);
});

test("relations graph custom relation styling comes from save data", () => {
  const state = stateWithCountries(["a", "b"]);
  state.diplomacy = [
    {
      id: "relation-custom",
      relation_type: "Custom Relation",
      country_a_id: "a",
      country_b_id: "b",
      active: true,
      notes: "",
      graph_custom: {
        enabled: true,
        line_type: "dotted",
        color: "#ff00aa",
        hover_text: "GM-visible relation note"
      }
    }
  ];

  const edges = buildRelationsGraphEdges(state, {
    hiddenRelationTypes: new Set(),
    visibleTradeMaterials: new Set(["all"])
  });

  assert.equal(edges[0].kind, "custom");
  assert.equal(edges[0].stroke, "#ff00aa");
  assert.equal(edges[0].dashArray, "2 6");
  assert.equal(edges[0].hoverText, "GM-visible relation note");
});

test("relations graph can size country nodes by stockpiled material", () => {
  const state = stateWithCountries(["a", "b"]);
  state.stockpiles = [
    ...zeroStockpiles("a").map((stockpile) => stockpile.resource_type === "supply" ? { ...stockpile, amount: 1 } : stockpile),
    ...zeroStockpiles("b").map((stockpile) => stockpile.resource_type === "supply" ? { ...stockpile, amount: 100 } : stockpile)
  ];

  const small = countryNodeRadius(state, state.countries[0], "supply");
  const large = countryNodeRadius(state, state.countries[1], "supply");

  assert.ok(large > small);
  assert.ok(small >= 20);
  assert.ok(large <= 52);
});

test("stat sheet exports include Discord-formatted country sheets in both styles", () => {
  const state = stateWithCountries(["a"]);
  const country = state.countries[0];
  state.settlements = [
    makeSettlement("a", "capital", { is_capital: true }),
    makeSettlement("a", "forest", { biome_or_resource_type: "forest" })
  ];

  const polished = renderAllCountryStatSheets(state, "polished");
  const verbatim = renderAllCountryStatSheets(state, "verbatim");
  const singleVerbatim = renderVerbatimCountryStatSheet(state, country);

  assert.equal(polished.split("\n# ").length, state.countries.length);
  assert.equal(verbatim.split("\n# ").length, state.countries.length);
  assert.match(polished, /# Country A/);
  assert.match(polished, /\*\*Projected gold:\*\*/);
  assert.match(verbatim, /## Main Statistics/);
  assert.match(singleVerbatim, /\*\*Necessities:\*\*/);
  assert.match(singleVerbatim, /### Constructions:\nNone/);
});

test("application logic does not special-case arbitrary country names", () => {
  const state = stateWithCountries(["a"]);
  state.countries[0].name = "Player Country";
  state.settlements = [makeSettlement("a", "capital", { is_capital: true })];

  const preview = previewNextTurn(state).countries[0];

  assert.equal(
    preview.warnings.includes(
      "Capital bonus exists in rules but is not included in seed sheet calculation. Apply rule or preserve sheet value?"
    ),
    false
  );
});
