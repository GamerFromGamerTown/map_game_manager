import { Plus, Trash2 } from "lucide-react";
import { Country, DiplomaticRelation, GameState, MilitaryOperation, PuppetRelation, RESOURCE_TYPES, TradeRoute } from "../../types";
import { createId } from "../../engine/calculations";
import { asNumber, CheckboxField } from "../../ui/fields";
import { countryName } from "../../utils/names";

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
      diplomacy: current.diplomacy.map((relation) => (relation.id === id ? { ...relation, ...patch } : relation))
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
              {
                id: createId("relation"),
                relation_type: current.rules.diplomacyRelationTypes[0],
                country_a_id: country.id,
                country_b_id: other.id,
                active: true,
                notes: ""
              }
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
  const rows = state.puppets.filter((row) => row.master_country_id === country.id || row.puppet_country_id === country.id);
  const typeOptions = Object.keys(state.rules.puppetTypes);
  const update = (id: string, patch: Partial<PuppetRelation>) =>
    patchState((current) => ({ ...current, puppets: current.puppets.map((row) => (row.id === id ? { ...row, ...patch } : row)) }));

  return (
    <div className="section-stack">
      <button onClick={() => addPuppet(state, country, patchState)}><Plus size={16} /> Puppet</button>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Master</th><th>Puppet</th><th>Type</th><th>Tribute %</th><th>Immunity</th><th>Active</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{countryName(state, row.master_country_id)}</td>
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

function addPuppet(state: GameState, country: Country, patchState: (updater: (current: GameState) => GameState) => void) {
  const subject = state.countries.find((item) => item.id !== country.id);
  if (!subject) return;
  const type = Object.keys(state.rules.puppetTypes)[0] ?? "Protectorate";
  const rule = state.rules.puppetTypes[type];
  patchState((current) => ({
    ...current,
    puppets: [
      ...current.puppets,
      {
        id: createId("puppet"),
        master_country_id: country.id,
        puppet_country_id: subject.id,
        puppet_type: type,
        tribute_percent: rule?.tribute_percent === "custom" ? 50 : Number(rule?.tribute_percent ?? 50),
        rebellion_immunity_turns_remaining: current.rules.settings.puppet_rebellion_immunity_turns,
        active: true,
        notes: ""
      }
    ]
  }));
}

export function TradeTab({ state, country, patchState }: { state: GameState; country: Country; patchState: (updater: (current: GameState) => GameState) => void }) {
  const rows = state.trades.filter((trade) => trade.sender_country_id === country.id || trade.receiver_country_id === country.id);
  const update = (id: string, patch: Partial<TradeRoute>) =>
    patchState((current) => ({ ...current, trades: current.trades.map((trade) => (trade.id === id ? { ...trade, ...patch } : trade)) }));

  return (
    <div className="section-stack">
      <button onClick={() => addTrade(state, country, patchState)}><Plus size={16} /> Trade Route</button>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Sender</th><th>Receiver</th><th>Resource</th><th>Amount</th><th>Payment</th><th>Route</th><th>Sea cost</th><th>Flags</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{countryName(state, row.sender_country_id)}</td>
                <td><CountrySelect state={state} value={row.receiver_country_id} exclude={row.sender_country_id} onChange={(receiver_country_id) => update(row.id, { receiver_country_id })} /></td>
                <td><select value={row.resource_type} onChange={(event) => update(row.id, { resource_type: event.target.value as TradeRoute["resource_type"] })}>{["gold", ...RESOURCE_TYPES].map((resource) => <option key={resource}>{resource}</option>)}</select></td>
                <td><input type="number" value={row.amount_per_turn} onChange={(event) => update(row.id, { amount_per_turn: asNumber(event.target.value) })} /></td>
                <td><input type="number" value={row.payment_gold_per_turn ?? 0} onChange={(event) => update(row.id, { payment_gold_per_turn: asNumber(event.target.value) })} /></td>
                <td><select value={row.route_type} onChange={(event) => update(row.id, { route_type: event.target.value as TradeRoute["route_type"] })}>{["road", "railway", "sea", "abstract"].map((type) => <option key={type}>{type}</option>)}</select></td>
                <td><input type="number" value={row.sea_transport_cost_per_unit} onChange={(event) => update(row.id, { sea_transport_cost_per_unit: asNumber(event.target.value) })} /></td>
                <td className="inline-checks"><CheckboxField label="Valid" checked={row.route_valid} onChange={(route_valid) => update(row.id, { route_valid })} /><CheckboxField label="Blocked" checked={row.blocked_by_embargo} onChange={(blocked_by_embargo) => update(row.id, { blocked_by_embargo })} /><CheckboxField label="Active" checked={row.active} onChange={(active) => update(row.id, { active })} /></td>
                <td><input value={row.notes} onChange={(event) => update(row.id, { notes: event.target.value })} /></td>
                <td><DeleteButton onClick={() => patchState((current) => ({ ...current, trades: current.trades.filter((item) => item.id !== row.id) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function addTrade(state: GameState, country: Country, patchState: (updater: (current: GameState) => GameState) => void) {
  const receiver = state.countries.find((item) => item.id !== country.id);
  if (!receiver) return;
  patchState((current) => ({
    ...current,
    trades: [
      ...current.trades,
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
      }
    ]
  }));
}

export function MilitaryTab({ state, country, patchState }: { state: GameState; country: Country; patchState: (updater: (current: GameState) => GameState) => void }) {
  const rows = state.operations.filter((operation) => operation.attacker_country_id === country.id || operation.defender_country_id === country.id);
  const update = (id: string, patch: Partial<MilitaryOperation>) =>
    patchState((current) => ({ ...current, operations: current.operations.map((row) => (row.id === id ? { ...row, ...patch } : row)) }));

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
      }
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

export function NotesTab({ state, country, updateCountry }: { state: GameState; country: Country; updateCountry: (id: string, patch: Partial<Country>) => void }) {
  return (
    <div className="section-stack">
      <textarea className="notes-area" value={country.notes} onChange={(event) => updateCountry(country.id, { notes: event.target.value })} />
      <JsonTable rows={state.overrides.filter((override) => override.entity_id === country.id)} />
    </div>
  );
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
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
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
            <dt>{key}</dt>
            <dd>{item && typeof item === "object" ? <StructuredValue value={item} /> : String(item ?? "")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value ?? "")}</span>;
}
