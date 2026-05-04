import assert from "node:assert/strict";
import { commitTurn, previewNextTurn } from "../src/engine/calculations";
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

test("validation accepts the bundled default save and rejects partial imports", () => {
  const initialState = createBundledState();
  assert.doesNotThrow(() => validateGameState(initialState));
  assert.throws(() => validateGameState({ schemaVersion: 2, countries: [] }), /missing|must/i);
  const invalidTrade = clone(initialState);
  invalidTrade.trades[0].receiver_country_id = "missing-country";
  assert.throws(() => validateGameState(invalidTrade), /unknown country/i);
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

  const committed = commitTurn(current, stalePreview, "recomputed");
  const log = committed.turnLogs.find((item) => item.country_id === "explo");
  const breakdown = JSON.parse(log?.formula_breakdown_json ?? "{}") as {
    manpower?: { baseAndSettlementsBeforePolicy?: number };
  };

  assert.equal(log?.manpower_after, 34234);
  assert.equal(breakdown.manpower?.baseAndSettlementsBeforePolicy, 16234);
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

test("bundled save arithmetic matches known manpower caps without overrides", () => {
  const state = createBundledState();
  const expectations = [
    { countryId: "explo", expectedCap: 66000, expectedGain: 15000 },
    { countryId: "gaymer", expectedCap: 156000, expectedGain: 45000 },
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

test("bundled save arithmetic matches independently calculated nation snapshots", () => {
  const state = createBundledState();
  const previewByCountry = new Map(previewNextTurn(state).countries.map((item) => [item.countryId, item]));
  const expected = [
    {
      countryId: "explo",
      goldDelta: 19000,
      grossGoldIncome: 19500,
      tradeGoldNet: -500,
      stabilityDelta: 20,
      stabilityAfter: 91,
      manpowerGain: 15000,
      manpowerAfter: 33000,
      manpowerCapAfter: 66000,
      necessitiesRequired: 1,
      necessitiesProduced: 1,
      necessitiesMet: true,
      resourceDelta: { food: 1, wood: 1, coal: 6, iron: 2, equipment: 20 }
    },
    {
      countryId: "gaymer",
      goldDelta: 38000,
      grossGoldIncome: 39500,
      tradeGoldNet: 0,
      stabilityDelta: 18,
      stabilityAfter: 54,
      manpowerGain: 45000,
      manpowerAfter: 89000,
      manpowerCapAfter: 156000,
      necessitiesRequired: 3,
      necessitiesProduced: 0,
      necessitiesMet: false,
      resourceDelta: { food: 9, coal: 9, gold_ore: 1, gold_ingot: 1 }
    },
    {
      countryId: "pick",
      goldDelta: 22000,
      grossGoldIncome: 25000,
      tradeGoldNet: 2000,
      stabilityDelta: 13,
      stabilityAfter: 59,
      manpowerGain: 18000,
      manpowerAfter: 33000,
      manpowerCapAfter: 72000,
      necessitiesRequired: 1,
      necessitiesProduced: 0,
      necessitiesMet: false,
      resourceDelta: { food: 11, coal: 5, iron: 2, bauxite: 4, gold_ore: 1 }
    },
    {
      countryId: "magnus",
      goldDelta: 15500,
      grossGoldIncome: 15500,
      tradeGoldNet: 0,
      stabilityDelta: 25,
      stabilityAfter: 100,
      manpowerGain: 5000,
      manpowerAfter: 18000,
      manpowerCapAfter: 46000,
      necessitiesRequired: 0,
      necessitiesProduced: 0,
      necessitiesMet: true,
      resourceDelta: { food: 2, coal: 2, copper: 1 }
    },
    {
      countryId: "panguelle",
      goldDelta: 28000,
      grossGoldIncome: 28000,
      tradeGoldNet: 0,
      stabilityDelta: 16,
      stabilityAfter: 71,
      manpowerGain: 14000,
      manpowerAfter: 14000,
      manpowerCapAfter: 64000,
      necessitiesRequired: 1,
      necessitiesProduced: 1,
      necessitiesMet: true,
      resourceDelta: { coal: 9, iron: 1, equipment: 20 }
    },
    {
      countryId: "ed",
      goldDelta: 18500,
      grossGoldIncome: 18500,
      tradeGoldNet: 0,
      stabilityDelta: 18,
      stabilityAfter: 100,
      manpowerGain: 11000,
      manpowerAfter: 35000,
      manpowerCapAfter: 58000,
      necessitiesRequired: 1,
      necessitiesProduced: 0,
      necessitiesMet: false,
      resourceDelta: { food: 2, plank: 1, coal: 3, iron: 4, copper_parts: 1 }
    },
    {
      countryId: "grisly",
      goldDelta: 17500,
      grossGoldIncome: 17500,
      tradeGoldNet: 0,
      stabilityDelta: 13,
      stabilityAfter: 86,
      manpowerGain: 11000,
      manpowerAfter: 20000,
      manpowerCapAfter: 58000,
      necessitiesRequired: 1,
      necessitiesProduced: 0,
      necessitiesMet: false,
      resourceDelta: { food: 3, coal: 6, iron: 3, copper: 1, gold_ore: 1 }
    },
    {
      countryId: "elf",
      goldDelta: 32500,
      grossGoldIncome: 32500,
      tradeGoldNet: 0,
      stabilityDelta: 25,
      stabilityAfter: 80,
      manpowerGain: 29000,
      manpowerAfter: 70000,
      manpowerCapAfter: 100000,
      necessitiesRequired: 2,
      necessitiesProduced: 2,
      necessitiesMet: true,
      resourceDelta: { food: -2, coal: 16, bauxite: 1, equipment: 20 }
    },
    {
      countryId: "dew",
      goldDelta: 16500,
      grossGoldIncome: 21000,
      tradeGoldNet: -3000,
      stabilityDelta: 20,
      stabilityAfter: 56,
      manpowerGain: 20000,
      manpowerAfter: 38000,
      manpowerCapAfter: 76000,
      necessitiesRequired: 1,
      necessitiesProduced: 1,
      necessitiesMet: true,
      resourceDelta: { food: 6, wood: 5, coal: 6, iron: 1, iron_parts: 2, bauxite: 3 }
    }
  ];

  expected.forEach((expectedCountry) => {
    const preview = previewByCountry.get(expectedCountry.countryId);
    assert.ok(preview, `missing preview for ${expectedCountry.countryId}`);
    assert.equal(preview.goldDelta, expectedCountry.goldDelta);
    assert.equal(preview.grossGoldIncome, expectedCountry.grossGoldIncome);
    assert.equal(preview.tradeGoldNet, expectedCountry.tradeGoldNet);
    assert.equal(preview.stabilityDelta, expectedCountry.stabilityDelta);
    assert.equal(preview.stabilityAfter, expectedCountry.stabilityAfter);
    assert.equal(preview.manpowerGain, expectedCountry.manpowerGain);
    assert.equal(preview.manpowerAfter, expectedCountry.manpowerAfter);
    assert.equal(preview.manpowerCapAfter, expectedCountry.manpowerCapAfter);
    assert.equal(preview.necessitiesRequired, expectedCountry.necessitiesRequired);
    assert.equal(preview.necessitiesProduced, expectedCountry.necessitiesProduced);
    assert.equal(preview.necessitiesMet, expectedCountry.necessitiesMet);
    assert.deepEqual(nonZeroBag(preview.resourceDelta), expectedCountry.resourceDelta);
  });
});

test("necessities shortfalls only affect stability and do not create warnings", () => {
  const state = createBundledState();
  const preview = previewForCountry(state, "gaymer");

  assert.equal(preview.necessitiesRequired, 3);
  assert.equal(preview.necessitiesMet, false);
  assert.equal(preview.stabilityDelta, 18);
  assert.equal(preview.warnings.some((warning) => warning.startsWith("Necessities not met")), false);
});

test("factory input warnings use current production and trades, not stockpiles", () => {
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

  assert.match(preview.warnings.join("\n"), /Gold Factory input flow missing: coal 0\/1, gold_ore 0\/1\./);
  assert.equal(preview.factoryOutputs.gold_ingot, 1);
});

test("incoming resource trades can satisfy factory input flow", () => {
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

  assert.equal(preview.warnings.some((warning) => warning.includes("input flow missing")), false);
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
  assert.match(polished, /\*\*Projected gold:\*\* 500 -> 38\.500 \(\+38\.000\)/);
  assert.match(verbatim, /## Main Statistics/);
  assert.match(verbatim, /\*\*Gold:\*\* 38\.500 \(Income:/);
  assert.match(gaymersVerbatim, /23 X 500 \+ 1 X 3\.000 \+ 1 X 7\.000 = 21\.500/);
  assert.match(gaymersVerbatim, /\*\*Necessities:\*\* 0\/3 \(1 needed per 50\.000 manpower cap\)/);
  assert.match(gaymersVerbatim, /1 \(\+7\.000\) GaymerTown: \+6 food, -10 food, -3 plank, -2 aluminium parts \(Capital\)/);
  assert.match(gaymersVerbatim, /Bauxite Smeltery: -1 coal, -1 bauxite, \+1 aluminium/);
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
