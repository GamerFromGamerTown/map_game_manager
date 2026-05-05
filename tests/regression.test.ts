import assert from "node:assert/strict";
import { commitTurn, previewNextTurn, settlementProductionForCountry, stockpileForCountry } from "../src/engine/calculations";
import { createBundledState } from "../src/data/defaultState";
import { normalizeLoadedState } from "../src/data/migrations";
import { validateGameState } from "../src/data/validation";
import { policyChangeStabilityCost } from "../src/engine/policies";
import { createDefaultGraphPositions } from "../src/components/DiplomacyGraph";
import { renderAllCountryStatSheets, renderVerbatimCountryStatSheet } from "../src/export/statSheets";
import type { GameState, ResourceBag } from "../src/types";

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

const bundleCountrySettlementsIntoSingleCountry = (state: GameState, sourceCountryId: string, targetCountryId: string) => {
  state.settlements = state.settlements
    .filter((settlement) => settlement.country_id === sourceCountryId)
    .map((settlement) => ({ ...settlement, country_id: targetCountryId }));
};

const nonZeroBag = (bag: ResourceBag): Record<string, number> =>
  Object.fromEntries(Object.entries(bag).filter(([, value]) => Number(value) !== 0));

const basicRawDelta = (bag: ResourceBag): Record<string, number> =>
  Object.fromEntries(
    (["food", "wood", "coal", "iron", "bauxite", "copper", "gold_ore"] as const).map((resource) => [
      resource,
      Number(bag[resource] ?? 0)
    ])
  );

test("validation accepts the bundled default save and rejects partial imports", () => {
  const initialState = createBundledState();
  assert.doesNotThrow(() => validateGameState(initialState));
  assert.throws(() => validateGameState({ schemaVersion: 2, countries: [] }), /missing|must/i);
  const invalidSettlement = clone(initialState);
  invalidSettlement.settlements[0].country_id = "missing-country";
  assert.throws(() => validateGameState(invalidSettlement), /unknown country/i);
});

test("normalization fills newly-added rule defaults without hardcoding country data", () => {
  const state = createBundledState();
  delete (state.rules.settings as Partial<typeof state.rules.settings>).base_capital_gold_per_turn;
  delete state.rules.rulingParties.Democratic.stability_per_turn_at_peace;

  const normalized = normalizeLoadedState(state);
  const preview = previewNextTurn(normalized).countries.find((item) => item.countryId === "magnus");

  assert.equal(normalized.rules.settings.base_capital_gold_per_turn, 2000);
  assert.equal(normalized.rules.rulingParties.Democratic.stability_per_turn_at_peace, 10);
  assert.equal(Number.isFinite(preview?.capitalGold), true);
});

test("commit recomputes preview from the current state instead of trusting stale previews", () => {
  const state = createBundledState();
  const stalePreview = previewNextTurn(state);
  const current = clone(state);
  current.rules.settings.base_manpower_gain_per_turn += 1234;
  const currentPreview = previewForCountry(current, "explo");

  const committed = commitTurn(current, stalePreview, "recomputed");
  const log = committed.turnLogs.find((item) => item.country_id === "explo");
  const breakdown = JSON.parse(log?.formula_breakdown_json ?? "{}") as {
    manpower?: { baseAndSettlementsBeforePolicy?: number };
  };

  assert.equal(log?.manpower_after, currentPreview.manpowerAfter);
  assert.equal(breakdown.manpower?.baseAndSettlementsBeforePolicy, currentPreview.formulaBreakdown.manpower.baseAndSettlementsBeforePolicy);
});

test("ruling party effects use editable rule config values", () => {
  const state = createBundledState();
  const country = state.countries.find((item) => item.id === "magnus");
  assert.ok(country);
  country.stability = 40;
  state.rules.rulingParties.Democratic.stability_per_turn_at_peace = 42;
  state.rules.rulingParties.Democratic.stability_cap_at_peace = 90;

  const preview = previewNextTurn(state).countries.find((item) => item.countryId === "magnus");

  assert.equal(preview?.stabilityDelta, 57);
  assert.equal(preview?.stabilityCap, 90);
});

test("military service policy change costs use editable policy config values", () => {
  const state = createBundledState();
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
  const state = createBundledState();
  (state.rules.settings as GameState["rules"]["settings"] & { base_capital_gold_per_turn: number })
    .base_capital_gold_per_turn = 123;

  const preview = previewNextTurn(state).countries.find((item) => item.countryId === "magnus");

  assert.equal(preview?.capitalGold, 123);
});

test("manpower arithmetic stays additive across settlement tiers", () => {
  const state = createBundledState();
  state.countries = [
    {
      ...clone(state.countries[0]),
      id: "tier-test",
      name: "Tier Test",
      manpower: 0,
      manpower_cap: 0,
      manual_manpower_cap_override: null
    }
  ];
  state.settlements = [];
  state.policies = state.policies
    .filter((policy) => policy.country_id === "explo")
    .map((policy) => ({ ...policy, country_id: "tier-test" }));
  state.stockpiles = state.stockpiles
    .filter((stockpile) => stockpile.country_id === "explo")
    .map((stockpile) => ({ ...stockpile, country_id: "tier-test", amount: 0 }));
  state.factories = [];
  state.trades = [];
  state.diplomacy = [];

  const withTier = (tier: "village" | "city" | "large_city" | "metropole") => {
    state.settlements = [
      {
        id: `tier-${tier}`,
        country_id: "tier-test",
        name: `Tier ${tier}`,
        tier,
        is_capital: false,
        biome_or_resource_type: "plains",
        manual_resource_override: null,
        upkeep_option: "A",
        occupied_by_country_id: null,
        damaged: false,
        bombed: false,
        connected_for_upkeep: true,
        notes: ""
      }
    ];
    return previewForCountry(state, "tier-test");
  };

  const emptyPreview = previewForCountry(state, "tier-test");
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
  const state = createBundledState();
  const settlement = clone(state.settlements.find((item) => item.country_id === "explo" && item.name === "Daria"));
  assert.ok(settlement);
  settlement.tier = "large_city";
  settlement.biome_or_resource_type = "forest";
  settlement.manual_resource_override = { gold_ore: 99 };

  const production = settlementProductionForCountry(state, settlement);

  assert.deepEqual(nonZeroBag(production), { wood: 3 });
});

test("bundled default save does not carry manual overrides", () => {
  const state = createBundledState();

  assert.deepEqual(state.overrides, []);
  assert.equal(
    state.countries.every((country) => country.manual_manpower_cap_override == null),
    true
  );
  assert.equal(
    state.settlements.every((settlement) => settlement.manual_resource_override == null),
    true
  );
});

test("bundled save matches the supplied stat sheet source values", () => {
  const state = createBundledState();
  const expectations = [
    { countryId: "explo", gold: 500, stability: 71, manpower: 18000, cap: 66000, reserve: 0, equipment: 0, settlements: 13 },
    { countryId: "gaymer", gold: 500, stability: 36, manpower: 44000, cap: 158000, reserve: 0, equipment: 0, settlements: 26 },
    { countryId: "pick", gold: 3500, stability: 46, manpower: 15000, cap: 72000, reserve: 0, equipment: 0, settlements: 16 },
    { countryId: "panguelle", gold: 20000, stability: 55, manpower: 0, cap: 64000, reserve: 20000, equipment: 0, settlements: 12 },
    { countryId: "ed", gold: 15000, stability: 100, manpower: 24000, cap: 58000, reserve: 0, equipment: 0, settlements: 9 },
    { countryId: "grisly", gold: 8500, stability: 73, manpower: 9000, cap: 58000, reserve: 0, equipment: 0, settlements: 9 },
    { countryId: "elf", gold: 500, stability: 55, manpower: 41000, cap: 100000, reserve: 0, equipment: 20, settlements: 21 },
    { countryId: "dew", gold: 5000, stability: 36, manpower: 18000, cap: 76000, reserve: 0, equipment: 0, settlements: 18 }
  ];

  expectations.forEach((expected) => {
    const country = state.countries.find((item) => item.id === expected.countryId);
    assert.ok(country, `missing ${expected.countryId}`);
    assert.equal(country.gold, expected.gold);
    assert.equal(country.stability, expected.stability);
    assert.equal(country.manpower, expected.manpower);
    assert.equal(country.manpower_cap, expected.cap);
    assert.equal(country.reserve, expected.reserve);
    assert.equal(country.equipment, expected.equipment);
    assert.equal(state.settlements.filter((settlement) => settlement.country_id === expected.countryId).length, expected.settlements);
  });

  assert.equal(state.turnNumber, 3);
  assert.equal(state.settlements.find((settlement) => settlement.name === "Moras")?.is_capital, true);
  assert.equal(state.settlements.find((settlement) => settlement.name === "GaymerTown")?.tier, "large_city");
  assert.equal(state.settlements.find((settlement) => settlement.name === "Drumdorf")?.tier, "city");
  assert.equal(state.trades.length, 6);
  assert.equal(stockpileForCountry(state, "gaymer").food, 42);
  assert.equal(stockpileForCountry(state, "dew").wood, 10);
});

test("bundled save arithmetic matches known manpower caps without overrides", () => {
  const state = createBundledState();
  const expectations = [
    { countryId: "explo", expectedCap: 66000, expectedGain: 15000 },
    { countryId: "gaymer", expectedCap: 158000, expectedGain: 46000 },
    { countryId: "pick", expectedCap: 72000, expectedGain: 18000 },
    { countryId: "magnus", expectedCap: 46000, expectedGain: 5000 },
    { countryId: "panguelle", expectedCap: 64000, expectedGain: 14000 },
    { countryId: "ed", expectedCap: 58000, expectedGain: 11000 },
    { countryId: "grisly", expectedCap: 58000, expectedGain: 11000 },
    { countryId: "elf", expectedCap: 100000, expectedGain: 29000 },
    { countryId: "dew", expectedCap: 76000, expectedGain: 20000 }
  ];

  expectations.forEach(({ countryId, expectedCap, expectedGain }) => {
    const preview = previewForCountry(state, countryId);
    assert.equal(preview.manpowerCapAfter, expectedCap);
    assert.equal(preview.manpowerGain, expectedGain);
  });
});

test("bundled save arithmetic matches the supplied stat sheet snapshot", () => {
  const state = createBundledState();
  const previewByCountry = new Map(previewNextTurn(state).countries.map((item) => [item.countryId, item]));
  const expected = [
    {
      countryId: "dew",
      goldDelta: 14500,
      tradeGoldNet: -5000,
      stabilityDelta: 20,
      stabilityAfter: 56,
      manpowerGain: 20000,
      manpowerAfter: 38000,
      manpowerCapAfter: 76000,
      necessitiesRequired: 1,
      necessitiesProduced: 1,
      necessitiesMet: true,
      rawDelta: { food: 6, wood: 5, coal: -1, iron: 1, bauxite: 3, copper: 0, gold_ore: 0 }
    },
    {
      countryId: "explo",
      goldDelta: 19000,
      tradeGoldNet: -500,
      stabilityDelta: 20,
      stabilityAfter: 91,
      manpowerGain: 15000,
      manpowerAfter: 33000,
      manpowerCapAfter: 66000,
      necessitiesRequired: 1,
      necessitiesProduced: 1,
      necessitiesMet: true,
      rawDelta: { food: 1, wood: 1, coal: 1, iron: 2, bauxite: 0, copper: 0, gold_ore: 0 }
    },
    {
      countryId: "gaymer",
      goldDelta: 38500,
      tradeGoldNet: 0,
      stabilityDelta: 18,
      stabilityAfter: 54,
      manpowerGain: 46000,
      manpowerAfter: 90000,
      manpowerCapAfter: 158000,
      necessitiesRequired: 3,
      necessitiesProduced: 0,
      necessitiesMet: false,
      rawDelta: { food: 14, wood: 0, coal: 1, iron: 0, bauxite: 0, copper: 0, gold_ore: 1 }
    },
    {
      countryId: "pick",
      goldDelta: 21000,
      tradeGoldNet: 1000,
      stabilityDelta: 13,
      stabilityAfter: 59,
      manpowerGain: 18000,
      manpowerAfter: 33000,
      manpowerCapAfter: 72000,
      necessitiesRequired: 1,
      necessitiesProduced: 0,
      necessitiesMet: false,
      rawDelta: { food: 9, wood: 0, coal: 3, iron: 2, bauxite: 4, copper: 0, gold_ore: 1 }
    },
    {
      countryId: "magnus",
      goldDelta: 15500,
      tradeGoldNet: 0,
      stabilityDelta: 25,
      stabilityAfter: 100,
      manpowerGain: 5000,
      manpowerAfter: 18000,
      manpowerCapAfter: 46000,
      necessitiesRequired: 0,
      necessitiesProduced: 0,
      necessitiesMet: true,
      rawDelta: { food: 2, wood: 0, coal: 2, iron: 0, bauxite: 0, copper: 1, gold_ore: 0 }
    },
    {
      countryId: "ed",
      goldDelta: 18500,
      tradeGoldNet: 0,
      stabilityDelta: 25,
      stabilityAfter: 100,
      manpowerGain: 11000,
      manpowerAfter: 35000,
      manpowerCapAfter: 58000,
      necessitiesRequired: 1,
      necessitiesProduced: 1,
      necessitiesMet: true,
      rawDelta: { food: 2, wood: 0, coal: 0, iron: 4, bauxite: 0, copper: 0, gold_ore: 0 }
    },
    {
      countryId: "panguelle",
      goldDelta: 23000,
      tradeGoldNet: 0,
      stabilityDelta: 16,
      stabilityAfter: 71,
      manpowerGain: 14000,
      manpowerAfter: 14000,
      manpowerCapAfter: 64000,
      necessitiesRequired: 1,
      necessitiesProduced: 1,
      necessitiesMet: true,
      rawDelta: { food: 0, wood: 0, coal: 2, iron: 1, bauxite: 0, copper: 0, gold_ore: 0 }
    },
    {
      countryId: "grisly",
      goldDelta: 17500,
      tradeGoldNet: 0,
      stabilityDelta: 13,
      stabilityAfter: 86,
      manpowerGain: 11000,
      manpowerAfter: 20000,
      manpowerCapAfter: 58000,
      necessitiesRequired: 1,
      necessitiesProduced: 0,
      necessitiesMet: false,
      rawDelta: { food: 3, wood: 0, coal: 3, iron: 3, bauxite: 0, copper: 1, gold_ore: 1 }
    },
    {
      countryId: "elf",
      goldDelta: 32500,
      tradeGoldNet: 0,
      stabilityDelta: 25,
      stabilityAfter: 80,
      manpowerGain: 29000,
      manpowerAfter: 70000,
      manpowerCapAfter: 100000,
      necessitiesRequired: 2,
      necessitiesProduced: 2,
      necessitiesMet: true,
      rawDelta: { food: 0, wood: 0, coal: 2, iron: 0, bauxite: 1, copper: 0, gold_ore: 0 }
    }
  ];

  expected.forEach((expectedCountry) => {
    const preview = previewByCountry.get(expectedCountry.countryId);
    assert.ok(preview, `missing preview for ${expectedCountry.countryId}`);
    assert.equal(preview.goldDelta, expectedCountry.goldDelta);
    assert.equal(preview.tradeGoldNet, expectedCountry.tradeGoldNet);
    assert.equal(preview.stabilityDelta, expectedCountry.stabilityDelta);
    assert.equal(preview.stabilityAfter, expectedCountry.stabilityAfter);
    assert.equal(preview.manpowerGain, expectedCountry.manpowerGain);
    assert.equal(preview.manpowerAfter, expectedCountry.manpowerAfter);
    assert.equal(preview.manpowerCapAfter, expectedCountry.manpowerCapAfter);
    assert.equal(preview.necessitiesRequired, expectedCountry.necessitiesRequired);
    assert.equal(preview.necessitiesProduced, expectedCountry.necessitiesProduced);
    assert.equal(preview.necessitiesMet, expectedCountry.necessitiesMet);
    assert.deepEqual(basicRawDelta(preview.resourceDelta), expectedCountry.rawDelta);
    assert.deepEqual(preview.warnings, []);
  });
});

test("necessities shortfalls only affect stability and do not create warnings", () => {
  const state = createBundledState();
  const preview = previewForCountry(state, "pick");

  assert.equal(preview.necessitiesRequired, 1);
  assert.equal(preview.necessitiesMet, false);
  assert.equal(preview.stabilityDelta, 13);
  assert.equal(preview.warnings.some((warning) => warning.startsWith("Necessities not met")), false);
});

test("factory inputs can be paid from existing stockpiles", () => {
  const state = createBundledState();
  const country = { ...clone(state.countries[0]), id: "factory-test", name: "Factory Test" };
  state.countries = [country];
  state.settlements = [];
  state.policies = [];
  state.stockpiles = [
    { country_id: "factory-test", resource_type: "coal", amount: 1 },
    { country_id: "factory-test", resource_type: "gold_ore", amount: 1 }
  ];
  state.factories = [
    {
      id: "factory-test-gold",
      country_id: "factory-test",
      type: "Gold Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: ""
    }
  ];
  state.trades = [];
  state.diplomacy = [];
  state.puppets = [];
  state.operations = [];

  const preview = previewForCountry(state, "factory-test");

  assert.equal(preview.warnings.some((warning) => warning.includes("missing inputs")), false);
  assert.equal(preview.factoryOutputs.gold_ingot, 1);
});

test("incoming resource trades can satisfy factory inputs", () => {
  const state = createBundledState();
  const sender = { ...clone(state.countries[0]), id: "sender", name: "Sender" };
  const receiver = { ...clone(state.countries[1]), id: "receiver", name: "Receiver" };
  state.countries = [sender, receiver];
  state.settlements = [];
  state.policies = [];
  state.stockpiles = [
    { country_id: "sender", resource_type: "coal", amount: 1 },
    { country_id: "sender", resource_type: "gold_ore", amount: 1 }
  ];
  state.factories = [
    {
      id: "receiver-gold",
      country_id: "receiver",
      type: "Gold Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: ""
    }
  ];
  state.trades = [
    {
      id: "coal-to-receiver",
      sender_country_id: "sender",
      receiver_country_id: "receiver",
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
      id: "gold-to-receiver",
      sender_country_id: "sender",
      receiver_country_id: "receiver",
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
  state.diplomacy = [];
  state.puppets = [];
  state.operations = [];

  const preview = previewForCountry(state, "receiver");

  assert.equal(preview.warnings.some((warning) => warning.includes("missing inputs")), false);
  assert.equal(preview.factoryOutputs.gold_ingot, 1);
});

test("default diplomacy graph layout positions every country inside the canvas", () => {
  const state = createBundledState();
  const positions = createDefaultGraphPositions(state);
  const countryIds = state.countries.map((country) => country.id).sort();

  assert.deepEqual(Object.keys(positions).sort(), countryIds);
  Object.values(positions).forEach((position) => {
    assert.ok(position.x >= 0 && position.x <= 900);
    assert.ok(position.y >= 0 && position.y <= 560);
  });
});

test("stat sheet exports include Discord-formatted country sheets in both styles", () => {
  const state = createBundledState();
  const gaymers = state.countries.find((country) => country.id === "gaymer");
  assert.ok(gaymers);

  const polished = renderAllCountryStatSheets(state, "polished");
  const verbatim = renderAllCountryStatSheets(state, "verbatim");
  const gaymersVerbatim = renderVerbatimCountryStatSheet(state, gaymers);

  assert.equal(polished.split("\n# ").length, state.countries.length);
  assert.equal(verbatim.split("\n# ").length, state.countries.length);
  assert.match(polished, /# Federation of Gaymers/);
  assert.match(polished, /\*\*Projected gold:\*\* 500 -> 39\.000 \(\+38\.500\)/);
  assert.match(verbatim, /## Main Statistics/);
  assert.match(verbatim, /\*\*Gold:\*\* 39\.000 \(Income:/);
  assert.match(gaymersVerbatim, /24 X 500 \+ 1 X 3\.000 \+ 1 X 7\.000 = 22\.000/);
  assert.match(gaymersVerbatim, /\*\*Necessities:\*\* 0\/3 available \(1 needed per 50\.000 manpower cap\)/);
  assert.match(gaymersVerbatim, /1 \(\+7\.000\) GaymerTown: \+3 food, -10 food, -3 plank, -2 aluminium parts \(Capital\)/);
  assert.match(gaymersVerbatim, /### Constructions:\nNone/);
  assert.match(gaymersVerbatim, /\*\*Market Type \[M\]:\*\* Mixed Market: \+5\.000 gold per turn/);
  assert.match(gaymersVerbatim, /\*\*Defensive pacts:\*\* Shukea/);
});

test("application logic does not special-case the Player Country name", () => {
  const state = createBundledState();
  state.turnNumber = 0;
  state.countries = [clone(state.countries[0])];
  state.countries[0].id = "test-country";
  state.countries[0].name = "Player Country";
  bundleCountrySettlementsIntoSingleCountry(state, "explo", "test-country");
  state.policies = state.policies
    .filter((policy) => policy.country_id === "explo")
    .map((policy) => ({ ...policy, country_id: "test-country" }));
  state.stockpiles = state.stockpiles
    .filter((stockpile) => stockpile.country_id === "explo")
    .map((stockpile) => ({ ...stockpile, country_id: "test-country" }));
  state.factories = [];
  state.trades = [];
  state.diplomacy = [];

  const preview = previewNextTurn(state).countries[0];

  assert.equal(
    preview.warnings.includes(
      "Capital bonus exists in rules but is not included in seed sheet calculation. Apply rule or preserve sheet value?"
    ),
    false
  );
});
