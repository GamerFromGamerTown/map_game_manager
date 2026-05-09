import { Fragment, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Country, DiplomaticRelation, GameState, MilitaryOperation, PuppetRelation, RESOURCE_TYPES, TradeRoute } from "../../types";
import { createId } from "../../engine/calculations";
import { withCreatedTurn, withUpdatedTurn } from "../../data/turnTracking";
import { asNumber, CheckboxField } from "../../ui/fields";
import { countryName } from "../../utils/names";
import { labelFromKey, resourceLabel, routeTypeLabel } from "../../utils/labels";

export function DiplomacyTab({
  state,
  country,
  patchState
}: {
  state: GameState;
  country: Country;
  patchState: (updater: (current: GameState) => GameState) => void;
}) {
  const relations = state.diplomacy.filter(
    (relation) => relation.country_a_id === country.id || relation.country_b_id === country.id
  );
  const other = state.countries.find((item) => item.id !== country.id);
  const update = (id: string, patch: Partial<DiplomaticRelation>) =>
    patchState((current) => ({
      ...current,
      diplomacy: current.diplomacy.map((relation) =>
        relation.id === id ? withUpdatedTurn(relation, patch, current.turnNumber) : relation
      )
    }));

  return (
    <div className="section-stack">
      <button
        disabled={!other}
        onClick={() =>
          other &&
          patchState((current) => ({
            ...current,
            diplomacy: [
              ...current.diplomacy,
              withCreatedTurn(
                {
                  id: createId("relation"),
                  relation_type: current.rules.diplomacyRelationTypes[0],
                  country_a_id: country.id,
                  country_b_id: other.id,
                  active: true,
                  notes: ""
                },
                current.turnNumber
              )
            ]
          }))
        }
      >
        <Plus size={16} /> Relation
      </button>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>A</th><th>B</th><th>Active</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {relations.map((relation) => (
              <tr key={relation.id}>
                <td>
                  <select value={relation.relation_type} onChange={(event) => update(relation.id, { relation_type: event.target.value })}>
                    {state.rules.diplomacyRelationTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </td>
                <td>
                  <select value={relation.country_a_id} onChange={(event) => update(relation.id, { country_a_id: event.target.value })}>
                    {state.countries.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={relation.country_b_id} onChange={(event) => update(relation.id, { country_b_id: event.target.value })}>
                    {state.countries.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={relation.active} onChange={(event) => update(relation.id, { active: event.target.checked })} /></td>
                <td><input value={relation.notes} onChange={(event) => update(relation.id, { notes: event.target.value })} /></td>
                <td><DeleteButton onClick={() => patchState((current) => ({ ...current, diplomacy: current.diplomacy.filter((item) => item.id !== relation.id) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PuppetsTab({ state, country, patchState }: { state: GameState; country: Country; patchState: (updater: (current: GameState) => GameState) => void }) {
  const [creating, setCreating] = useState<"master" | "subject" | null>(null);
  const rows = state.puppets.filter((row) => row.master_country_id === country.id || row.puppet_country_id === country.id);
  const typeOptions = Object.keys(state.rules.puppetTypes);
  const update = (id: string, patch: Partial<PuppetRelation>) =>
    patchState((current) => ({
      ...current,
      puppets: current.puppets.map((row) => (row.id === id ? withUpdatedTurn(row, patch, current.turnNumber) : row))
    }));

  return (
    <div className="section-stack">
      <div className="actions left">
        <button onClick={() => setCreating(creating === "master" ? null : "master")}><Plus size={16} /> Add subject puppet</button>
        <button onClick={() => setCreating(creating === "subject" ? null : "subject")}><Plus size={16} /> Make this country a puppet</button>
      </div>
      {creating && (
        <PuppetCreatePanel
          state={state}
          country={country}
          mode={creating}
          onCancel={() => setCreating(null)}
          onCreate={(masterId, subjectId, type) => {
            addPuppet(state, masterId, subjectId, type, patchState);
            setCreating(null);
          }}
        />
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Master</th><th>Puppet</th><th>Type</th><th>Tribute %</th><th>Immunity</th><th>Active</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <select value={row.master_country_id} onChange={(event) => update(row.id, { master_country_id: event.target.value })}>
                    {state.countries.filter((item) => item.id !== row.puppet_country_id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={row.puppet_country_id} onChange={(event) => update(row.id, { puppet_country_id: event.target.value })}>
                    {state.countries.filter((item) => item.id !== row.master_country_id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </td>
                <td><select value={row.puppet_type} onChange={(event) => update(row.id, { puppet_type: event.target.value })}>{typeOptions.map((type) => <option key={type}>{type}</option>)}</select></td>
                <td><input type="number" value={row.tribute_percent} onChange={(event) => update(row.id, { tribute_percent: asNumber(event.target.value) })} /></td>
                <td><input type="number" value={row.rebellion_immunity_turns_remaining} onChange={(event) => update(row.id, { rebellion_immunity_turns_remaining: asNumber(event.target.value) })} /></td>
                <td><input type="checkbox" checked={row.active} onChange={(event) => update(row.id, { active: event.target.checked })} /></td>
                <td><input value={row.notes} onChange={(event) => update(row.id, { notes: event.target.value })} /></td>
                <td><DeleteButton onClick={() => patchState((current) => ({ ...current, puppets: current.puppets.filter((item) => item.id !== row.id) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PuppetCreatePanel({
  state,
  country,
  mode,
  onCancel,
  onCreate
}: {
  state: GameState;
  country: Country;
  mode: "master" | "subject";
  onCancel: () => void;
  onCreate: (masterId: string, subjectId: string, type: string) => void;
}) {
  const typeOptions = Object.keys(state.rules.puppetTypes);
  const [masterId, setMasterId] = useState(mode === "master" ? country.id : state.countries.find((item) => item.id !== country.id)?.id ?? country.id);
  const [subjectId, setSubjectId] = useState(mode === "subject" ? country.id : state.countries.find((item) => item.id !== country.id)?.id ?? country.id);
  const [type, setType] = useState(typeOptions[0] ?? "Protectorate");
  const canCreate = masterId !== subjectId;

  return (
    <section className="form-section puppet-create-panel">
      <div className="section-heading">
        <h2>{mode === "master" ? "Add a puppet under this country" : "Make this country a puppet"}</h2>
      </div>
      <div className="form-row three-wide">
        <label>
          <span>Master</span>
          <select value={masterId} onChange={(event) => setMasterId(event.target.value)} disabled={mode === "master"}>
            {state.countries.filter((item) => item.id !== subjectId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Puppet</span>
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={mode === "subject"}>
            {state.countries.filter((item) => item.id !== masterId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Puppet type</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {typeOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
      </div>
      <div className="actions left">
        <button className="primary" disabled={!canCreate} onClick={() => canCreate && onCreate(masterId, subjectId, type)}>Create puppet relation</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function addPuppet(state: GameState, masterId: string, subjectId: string, type: string, patchState: (updater: (current: GameState) => GameState) => void) {
  if (masterId === subjectId) return;
  const rule = state.rules.puppetTypes[type];
  patchState((current) => ({
    ...current,
    puppets: [
      ...current.puppets,
      withCreatedTurn(
        {
          id: createId("puppet"),
          master_country_id: masterId,
          puppet_country_id: subjectId,
          puppet_type: type,
          tribute_percent: rule?.tribute_percent === "custom" ? 50 : Number(rule?.tribute_percent ?? 50),
          rebellion_immunity_turns_remaining: current.rules.settings.puppet_rebellion_immunity_turns,
          active: true,
          notes: ""
        },
        current.turnNumber
      )
    ]
  }));
}

export function TradeTab({ state, country, patchState }: { state: GameState; country: Country; patchState: (updater: (current: GameState) => GameState) => void }) {
  const rows = state.trades.filter((trade) => trade.sender_country_id === country.id || trade.receiver_country_id === country.id);
  const update = (id: string, patch: Partial<TradeRoute>) =>
    patchState((current) => ({
      ...current,
      trades: current.trades.map((trade) => (trade.id === id ? withUpdatedTurn(trade, patch, current.turnNumber) : trade))
    }));

  return (
    <div className="section-stack">
      <button onClick={() => addTrade(state, country, patchState)}><Plus size={16} /> Trade Route</button>
      <div className="table-wrap">
        <table className="trade-route-table">
          <thead><tr><th>From</th><th>To</th><th>Sends</th><th>Amount sent</th><th>Gets gold</th><th>Route</th><th>Sea cost</th><th>Flags</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td>{countryName(state, row.sender_country_id)}</td>
                  <td><CountrySelect state={state} value={row.receiver_country_id} exclude={row.sender_country_id} onChange={(receiver_country_id) => update(row.id, { receiver_country_id })} /></td>
                  <td><select value={row.resource_type} onChange={(event) => update(row.id, { resource_type: event.target.value as TradeRoute["resource_type"] })}>{["gold", ...RESOURCE_TYPES].map((resource) => <option value={resource} key={resource}>{resourceLabel(resource)}</option>)}</select></td>
                  <td><input type="number" value={row.amount_per_turn} onChange={(event) => update(row.id, { amount_per_turn: asNumber(event.target.value) })} /></td>
                  <td><input type="number" value={row.payment_gold_per_turn ?? 0} onChange={(event) => update(row.id, { payment_gold_per_turn: asNumber(event.target.value) })} /></td>
                  <td><select value={row.route_type} onChange={(event) => update(row.id, { route_type: event.target.value as TradeRoute["route_type"] })}>{["road", "railway", "sea", "abstract"].map((type) => <option value={type} key={type}>{routeTypeLabel(type)}</option>)}</select></td>
                  <td><input type="number" value={row.sea_transport_cost_per_unit} onChange={(event) => update(row.id, { sea_transport_cost_per_unit: asNumber(event.target.value) })} /></td>
                  <td className="inline-checks"><CheckboxField label="Valid" checked={row.route_valid} onChange={(route_valid) => update(row.id, { route_valid })} /><CheckboxField label="Blocked" checked={row.blocked_by_embargo} onChange={(blocked_by_embargo) => update(row.id, { blocked_by_embargo })} /><CheckboxField label="Active" checked={row.active} onChange={(active) => update(row.id, { active })} /></td>
                  <td><DeleteButton onClick={() => patchState((current) => ({ ...current, trades: current.trades.filter((item) => item.id !== row.id) }))} /></td>
                </tr>
                <tr className="trade-summary-row">
                  <td colSpan={9}>
                    <div className="trade-summary-line">{tradeSummary(state, row)}</div>
                    <input value={row.notes} placeholder="Trade notes" onChange={(event) => update(row.id, { notes: event.target.value })} />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function tradeSummary(state: GameState, row: TradeRoute): string {
  const sender = countryName(state, row.sender_country_id);
  const receiver = countryName(state, row.receiver_country_id);
  const payment = Number(row.payment_gold_per_turn ?? 0);
  return `${sender} sends ${row.amount_per_turn} ${resourceLabel(row.resource_type)} to ${receiver} for ${payment} Gold per turn.`;
}

function addTrade(state: GameState, country: Country, patchState: (updater: (current: GameState) => GameState) => void) {
  const receiver = state.countries.find((item) => item.id !== country.id);
  if (!receiver) return;
  patchState((current) => ({
    ...current,
    trades: [
      ...current.trades,
      withCreatedTurn(
        {
          id: createId("trade"),
          sender_country_id: country.id,
          receiver_country_id: receiver.id,
          resource_type: "food",
          amount_per_turn: 1,
          payment_gold_per_turn: 0,
          recurring: true,
          route_type: "abstract",
          sea_transport_cost_per_unit: current.rules.settings.sea_transport_cost_per_unit_resource,
          sea_cost_payer: "sender",
          route_valid: true,
          blocked_by_embargo: false,
          active: true,
          notes: ""
        },
        current.turnNumber
      )
    ]
  }));
}

export function MilitaryTab({ state, country, patchState }: { state: GameState; country: Country; patchState: (updater: (current: GameState) => GameState) => void }) {
  const rows = state.operations.filter((operation) => operation.attacker_country_id === country.id || operation.defender_country_id === country.id);
  const update = (id: string, patch: Partial<MilitaryOperation>) =>
    patchState((current) => ({
      ...current,
      operations: current.operations.map((row) => (row.id === id ? withUpdatedTurn(row, patch, current.turnNumber) : row))
    }));

  return (
    <div className="section-stack">
      <button onClick={() => addOperation(state, country, patchState)}><Plus size={16} /> Operation</button>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Attacker</th><th>Defender</th><th>Troops N/Q/T</th><th>Supply</th><th>Status</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><input value={row.name} onChange={(event) => update(row.id, { name: event.target.value })} /></td>
                <td><select value={row.operation_type} onChange={(event) => update(row.id, { operation_type: event.target.value, supply_required: state.rules.military.operations[event.target.value]?.supply_required ?? row.supply_required })}>{Object.keys(state.rules.military.operations).map((type) => <option key={type}>{type}</option>)}</select></td>
                <td>{countryName(state, row.attacker_country_id)}</td>
                <td><CountrySelect state={state} value={row.defender_country_id} exclude={row.attacker_country_id} onChange={(defender_country_id) => update(row.id, { defender_country_id })} /></td>
                <td className="triple-input"><input type="number" value={row.troops_normal} onChange={(event) => update(row.id, { troops_normal: asNumber(event.target.value) })} /><input type="number" value={row.troops_high_quality} onChange={(event) => update(row.id, { troops_high_quality: asNumber(event.target.value) })} /><input type="number" value={row.troops_tank} onChange={(event) => update(row.id, { troops_tank: asNumber(event.target.value) })} /></td>
                <td className="triple-input two"><input type="number" value={row.supply_required} onChange={(event) => update(row.id, { supply_required: asNumber(event.target.value) })} /><input type="number" value={row.supply_allocated} onChange={(event) => update(row.id, { supply_allocated: asNumber(event.target.value) })} /></td>
                <td><input value={row.status} onChange={(event) => update(row.id, { status: event.target.value })} /></td>
                <td><input value={row.notes} onChange={(event) => update(row.id, { notes: event.target.value })} /></td>
                <td><DeleteButton onClick={() => patchState((current) => ({ ...current, operations: current.operations.filter((item) => item.id !== row.id) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function addOperation(state: GameState, country: Country, patchState: (updater: (current: GameState) => GameState) => void) {
  const defender = state.countries.find((item) => item.id !== country.id);
  if (!defender) return;
  const operation_type = Object.keys(state.rules.military.operations)[0] ?? "General Push Offensive";
  patchState((current) => ({
    ...current,
    operations: [
      ...current.operations,
      withCreatedTurn(
        {
          id: createId("operation"),
          name: "New Operation",
          attacker_country_id: country.id,
          defender_country_id: defender.id,
          operation_type,
          troops_normal: 0,
          troops_high_quality: 0,
          troops_tank: 0,
          supply_required: state.rules.military.operations[operation_type]?.supply_required ?? 1,
          supply_allocated: 0,
          status: "planned",
          notes: ""
        },
        current.turnNumber
      )
    ]
  }));
}

export function DiceLogTab({ state, country }: { state: GameState; country: Country }) {
  const logs = state.diceRolls.filter((roll) => roll.country_id === country.id);
  return <JsonTable rows={logs.map((log) => ({ turn: log.turn_number, type: log.roll_type, d20: log.raw_d20, final: log.final_score, result: log.result_category, modifiers: log.modifiers_json, notes: log.notes }))} />;
}

export function TurnHistoryTab({ state, country }: { state: GameState; country: Country }) {
  const rows = state.turnLogs.filter((log) => log.country_id === country.id).slice().reverse();
  return <JsonTable rows={rows.map((log) => ({ turn: log.turn_number, gold: `${log.gold_before} -> ${log.gold_after}`, stability: `${log.stability_before} -> ${log.stability_after}`, manpower: `${log.manpower_before} -> ${log.manpower_after}`, warnings: log.warnings_json, formula: log.formula_breakdown_json, notes: log.gm_notes }))} />;
}

function CountrySelect({ state, value, exclude, onChange }: { state: GameState; value: string; exclude?: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {state.countries.filter((country) => country.id !== exclude).map((country) => <option value={country.id} key={country.id}>{country.name}</option>)}
    </select>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return <button className="icon danger" onClick={onClick}><Trash2 size={16} /></button>;
}

function JsonTable({ rows }: { rows: object[] }) {
  if (rows.length === 0) return <p className="quiet">No records.</p>;
  const normalized = rows as Array<Record<string, unknown>>;
  const columns = Object.keys(normalized[0]);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{labelFromKey(column)}</th>)}</tr></thead>
        <tbody>
          {normalized.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => <td key={column}><DisplayCell value={row[column]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DisplayCell({ value }: { value: unknown }) {
  if (typeof value === "string" && (value.trim().startsWith("{") || value.trim().startsWith("["))) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return <StructuredValue value={parsed} />;
    } catch {
      return <span>{value}</span>;
    }
  }
  return <span>{String(value ?? "")}</span>;
}

function StructuredValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="quiet">None</span>;
    return <ul className="compact-list">{value.map((item, index) => <li key={index}>{String(item)}</li>)}</ul>;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="quiet">None</span>;
    return (
      <dl className="compact-dl">
        {entries.map(([key, item]) => (
          <div key={key}>
            <dt>{labelFromKey(key)}</dt>
            <dd>{item && typeof item === "object" ? <StructuredValue value={item} /> : String(item ?? "")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value ?? "")}</span>;
}
