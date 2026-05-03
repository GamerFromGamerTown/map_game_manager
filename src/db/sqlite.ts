import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { GameState } from "../types";
import { parseGameStateJson } from "../data/validation";

const sqlPromise = initSqlJs({
  locateFile: () => wasmUrl
});

const createSchema = `
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE countries (
  id TEXT PRIMARY KEY,
  name TEXT,
  color TEXT,
  is_player_country INTEGER,
  ruling_party TEXT,
  gold REAL,
  stability REAL,
  manpower REAL,
  manpower_cap REAL,
  reserve REAL,
  equipment REAL,
  high_quality_equipment REAL,
  tanks REAL,
  supply REAL,
  current_turn_created INTEGER,
  at_war INTEGER,
  peace_turns_count INTEGER,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  country_id TEXT,
  name TEXT,
  tier TEXT,
  is_capital INTEGER,
  biome_or_resource_type TEXT,
  damaged INTEGER,
  bombed INTEGER,
  connected_for_upkeep INTEGER,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE factories (
  id TEXT PRIMARY KEY,
  country_id TEXT,
  type TEXT,
  active INTEGER,
  damaged INTEGER,
  bombed INTEGER,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE resource_stockpiles (
  country_id TEXT,
  resource_type TEXT,
  amount REAL,
  PRIMARY KEY (country_id, resource_type)
);
CREATE TABLE policy_selections (
  country_id TEXT,
  policy_category TEXT,
  selected_option TEXT,
  last_changed_turn INTEGER,
  PRIMARY KEY (country_id, policy_category)
);
CREATE TABLE diplomatic_relations (
  id TEXT PRIMARY KEY,
  relation_type TEXT,
  country_a_id TEXT,
  country_b_id TEXT,
  active INTEGER,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE puppet_relations (
  id TEXT PRIMARY KEY,
  master_country_id TEXT,
  puppet_country_id TEXT,
  puppet_type TEXT,
  tribute_percent REAL,
  rebellion_immunity_turns_remaining INTEGER,
  active INTEGER,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE trade_routes (
  id TEXT PRIMARY KEY,
  sender_country_id TEXT,
  receiver_country_id TEXT,
  resource_type TEXT,
  amount_per_turn REAL,
  payment_gold_per_turn REAL,
  route_type TEXT,
  sea_transport_cost_per_unit REAL,
  route_valid INTEGER,
  blocked_by_embargo INTEGER,
  active INTEGER,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE military_operations (
  id TEXT PRIMARY KEY,
  name TEXT,
  attacker_country_id TEXT,
  defender_country_id TEXT,
  operation_type TEXT,
  troops_normal REAL,
  troops_high_quality REAL,
  troops_tank REAL,
  supply_required REAL,
  supply_allocated REAL,
  status TEXT,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE dice_roll_logs (
  id TEXT PRIMARY KEY,
  turn_number INTEGER,
  country_id TEXT,
  operation_id TEXT,
  roll_type TEXT,
  raw_d20 INTEGER,
  modifiers_json TEXT,
  final_score REAL,
  result_category TEXT,
  notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE turn_logs (
  id TEXT PRIMARY KEY,
  turn_number INTEGER,
  country_id TEXT,
  gold_before REAL,
  gold_after REAL,
  stability_before REAL,
  stability_after REAL,
  manpower_before REAL,
  manpower_after REAL,
  resources_before_json TEXT,
  resources_after_json TEXT,
  formula_breakdown_json TEXT,
  warnings_json TEXT,
  gm_notes TEXT,
  json TEXT NOT NULL
);
CREATE TABLE override_logs (
  id TEXT PRIMARY KEY,
  turn_number INTEGER,
  entity_type TEXT,
  entity_id TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  timestamp TEXT,
  json TEXT NOT NULL
);
CREATE TABLE diplomacy_graph_positions (
  country_id TEXT PRIMARY KEY,
  x REAL,
  y REAL
);
`;

const insert = (db: import("sql.js").Database, sql: string, rows: unknown[][]) => {
  const statement = db.prepare(sql);
  try {
    rows.forEach((row) => statement.run(row));
  } finally {
    statement.free();
  }
};

export const exportStateAsSqlite = async (state: GameState): Promise<Uint8Array> => {
  const SQL = await sqlPromise;
  const db = new SQL.Database();
  db.run(createSchema);

  insert(db, "INSERT INTO metadata (key, value) VALUES (?, ?)", [
    ["schema_version", String(state.schemaVersion)],
    ["turn_number", String(state.turnNumber)],
    ["rules_json", JSON.stringify(state.rules)],
    ["game_state_json", JSON.stringify(state)]
  ]);

  insert(
    db,
    `INSERT INTO countries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.countries.map((country) => [
      country.id,
      country.name,
      country.color,
      country.is_player_country ? 1 : 0,
      country.ruling_party,
      country.gold,
      country.stability,
      country.manpower,
      country.manpower_cap,
      country.reserve,
      country.equipment,
      country.high_quality_equipment,
      country.tanks,
      country.supply,
      country.current_turn_created,
      country.at_war ? 1 : 0,
      country.peace_turns_count,
      country.notes,
      JSON.stringify(country)
    ])
  );

  insert(
    db,
    `INSERT INTO settlements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.settlements.map((settlement) => [
      settlement.id,
      settlement.country_id,
      settlement.name,
      settlement.tier,
      settlement.is_capital ? 1 : 0,
      settlement.biome_or_resource_type,
      settlement.damaged ? 1 : 0,
      settlement.bombed ? 1 : 0,
      settlement.connected_for_upkeep ? 1 : 0,
      settlement.notes,
      JSON.stringify(settlement)
    ])
  );

  insert(
    db,
    `INSERT INTO factories VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    state.factories.map((factory) => [
      factory.id,
      factory.country_id,
      factory.type,
      factory.active ? 1 : 0,
      factory.damaged ? 1 : 0,
      factory.bombed ? 1 : 0,
      factory.notes,
      JSON.stringify(factory)
    ])
  );

  insert(
    db,
    `INSERT INTO resource_stockpiles VALUES (?, ?, ?)`,
    state.stockpiles.map((row) => [row.country_id, row.resource_type, row.amount])
  );

  insert(
    db,
    `INSERT INTO policy_selections VALUES (?, ?, ?, ?)`,
    state.policies.map((policy) => [
      policy.country_id,
      policy.policy_category,
      policy.selected_option,
      policy.last_changed_turn
    ])
  );

  insert(
    db,
    `INSERT INTO diplomatic_relations VALUES (?, ?, ?, ?, ?, ?, ?)`,
    state.diplomacy.map((relation) => [
      relation.id,
      relation.relation_type,
      relation.country_a_id,
      relation.country_b_id,
      relation.active ? 1 : 0,
      relation.notes,
      JSON.stringify(relation)
    ])
  );

  insert(
    db,
    `INSERT INTO puppet_relations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.puppets.map((puppet) => [
      puppet.id,
      puppet.master_country_id,
      puppet.puppet_country_id,
      puppet.puppet_type,
      puppet.tribute_percent,
      puppet.rebellion_immunity_turns_remaining,
      puppet.active ? 1 : 0,
      puppet.notes,
      JSON.stringify(puppet)
    ])
  );

  insert(
    db,
    `INSERT INTO trade_routes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.trades.map((route) => [
      route.id,
      route.sender_country_id,
      route.receiver_country_id,
      route.resource_type,
      route.amount_per_turn,
      route.payment_gold_per_turn ?? 0,
      route.route_type,
      route.sea_transport_cost_per_unit,
      route.route_valid ? 1 : 0,
      route.blocked_by_embargo ? 1 : 0,
      route.active ? 1 : 0,
      route.notes,
      JSON.stringify(route)
    ])
  );

  insert(
    db,
    `INSERT INTO military_operations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.operations.map((operation) => [
      operation.id,
      operation.name,
      operation.attacker_country_id,
      operation.defender_country_id,
      operation.operation_type,
      operation.troops_normal,
      operation.troops_high_quality,
      operation.troops_tank,
      operation.supply_required,
      operation.supply_allocated,
      operation.status,
      operation.notes,
      JSON.stringify(operation)
    ])
  );

  insert(
    db,
    `INSERT INTO dice_roll_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.diceRolls.map((roll) => [
      roll.id,
      roll.turn_number,
      roll.country_id,
      roll.operation_id ?? "",
      roll.roll_type,
      roll.raw_d20,
      roll.modifiers_json,
      roll.final_score,
      roll.result_category,
      roll.notes,
      JSON.stringify(roll)
    ])
  );

  insert(
    db,
    `INSERT INTO turn_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.turnLogs.map((log) => [
      log.id,
      log.turn_number,
      log.country_id,
      log.gold_before,
      log.gold_after,
      log.stability_before,
      log.stability_after,
      log.manpower_before,
      log.manpower_after,
      log.resources_before_json,
      log.resources_after_json,
      log.formula_breakdown_json,
      log.warnings_json,
      log.gm_notes,
      JSON.stringify(log)
    ])
  );

  insert(
    db,
    `INSERT INTO override_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.overrides.map((override) => [
      override.id,
      override.turn_number,
      override.entity_type,
      override.entity_id,
      override.field_name,
      override.old_value,
      override.new_value,
      override.reason,
      override.timestamp,
      JSON.stringify(override)
    ])
  );

  insert(
    db,
    `INSERT INTO diplomacy_graph_positions VALUES (?, ?, ?)`,
    Object.entries(state.graphPositions).map(([countryId, position]) => [countryId, position.x, position.y])
  );

  const bytes = db.export();
  db.close();
  return bytes;
};

export const importStateFromSqliteFile = async (file: File): Promise<GameState> => {
  const SQL = await sqlPromise;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const db = new SQL.Database(bytes);
  const result = db.exec("SELECT value FROM metadata WHERE key = 'game_state_json' LIMIT 1");
  db.close();

  if (!result[0]?.values[0]?.[0]) {
    throw new Error("SQLite file does not contain a game_state_json metadata row.");
  }

  return parseGameStateJson(String(result[0].values[0][0]));
};

export const downloadBytes = (bytes: Uint8Array, filename: string, type: string) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const downloadJson = (state: GameState, filename: string) => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};
