import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commitTurn, previewNextTurn, settlementProductionForCountry } from "../src/engine/calculations";
import { createEmptyState } from "../src/data/defaultState";
import { normalizeLoadedState } from "../src/data/migrations";
import { exportGameStateArchiveBytes, importGameStateArchiveBytes } from "../src/data/saveArchive";
import { inferSaveFileKind, loadGameSaveFromBytes } from "../src/data/saveFiles";
import { validateGameState } from "../src/data/validation";
import { policyChangeStabilityCost } from "../src/engine/policies";
import { buildRelationsGraphEdges, countryNodeRadius, createDefaultGraphPositions } from "../src/components/DiplomacyGraph";
import { renderAllCountryStatSheets, renderVerbatimCountryStatSheet } from "../src/export/statSheets";
import { applyStatSheetImport } from "../src/import/statSheetImport";
import { buildStatSheetBundleFromTexts, parseStatSheetText } from "../src/import/statSheetParser";
import { buildTurnActionPreview } from "../src/ui/turnActionPreview";
import { RESOURCE_TYPES, Country, DiceRollLog, Factory, GameState, MilitaryOperation, ResourceBag, ResourceStockpile, Settlement, TradeRoute } from "../src/types";

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

interface StatSheetTextFixture {
  countryAliases: Array<{ country_name: string; aliases: string[] }>;
  sources: Array<{ threadId: string; threadName?: string; content: string }>;
}

const loadStatSheetTextFixture = (path: string): StatSheetTextFixture =>
  JSON.parse(readFileSync(path, "utf8")) as StatSheetTextFixture;

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

test("save file detection accepts structured archives and legacy JSON backups", () => {
  assert.equal(inferSaveFileKind(new File(["{}"], "backup.json", { type: "application/json" })), "legacy-json");
  assert.equal(inferSaveFileKind(new File([""], "backup.gm-save.zip", { type: "application/zip" })), "archive");
  assert.equal(inferSaveFileKind(new File([""], "backup.zip", { type: "application/zip" })), "archive");
  assert.throws(
    () => inferSaveFileKind(new File([""], "backup.sqlite", { type: "application/x-sqlite3" })),
    /unsupported save file type/i
  );
  assert.throws(() => inferSaveFileKind(new File([""], "backup.db")), /unsupported save file type/i);
});

const stateWithAllSaveDomains = (): GameState => {
  const state = stateWithCountries(["a", "b"]);
  state.turnNumber = 5;
  state.countries[0].aliases = ["Player A"];
  state.countries[1].aliases = ["Player B", "Diplomacy Alias"];
  state.graphPositions = {
    a: { x: 120, y: 220 },
    b: { x: 420, y: 220 }
  };
  state.rules.settings.partial_trade_transfer = true;
  state.settlements = [
    makeSettlement("a", "capital", {
      tier: "city",
      is_capital: true,
      upkeep_option: "B",
      biome_or_resource_type: "stat_gold"
    })
  ];
  state.factories = [
    {
      id: "factory-a",
      country_id: "a",
      type: "Iron Parts Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: "factory note"
    }
  ];
  state.stockpiles = state.stockpiles.map((stockpile) =>
    stockpile.country_id === "a" && stockpile.resource_type === "iron_parts"
      ? { ...stockpile, amount: 7 }
      : stockpile
  );
  state.diplomacy = [
    {
      id: "relation-a-b",
      relation_type: "Guarantee",
      country_a_id: "a",
      country_b_id: "b",
      active: true,
      notes: "directional relation"
    }
  ];
  state.trades = [
    {
      id: "trade-a-b-food",
      sender_country_id: "a",
      receiver_country_id: "b",
      resource_type: "food",
      amount_per_turn: 2,
      payment_gold_per_turn: 0,
      recurring: true,
      route_type: "abstract",
      sea_transport_cost_per_unit: 0,
      route_valid: true,
      blocked_by_embargo: false,
      active: true,
      notes: "trade note"
    }
  ];
  state.puppets = [
    {
      id: "puppet-a-b",
      master_country_id: "a",
      puppet_country_id: "b",
      puppet_type: Object.keys(state.rules.puppetTypes)[0] ?? "Protectorate",
      tribute_percent: 10,
      rebellion_immunity_turns_remaining: 1,
      active: true,
      notes: "puppet note"
    }
  ];
  state.operations = [
    {
      id: "operation-a-b",
      name: "Operation Save Test",
      attacker_country_id: "a",
      defender_country_id: "b",
      operation_type: Object.keys(state.rules.military.operations)[0] ?? "General Push Offensive",
      troops_normal: 1000,
      troops_high_quality: 0,
      troops_tank: 0,
      supply_required: 1,
      supply_allocated: 1,
      status: "planned",
      notes: "operation note"
    }
  ];
  state.diceRolls = [
    {
      id: "dice-a",
      turn_number: 5,
      country_id: "a",
      roll_type: "attack",
      raw_d20: 12,
      modifiers_json: "{}",
      final_score: 12,
      result_category: "success",
      notes: "roll note"
    }
  ];
  state.turnLogs = [
    {
      id: "turn-log-a",
      turn_number: 4,
      country_id: "a",
      gold_before: 1,
      gold_after: 2,
      stability_before: 3,
      stability_after: 4,
      manpower_before: 5,
      manpower_after: 6,
      resources_before_json: "{}",
      resources_after_json: "{}",
      formula_breakdown_json: "{}",
      warnings_json: "[]",
      gm_notes: "log note"
    }
  ];
  state.overrides = [
    {
      id: "override-a",
      turn_number: 5,
      entity_type: "country",
      entity_id: "a",
      field_name: "gold",
      old_value: "1",
      new_value: "2",
      reason: "test override",
      timestamp: "2026-05-09T00:00:00.000Z"
    }
  ];
  return state;
};

test("structured save archive round-trips every saved domain without data loss", () => {
  const state = stateWithAllSaveDomains();

  const archive = exportGameStateArchiveBytes(state);
  const loaded = importGameStateArchiveBytes(archive);

  assert.equal(loaded.format, "archive");
  assert.equal(loaded.warnings.length, 0);
  assert.deepEqual(loaded.state, normalizeLoadedState(state));
});

test("legacy monolithic JSON saves migrate through the archive-aware loader", () => {
  const state = stateWithAllSaveDomains();

  const loaded = loadGameSaveFromBytes(new TextEncoder().encode(JSON.stringify(state)), "legacy-backup.json");

  assert.equal(loaded.format, "legacy-json");
  assert.ok(loaded.warnings.some((warning) => /legacy monolithic JSON/i.test(warning)));
  assert.deepEqual(loaded.state, normalizeLoadedState(state));
});

test("saved archive aliases resolve Discord diplomacy and trade references without a bundle alias map", () => {
  const state = stateWithCountries(["current", "counterpart"]);
  state.countries[1].aliases = ["Saved Alias"];
  const archive = exportGameStateArchiveBytes(state);
  const loaded = importGameStateArchiveBytes(archive);
  const bundle = buildStatSheetBundleFromTexts([
    {
      content: [
        "# Country CURRENT",
        "## Resources:",
        "**Trades to (imports) and amount:** 2 iron parts (Saved Alias)",
        "## Diplomatics",
        "**Guarantee:** Saved Alias"
      ].join("\n")
    },
    { content: "# Country COUNTERPART" }
  ]);

  const result = applyStatSheetImport(loaded.state, bundle);

  assert.equal(
    result.applied,
    true,
    result.report.errors.map((error) => error.message).join("\n")
  );
  assert.ok(
    result.state.trades.some(
      (trade) =>
        trade.sender_country_id === "counterpart" &&
        trade.receiver_country_id === "current" &&
        trade.resource_type === "iron_parts"
    )
  );
  assert.ok(
    result.state.diplomacy.some(
      (relation) =>
        relation.relation_type === "Guarantee" &&
        relation.country_a_id === "current" &&
        relation.country_b_id === "counterpart"
    )
  );
});

test("unknown saved-alias references block with the source stat-sheet line", () => {
  const bundle = buildStatSheetBundleFromTexts([
    {
      content: [
        "# Country A",
        "## Diplomatics",
        "**Guarantee:** Missing Alias"
      ].join("\n")
    },
    { content: "# Country B" }
  ]);

  const result = applyStatSheetImport(createEmptyState(), bundle);

  assert.equal(result.applied, false);
  const error = result.report.errors.find((item) => /Missing Alias/i.test(item.message));
  assert.ok(error);
  assert.equal(error.sourceLine, "**Guarantee:** Missing Alias");
  assert.equal(error.lineNumber, 3);
  assert.match(error.suggestedFix, /save archive aliases/i);
});

test("normalization fills newly-added rule defaults without country data", () => {
  const state = createEmptyState();
  delete (state.rules.settings as Partial<typeof state.rules.settings>).base_capital_gold_per_turn;
  delete state.rules.rulingParties.Democratic.stability_per_turn_at_peace;

  const normalized = normalizeLoadedState(state);

  assert.equal(normalized.rules.settings.base_capital_gold_per_turn, 0);
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

test("factory aliases resolve plural and spelling variants", () => {
  const state = stateWithCountries(["a"]);
  state.stockpiles = zeroStockpiles("a").map((stockpile) => {
    if (["coal", "iron", "aluminium", "copper_parts"].includes(stockpile.resource_type)) {
      return { ...stockpile, amount: 5 };
    }
    return stockpile;
  });
  state.factories = [
    {
      id: "factory-variant-a",
      country_id: "a",
      type: "Iron Part Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: ""
    },
    {
      id: "factory-variant-b",
      country_id: "a",
      type: "Alumnium Parts Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: ""
    },
    {
      id: "factory-variant-c",
      country_id: "a",
      type: "Electronic Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: ""
    }
  ];

  const preview = previewForCountry(state, "a");

  assert.equal(preview.warnings.some((warning) => warning.includes("missing from rules")), false);
  assert.equal(preview.factoryOutputs.iron_parts, 1);
  assert.equal(preview.factoryOutputs.aluminium_parts, 1);
  assert.equal(preview.factoryOutputs.necessities, 1);
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

test("stat sheet parser accepts loose markdown and reports recoverable issues", () => {
  const parsed = parseStatSheetText(
    [
      "# Country A",
      "**Gold:** 1.250 (Income: +250",
      "Stability: 62/100",
      "Ruling Party Democratic",
      "Reserve 500/2.000",
      "Equipment Stockpile: +1,200",
      "Manpower: 4 000",
      "Manpower cap 12.000",
      "### Villages:",
      "Food:",
      "1 (+500) Capital A: +1 food (Capital)",
      "Wood:",
      "1 (+500) Forest A: +1 wood",
      "### Constructions:",
      "1 (0) Sawmill: -1 wood, +1 plank",
      "## Resources:",
      "Resources stockpiled: 3 food, 4 wood, 5 iron parts",
      "Gold gain/loss: +5.000(M) = +5.000",
      "Stability gain/loss: +1(L) = +1",
      "## Ideology policies:",
      "Healthcare [HE]: Public Healthcare: +1 stability per turn"
    ].join("\n"),
    { threadId: "thread-a" }
  );

  assert.equal(parsed.sheet.country.name, "Country A");
  assert.equal(parsed.sheet.country.gold, 1250);
  assert.equal(parsed.sheet.country.ruling_party, "Democratic");
  assert.equal(parsed.sheet.settlements.length, 2);
  assert.equal(parsed.sheet.settlements[0].is_capital, true);
  assert.equal(parsed.sheet.settlements[1].biome_or_resource_type, "stat_wood");
  assert.equal(parsed.sheet.factories[0].type, "Sawmill");
  assert.equal(parsed.sheet.stockpiles.iron_parts, 5);
  assert.equal(parsed.sheet.policies[0].policy_category, "Healthcare");
  assert.equal(parsed.report.errors.length, 0);
  assert.ok(parsed.report.warnings.some((warning) => /missing closing/i.test(warning.message)));
});

test("stat sheet parser gives actionable blocking errors for irreconcilable sheets", () => {
  const parsed = parseStatSheetText("Gold: 500\nStability: 20", { threadId: "thread-b" });

  assert.equal(parsed.report.errors.length, 1);
  assert.match(parsed.report.errors[0].message, /country name/i);
  assert.match(parsed.report.errors[0].suggestedFix, /heading/i);
  assert.equal(parsed.report.errors[0].threadId, "thread-b");
});

test("stat sheet parser can fall back to Discord thread title as country name", () => {
  const parsed = parseStatSheetText(
    [
      "Below is the stat block of <@123>",
      "## Main Statistics",
      "**Gold:** 10.500"
    ].join("\n"),
    { threadId: "thread-c", threadName: "Country C" }
  );

  assert.equal(parsed.sheet.country.name, "Country C");
  assert.equal(parsed.report.errors.length, 0);
  assert.ok(
    parsed.report.warnings.some((warning) => /thread title/i.test(warning.message) || /thread name/i.test(warning.message))
  );
});

test("stat sheet parser keeps Discord thread title when a late heading appears after the stat block", () => {
  const parsed = parseStatSheetText(
    [
      "Below is the stat block of <@123>",
      "## Main Statistics",
      "**Gold:** 10.500",
      "## Settlements:",
      "### Villages:",
      "Food:",
      "1 (+500) Capital A: +1 food (Capital)",
      "## Diplomatics",
      "Country display name",
      "# Ledger heading that is not the country"
    ].join("\n"),
    { threadId: "thread-title", threadName: "Country From Thread" }
  );

  assert.equal(parsed.sheet.country.name, "Country From Thread");
  assert.equal(parsed.sheet.settlements.length, 1);
  assert.equal(parsed.report.errors.length, 0);
});

test("stat sheet parser accepts noisy and misspelled settlement tier headings", () => {
  const parsed = parseStatSheetText(
    [
      "# Country A",
      "## Settlements:",
      "### Cities:",
      "Food:",
      "### Villages: 14",
      "Food:",
      "1 (+500) Village A: +1 food",
      "### Vilages:",
      "Wood:",
      "1 (+500) Village B: +1 wood"
    ].join("\n"),
    { threadId: "thread-tier" }
  );

  assert.deepEqual(
    parsed.sheet.settlements.map((settlement) => [settlement.name, settlement.tier]),
    [
      ["Village A", "village"],
      ["Village B", "village"]
    ]
  );
});

test("stat sheet parser keeps Erympus city upkeep separate from settlement category", () => {
  const parsed = parseStatSheetText(
    [
      "# The New Eruyios Empire",
      "## Settlements:",
      "### Cities:",
      "Gold:",
      "1 (+3.000) Erympus: +2 gold, -5 food, -2 iron parts (Capital)"
    ].join("\n")
  );

  assert.equal(parsed.report.errors.length, 0);
  assert.equal(parsed.sheet.settlements.length, 1);
  const settlement = parsed.sheet.settlements[0];
  assert.equal(settlement.name, "Erympus");
  assert.equal(settlement.tier, "city");
  assert.equal(settlement.is_capital, true);
  assert.equal(settlement.biome_or_resource_type, "stat_gold");
  assert.notEqual(settlement.biome_or_resource_type, "stat_food_gold");
  assert.equal(settlement.upkeep_option, "B");
  assert.match(settlement.notes ?? "", /\+2 gold/);
  assert.match(settlement.notes ?? "", /-5 food/);
  assert.match(settlement.notes ?? "", /-2 iron parts/);
});

test("stat sheet parser does not invent combo settlement categories from resource output", () => {
  const parsed = parseStatSheetText(
    [
      "# Country A",
      "## Settlements:",
      "### Villages:",
      "1 (+500) Mixed Output: +1 food, +1 gold"
    ].join("\n")
  );

  assert.equal(parsed.report.errors.length, 0);
  assert.equal(parsed.sheet.settlements.length, 1);
  assert.notEqual(parsed.sheet.settlements[0].biome_or_resource_type, "stat_food_gold");
});

test("stat sheet import preserves rules and turn metadata while merging countries", () => {
  const state = stateWithCountries(["a"]);
  state.turnNumber = 7;
  state.rules.settings.base_manpower_cap = 123456;
  state.turnLogs = [
    {
      id: "log-a",
      turn_number: 6,
      country_id: "a",
      gold_before: 0,
      gold_after: 1,
      stability_before: 0,
      stability_after: 1,
      manpower_before: 0,
      manpower_after: 1,
      resources_before_json: "{}",
      resources_after_json: "{}",
      formula_breakdown_json: "{}",
      warnings_json: "[]",
      gm_notes: "keep"
    }
  ];

  const bundle = buildStatSheetBundleFromTexts([
    {
      threadId: "thread-a",
      content: [
        "# Country A",
        "Gold: 2,000",
        "Stability: 75",
        "Ruling Party: Monarchy",
        "Manpower: 10,000",
        "Manpower cap: 50,000",
        "Resources stockpiled: 2 food, 3 wood",
        "### Villages:",
        "Food:",
        "1 (+500) Capital A: +1 food (Capital)"
      ].join("\n")
    }
  ]);

  const result = applyStatSheetImport(state, bundle);

  assert.equal(result.applied, true);
  assert.equal(result.state.turnNumber, 7);
  assert.equal(result.state.rules.settings.base_manpower_cap, 123456);
  assert.equal(result.state.turnLogs.length, 1);
  assert.equal(result.state.countries.length, 1);
  assert.equal(result.state.countries[0].gold, 2000);
  assert.equal(result.state.countries[0].ruling_party, "Monarchy");
  assert.equal(result.state.settlements.length, 1);
  assert.equal(result.state.stockpiles.find((row) => row.resource_type === "food")?.amount, 2);
});

test("stat sheet import preserves city iron upkeep route from parsed settlement formulas", () => {
  const state = stateWithCountries(["a"]);
  state.stockpiles = [
    ...zeroStockpiles("a").filter((stockpile) => stockpile.resource_type !== "food" && stockpile.resource_type !== "iron_parts"),
    { country_id: "a", resource_type: "food", amount: 5 },
    { country_id: "a", resource_type: "iron_parts", amount: 2 }
  ];

  const bundle = buildStatSheetBundleFromTexts([
    {
      content: [
        "# Country A",
        "Resources stockpiled: 5 food, 2 iron parts",
        "## Settlements:",
        "### Cities:",
        "Gold:",
        "1 (+3.000) Gold City: +2 gold, -5 food, -2 iron parts (Capital)"
      ].join("\n")
    }
  ]);

  const result = applyStatSheetImport(state, bundle);
  assert.equal(result.applied, true);
  assert.equal(result.state.settlements[0].upkeep_option, "B");
  assert.equal(result.state.settlements[0].biome_or_resource_type, "stat_gold");

  const preview = previewForCountry(result.state, "a");
  assert.equal(preview.settlementUpkeep.iron_parts, 2);
  assert.equal(preview.settlementUpkeep.aluminium_parts, 0);
  assert.equal(preview.warnings.some((warning) => /Aluminium Parts/i.test(warning)), false);
});

test("iron-route city preview checks food and iron parts only", () => {
  const state = stateWithCountries(["a"]);
  state.stockpiles = [
    ...zeroStockpiles("a").filter(
      (stockpile) =>
        stockpile.resource_type !== "food" &&
        stockpile.resource_type !== "iron_parts" &&
        stockpile.resource_type !== "aluminium_parts"
    ),
    { country_id: "a", resource_type: "food", amount: 5 },
    { country_id: "a", resource_type: "iron_parts", amount: 2 },
    { country_id: "a", resource_type: "aluminium_parts", amount: 0 }
  ];
  state.settlements = [
    makeSettlement("a", "iron-city", {
      name: "Iron Route City",
      tier: "city",
      upkeep_option: "B"
    })
  ];

  const preview = previewForCountry(state, "a");

  assert.equal(preview.settlementUpkeep.food, 5);
  assert.equal(preview.settlementUpkeep.iron_parts, 2);
  assert.equal(preview.settlementUpkeep.aluminium_parts ?? 0, 0);
  assert.equal(preview.warnings.some((warning) => /Aluminium Parts/i.test(warning)), false);
});

test("default settlement capital bonuses match city-tier rules", () => {
  const state = stateWithCountries(["a"]);

  state.settlements = [makeSettlement("a", "city-capital", { tier: "city", is_capital: true })];
  assert.equal(previewForCountry(state, "a").capitalGold, 1000);

  state.settlements = [makeSettlement("a", "large-city-capital", { tier: "large_city", is_capital: true })];
  assert.equal(previewForCountry(state, "a").capitalGold, 3000);

  state.settlements = [makeSettlement("a", "metropole-capital", { tier: "metropole", is_capital: true })];
  assert.equal(previewForCountry(state, "a").capitalGold, 5000);
});

test("stat sheet import resolves player aliases and preserves explicit iron upkeep from fixture artifacts", () => {
  const fixture = loadStatSheetTextFixture("tests/fixtures/discord-stat-sheet-alias-import.json");
  const bundle = buildStatSheetBundleFromTexts(fixture.sources);
  (bundle as typeof bundle & { countryAliases?: StatSheetTextFixture["countryAliases"] }).countryAliases =
    fixture.countryAliases;

  const result = applyStatSheetImport(createEmptyState(), bundle);

  assert.equal(
    result.applied,
    true,
    result.report.errors.map((error) => `${error.message} ${error.suggestedFix}`).join("\n")
  );

  const firstCountryName = fixture.countryAliases[0].country_name;
  const secondCountryName = fixture.countryAliases[1].country_name;
  const thirdCountryName = fixture.sources[2].threadName ?? "";
  const firstCountry = result.state.countries.find((country) => country.name === firstCountryName);
  const secondCountry = result.state.countries.find((country) => country.name === secondCountryName);
  const thirdCountry = result.state.countries.find((country) => country.name === thirdCountryName);
  assert.ok(firstCountry);
  assert.ok(secondCountry);
  assert.ok(thirdCountry);

  const firstCountryAliases = (firstCountry as Country & { aliases?: string[] }).aliases ?? [];
  const secondCountryAliases = (secondCountry as Country & { aliases?: string[] }).aliases ?? [];
  const thirdCountryAliases = (thirdCountry as Country & { aliases?: string[] }).aliases ?? [];
  assert.ok(firstCountryAliases.includes(fixture.countryAliases[0].aliases[0]));
  assert.ok(secondCountryAliases.includes(fixture.countryAliases[1].aliases[1]));
  assert.ok(thirdCountryAliases.includes(fixture.countryAliases[2].aliases[0]));

  assert.ok(
    result.state.diplomacy.some(
      (relation) =>
        relation.relation_type === "Guarantee" &&
        relation.country_a_id === firstCountry.id &&
        relation.country_b_id === secondCountry.id
    )
  );
  assert.ok(
    result.state.diplomacy.some(
      (relation) =>
        relation.relation_type === "Defensive Pact" &&
        [relation.country_a_id, relation.country_b_id].includes(firstCountry.id) &&
        [relation.country_a_id, relation.country_b_id].includes(secondCountry.id)
    )
  );
  assert.ok(
    result.state.diplomacy.some(
      (relation) =>
        relation.relation_type === "Guarantee" &&
        relation.country_a_id === thirdCountry.id &&
        relation.country_b_id === firstCountry.id
    )
  );

  const villagePreview = previewForCountry(result.state, firstCountry.id);
  assert.equal(villagePreview.warnings.some((warning) => /Aluminium Parts|missing upkeep/i.test(warning)), false);

  const ironRouteSettlement = result.state.settlements.find(
    (settlement) => settlement.country_id === secondCountry.id && /iron parts/i.test(settlement.notes)
  );
  assert.ok(ironRouteSettlement);
  assert.equal(ironRouteSettlement.tier, "city");
  assert.equal(ironRouteSettlement.upkeep_option, "B");

  const ironRoutePreview = previewForCountry(result.state, secondCountry.id);
  assert.equal(ironRoutePreview.settlementUpkeep.iron_parts, 2);
  assert.equal(ironRoutePreview.settlementUpkeep.aluminium_parts, 0);
  assert.equal(ironRoutePreview.warnings.some((warning) => /Aluminium Parts/i.test(warning)), false);
});

test("stat sheet import blocks ambiguous player aliases", () => {
  const bundle = buildStatSheetBundleFromTexts([
    {
      content: [
        "# Country A",
        "## Diplomatics",
        "**Guarantee:** Shared"
      ].join("\n")
    },
    { content: "# Country B" },
    { content: "# Country C" }
  ]);
  (bundle as typeof bundle & { countryAliases: StatSheetTextFixture["countryAliases"] }).countryAliases = [
    { country_name: "Country B", aliases: ["Shared"] },
    { country_name: "Country C", aliases: ["Shared"] }
  ];

  const result = applyStatSheetImport(createEmptyState(), bundle);

  assert.equal(result.applied, false);
  assert.ok(
    result.report.errors.some((error) => /Shared matches more than one country/i.test(error.message)),
    result.report.errors.map((error) => error.message).join("\n")
  );
});

test("stat sheet import creates directional trades and guarantees from stat sheet text", () => {
  const state = stateWithCountries(["a", "b", "c"]);

  const bundle = buildStatSheetBundleFromTexts([
    {
      content: [
        "# Country A",
        "## Resources:",
        "**Trades to (imports) and amount:** 2 iron parts from Country B",
        "**Trades to (exports) and amount:** 1 food to Country C",
        "## Diplomatics",
        "**Guarantee:** Country B",
        "**Non aggression pacts:** Country C"
      ].join("\n")
    }
  ]);

  const result = applyStatSheetImport(state, bundle);

  assert.equal(result.applied, true);
  assert.equal(result.state.trades.length, 2);
  assert.ok(
    result.state.trades.some(
      (trade) =>
        trade.sender_country_id === "b" &&
        trade.receiver_country_id === "a" &&
        trade.resource_type === "iron_parts" &&
        trade.amount_per_turn === 2
    )
  );
  assert.ok(
    result.state.trades.some(
      (trade) =>
        trade.sender_country_id === "a" &&
        trade.receiver_country_id === "c" &&
        trade.resource_type === "food" &&
        trade.amount_per_turn === 1
    )
  );
  const guarantee = result.state.diplomacy.find((relation) => relation.relation_type === "Guarantee");
  assert.equal(guarantee?.country_a_id, "a");
  assert.equal(guarantee?.country_b_id, "b");
  assert.equal(guarantee?.graph_custom?.directed, true);
  const pact = result.state.diplomacy.find((relation) => relation.relation_type === "Non-Aggression Pact");
  assert.equal(pact?.country_a_id, "a");
  assert.equal(pact?.country_b_id, "c");
});

test("stat sheet parser accepts parenthesized trade counterpart syntax", () => {
  const parsed = parseStatSheetText(
    [
      "# Country A",
      "## Resources:",
      "**Trades to (imports) and amount:** 1 coal, 1 iron, 3.000 gold (Country B), 1 necessities (Country C)",
      "**Trades to (exports) and amount:** 2 aluminium (Country B)"
    ].join("\n")
  );

  assert.equal(parsed.report.errors.length, 0);
  assert.equal(parsed.report.warnings.some((warning) => /Trade line could not be parsed/i.test(warning.message)), false);
  assert.deepEqual(
    parsed.sheet.trades.map((trade) => [
      trade.direction,
      trade.counterpart_name,
      trade.resource_type,
      trade.amount_per_turn
    ]),
    [
      ["import", "Country B", "coal", 1],
      ["import", "Country B", "iron", 1],
      ["import", "Country B", "gold", 3000],
      ["import", "Country C", "necessities", 1],
      ["export", "Country B", "aluminium", 2]
    ]
  );
});

test("stat sheet import resolves player aliases in parenthesized trades and guarantee directions", () => {
  const bundle = buildStatSheetBundleFromTexts([
    {
      content: [
        "# Current Country",
        "## Resources:",
        "**Trades to (imports) and amount:** 2 iron parts (Elf)",
        "**Trades to (exports) and amount:** 1 food (Elf)",
        "## Diplomatics",
        "**Guarantee:** Elf"
      ].join("\n")
    },
    { content: "# Counterpart Country" }
  ]);
  (bundle as typeof bundle & { countryAliases: StatSheetTextFixture["countryAliases"] }).countryAliases = [
    { country_name: "Counterpart Country", aliases: ["Elf"] }
  ];

  const result = applyStatSheetImport(createEmptyState(), bundle);

  assert.equal(
    result.applied,
    true,
    result.report.errors.map((error) => error.message).join("\n")
  );
  const current = result.state.countries.find((country) => country.name === "Current Country");
  const counterpart = result.state.countries.find((country) => country.name === "Counterpart Country");
  assert.ok(current);
  assert.ok(counterpart);
  assert.ok(
    result.state.trades.some(
      (trade) =>
        trade.sender_country_id === counterpart.id &&
        trade.receiver_country_id === current.id &&
        trade.resource_type === "iron_parts" &&
        trade.amount_per_turn === 2
    )
  );
  assert.ok(
    result.state.trades.some(
      (trade) =>
        trade.sender_country_id === current.id &&
        trade.receiver_country_id === counterpart.id &&
        trade.resource_type === "food" &&
        trade.amount_per_turn === 1
    )
  );
  const guarantee = result.state.diplomacy.find((relation) => relation.relation_type === "Guarantee");
  assert.equal(guarantee?.country_a_id, current.id);
  assert.equal(guarantee?.country_b_id, counterpart.id);
});

test("stat sheet import resolves unambiguous shortened player alias references", () => {
  const bundle = buildStatSheetBundleFromTexts([
    {
      content: [
        "# Current Country",
        "## Resources:",
        "**Trades to (imports) and amount:** 1 coal (Coun)"
      ].join("\n")
    },
    { content: "# Counterpart Country" }
  ]);
  (bundle as typeof bundle & { countryAliases: StatSheetTextFixture["countryAliases"] }).countryAliases = [
    { country_name: "Counterpart Country", aliases: ["Counterpart"] }
  ];

  const result = applyStatSheetImport(createEmptyState(), bundle);

  assert.equal(
    result.applied,
    true,
    result.report.errors.map((error) => error.message).join("\n")
  );
  const current = result.state.countries.find((country) => country.name === "Current Country");
  const counterpart = result.state.countries.find((country) => country.name === "Counterpart Country");
  assert.ok(current);
  assert.ok(counterpart);
  assert.ok(
    result.state.trades.some(
      (trade) =>
        trade.sender_country_id === counterpart.id &&
        trade.receiver_country_id === current.id &&
        trade.resource_type === "coal" &&
        trade.amount_per_turn === 1
    )
  );
});

test("stat sheet import refuses malformed bundles with suggested fixes", () => {
  const result = applyStatSheetImport(stateWithCountries(["a"]), {
    kind: "gm-stat-sheet-import",
    version: 1,
    source: { generatedAt: new Date(0).toISOString(), threads: [] },
    sheets: [],
    report: {
      warnings: [],
      errors: [
        {
          severity: "error",
          message: "Missing country name.",
          suggestedFix: "Add a '# Country Name' heading.",
          threadId: "thread-a"
        }
      ]
    }
  });

  assert.equal(result.applied, false);
  assert.match(result.report.errors[0].suggestedFix, /Country Name/i);
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

test("turn action preview summarizes current-turn actions with specific details", () => {
  const state = stateWithCountries(["a", "b"]);
  state.turnNumber = 4;
  state.policies = [
    {
      country_id: "a",
      policy_category: "Healthcare",
      selected_option: "Public Healthcare",
      last_changed_turn: 4
    }
  ];
  state.settlements = [
    { ...makeSettlement("a", "food-a", { biome_or_resource_type: "plains" }), created_turn: 4 } as Settlement,
    { ...makeSettlement("a", "food-b", { biome_or_resource_type: "savannah" }), created_turn: 4 } as Settlement,
    { ...makeSettlement("a", "wood-a", { biome_or_resource_type: "forest" }), created_turn: 4 } as Settlement,
    {
      ...makeSettlement("a", "edited-settlement", { biome_or_resource_type: "iron_ore" }),
      updated_turn: 4,
      updated_fields: ["tier", "connected_for_upkeep"]
    } as Settlement
  ];
  state.factories = [
    {
      id: "factory-gold-a",
      country_id: "a",
      type: "Gold Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: "",
      created_turn: 4
    } as Factory,
    {
      id: "factory-gold-b",
      country_id: "a",
      type: "Gold Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: "",
      created_turn: 4
    } as Factory,
    {
      id: "factory-iron",
      country_id: "a",
      type: "Iron Parts Factory",
      active: true,
      damaged: false,
      bombed: false,
      notes: "",
      created_turn: 4
    } as Factory,
    {
      id: "factory-edited",
      country_id: "a",
      type: "Sawmill",
      active: false,
      damaged: true,
      bombed: false,
      notes: "",
      updated_turn: 4,
      updated_fields: ["active", "damaged"]
    } as Factory
  ];
  state.trades = [
    {
      id: "trade-current",
      sender_country_id: "a",
      receiver_country_id: "b",
      resource_type: "food",
      amount_per_turn: 5,
      payment_gold_per_turn: 2,
      recurring: true,
      route_type: "sea",
      sea_transport_cost_per_unit: 1,
      route_valid: true,
      blocked_by_embargo: false,
      active: true,
      notes: "",
      created_turn: 4
    } as TradeRoute
  ];
  state.operations = [
    {
      id: "operation-current",
      name: "Operation Current",
      attacker_country_id: "a",
      defender_country_id: "b",
      operation_type: "General Push Offensive",
      troops_normal: 2000,
      troops_high_quality: 1000,
      troops_tank: 0,
      supply_required: 3,
      supply_allocated: 2,
      status: "planned",
      notes: "",
      created_turn: 4
    } as MilitaryOperation
  ];
  state.diceRolls = [
    {
      id: "expansion-one",
      turn_number: 4,
      country_id: "a",
      operation_id: null,
      roll_type: "expansion",
      raw_d20: 12,
      modifiers_json: JSON.stringify({ attacker: { terrain: "plain", expansionGoldCost: 500 } }),
      final_score: 12,
      result_category: "success",
      notes: ""
    },
    {
      id: "expansion-two",
      turn_number: 4,
      country_id: "a",
      operation_id: null,
      roll_type: "expansion",
      raw_d20: 4,
      modifiers_json: JSON.stringify({ attacker: { terrain: "forest", expansionGoldCost: 500 } }),
      final_score: 2,
      result_category: "failed",
      notes: ""
    },
    {
      id: "expansion-old",
      turn_number: 3,
      country_id: "a",
      operation_id: null,
      roll_type: "expansion",
      raw_d20: 20,
      modifiers_json: JSON.stringify({ attacker: { terrain: "plain", expansionGoldCost: 500 } }),
      final_score: 20,
      result_category: "success",
      notes: ""
    }
  ] as DiceRollLog[];

  const actionPreview = buildTurnActionPreview(state, previewNextTurn(state));
  const textFor = (sectionId: string) =>
    actionPreview.sections
      .find((section) => section.id === sectionId)
      ?.cards.flatMap((card) => [card.title, ...card.details])
      .join(" ") ?? "";

  assert.match(textFor("expansion"), /Expanded 2 times/);
  assert.match(textFor("expansion"), /Plain x1/);
  assert.match(textFor("expansion"), /Forest x1/);
  assert.doesNotMatch(textFor("expansion"), /3 times/);
  assert.match(textFor("settlements"), /Created 3 settlements/);
  assert.match(textFor("settlements"), /Food x2/);
  assert.match(textFor("settlements"), /Wood x1/);
  assert.match(textFor("settlements"), /Edited 1 settlement/);
  assert.match(textFor("factories"), /Built 3 factories/);
  assert.match(textFor("factories"), /Gold Factory x2/);
  assert.match(textFor("factories"), /Iron Parts Factory x1/);
  assert.match(textFor("factories"), /Gold Ingot x2/);
  assert.match(textFor("factories"), /Iron Parts x1/);
  assert.match(textFor("factories"), /Coal x3/);
  assert.match(textFor("policies"), /Healthcare -> Public Healthcare/);
  assert.match(textFor("trade"), /Food x5/);
  assert.match(textFor("trade"), /2 Gold payment/);
  assert.match(textFor("military"), /General Push Offensive/);
  assert.match(textFor("military"), /Normal 2,000/);
  assert.match(textFor("military"), /Supply 2\/3/);
  assert.equal(actionPreview.activeEffects.openByDefault, false);
});
