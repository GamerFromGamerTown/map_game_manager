import assert from "node:assert/strict";
import { commitTurn, previewNextTurn } from "../src/engine/calculations";
import starterGameJson from "../src/data/starter_game.json";
import { normalizeLoadedState } from "../src/data/migrations";
import { validateGameState } from "../src/data/validation";
import { policyChangeStabilityCost } from "../src/engine/policies";
import { normalizePreviewWarnings } from "../src/ui/warningModel";
import { buildTurnTransactionSummary } from "../src/ui/turnTransaction";
import type { GameState } from "../src/types";

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

test("validation accepts the seed state and rejects partial imports", () => {
  const seed = validateGameState(starterGameJson) as GameState;
  assert.doesNotThrow(() => validateGameState(seed));
  assert.throws(() => validateGameState({ schemaVersion: 2, countries: [] }), /missing|must/i);
  const invalidTrade = clone(seed);
  invalidTrade.trades[0].receiver_country_id = "missing-country";
  assert.throws(() => validateGameState(invalidTrade), /unknown country/i);
});

test("normalization fills newly-added rule defaults without hardcoding country data", () => {
  const state = validateGameState(starterGameJson) as GameState;
  delete (state.rules.settings as Partial<typeof state.rules.settings>).base_capital_gold_per_turn;
  delete state.rules.rulingParties.Democratic.stability_per_turn_at_peace;

  const normalized = normalizeLoadedState(state);
  const preview = previewNextTurn(normalized).countries.find((item) => item.countryId === "magnus");

  assert.equal(normalized.rules.settings.base_capital_gold_per_turn, 2000);
  assert.equal(normalized.rules.rulingParties.Democratic.stability_per_turn_at_peace, 10);
  assert.equal(Number.isFinite(preview?.capitalGold), true);
});

test("commit recomputes preview from the current state instead of trusting stale previews", () => {
  const state = validateGameState(starterGameJson) as GameState;
  const stalePreview = previewNextTurn(state);
  const current = clone(state);
  current.rules.settings.base_manpower_gain_per_turn += 1234;

  const committed = commitTurn(current, stalePreview, "recomputed");
  const log = committed.turnLogs.find((item) => item.country_id === "explo");
  const breakdown = JSON.parse(log?.formula_breakdown_json ?? "{}") as {
    manpower?: { baseAndSettlementsBeforePolicy?: number };
  };

  assert.equal(log?.manpower_after, 33234);
  assert.equal(breakdown.manpower?.baseAndSettlementsBeforePolicy, 15234);
});

test("ruling party effects use editable rule config values", () => {
  const state = validateGameState(starterGameJson) as GameState;
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
  const state = validateGameState(starterGameJson) as GameState;
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
  const state = validateGameState(starterGameJson) as GameState;
  (state.rules.settings as GameState["rules"]["settings"] & { base_capital_gold_per_turn: number })
    .base_capital_gold_per_turn = 123;

  const preview = previewNextTurn(state).countries.find((item) => item.countryId === "magnus");

  assert.equal(preview?.capitalGold, 123);
});

test("application logic does not special-case the Player Country name", () => {
  const state = validateGameState(starterGameJson) as GameState;
  state.turnNumber = 0;
  state.countries = [clone(state.countries[0])];
  state.countries[0].id = "test-country";
  state.countries[0].name = "Player Country";
  state.settlements = state.settlements
    .filter((settlement) => settlement.country_id === "explo")
    .map((settlement) => ({ ...settlement, country_id: "test-country" }));
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

test("preview warnings are normalized into actionable fix targets", () => {
  const state = validateGameState(starterGameJson) as GameState;
  const preview = previewNextTurn(state);
  const warnings = normalizePreviewWarnings(state, preview);

  assert.ok(warnings.length > 0);
  assert.equal(warnings.every((warning) => warning.id && warning.message && warning.recommendedAction), true);
  assert.equal(warnings.every((warning) => warning.target.view && warning.target.label), true);

  const necessityWarning = warnings.find(
    (warning) => warning.countryId === "dew" && warning.fieldPath === "stockpiles.necessities"
  );

  assert.ok(necessityWarning);
  assert.equal(necessityWarning.severity, "error");
  assert.equal(necessityWarning.entityType, "resource");
  assert.equal(necessityWarning.target.view, "country");
  assert.equal(necessityWarning.target.countryTab, "Production");
  assert.equal(necessityWarning.target.focusId, "resource-dew-necessities");
  assert.match(necessityWarning.recommendedAction, /add.*necessities|imports/i);
});

test("turn transaction summary blocks severe warnings until override reason is supplied", () => {
  const state = validateGameState(starterGameJson) as GameState;
  const preview = previewNextTurn(state);
  const summary = buildTurnTransactionSummary(state, preview, "");
  const overrideSummary = buildTurnTransactionSummary(state, preview, "GM accepts unresolved blockers for this turn");

  assert.equal(summary.nextTurnNumber, state.turnNumber + 1);
  assert.ok(summary.countryDeltas.length >= state.countries.length);
  assert.ok(summary.resourceDeltas.some((row) => row.resource === "food" && row.delta !== 0));
  assert.ok(summary.unresolvedBlockers.length > 0);
  assert.equal(summary.canCommit, false);
  assert.match(summary.commitBlockReason, /override reason/i);

  assert.equal(overrideSummary.canCommit, true);
  assert.equal(overrideSummary.overrideReason, "GM accepts unresolved blockers for this turn");
  assert.ok(overrideSummary.warningsIntroduced.length >= summary.unresolvedBlockers.length);
});
