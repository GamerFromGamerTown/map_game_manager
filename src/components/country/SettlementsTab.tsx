import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Country, GameState, RESOURCE_TYPES, ResourceBag, ResourceType, Settlement, SettlementTier } from "../../types";
import { createId } from "../../engine/calculations";
import { asNumber, CheckboxField, Modal, NumberField, SelectField, TextField } from "../../ui/fields";

const firstProduction = (bag?: ResourceBag | null): { resource: ResourceType | "calculated"; amount: number } => {
  const entry = Object.entries(bag ?? {}).find(([, amount]) => Number(amount) !== 0);
  if (!entry) return { resource: "calculated", amount: 0 };
  return { resource: entry[0] as ResourceType, amount: Number(entry[1]) };
};

export function SettlementsTab({
  state,
  country,
  updateSettlement,
  patchState
}: {
  state: GameState;
  country: Country;
  updateSettlement: (id: string, patch: Partial<Settlement>) => void;
  patchState: (updater: (current: GameState) => GameState) => void;
}) {
  const [creating, setCreating] = useState(false);
  const settlements = state.settlements.filter((settlement) => settlement.country_id === country.id);

  return (
    <div className="section-stack">
      <button onClick={() => setCreating(true)}>
        <Plus size={16} /> Settlement
      </button>
      <div className="table-wrap" id={`settlements-${country.id}`} tabIndex={-1}>
        <table className="country-data-table dense-table sticky-first-column">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tier</th>
              <th>Capital</th>
              <th>Biome/resource</th>
              <th>Produces</th>
              <th>Amount</th>
              <th>State</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((settlement) => {
              const production = firstProduction(settlement.manual_resource_override);
              return (
                <tr key={settlement.id} id={`settlement-${settlement.id}`} tabIndex={-1}>
                  <td><input id={`settlement-${settlement.id}-name`} value={settlement.name} onChange={(event) => updateSettlement(settlement.id, { name: event.target.value })} /></td>
                  <td>
                    <select value={settlement.tier} onChange={(event) => updateSettlement(settlement.id, { tier: event.target.value as SettlementTier })}>
                      {(["village", "city", "large_city", "metropole"] as SettlementTier[]).map((tier) => <option key={tier}>{tier}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      id={`settlement-${settlement.id}-capital`}
                      type="checkbox"
                      checked={settlement.is_capital}
                      onChange={(event) =>
                        patchState((current) => ({
                          ...current,
                          settlements: current.settlements.map((item) =>
                            item.country_id === country.id
                              ? { ...item, is_capital: item.id === settlement.id ? event.target.checked : false }
                              : item
                          )
                        }))
                      }
                    />
                  </td>
                  <td>
                    <select id={`settlement-${settlement.id}-biome`} value={settlement.biome_or_resource_type} onChange={(event) => updateSettlement(settlement.id, { biome_or_resource_type: event.target.value })}>
                      {Object.keys(state.rules.resourceProduction).map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={production.resource}
                      onChange={(event) => {
                        const resource = event.target.value as ResourceType | "calculated";
                        updateSettlement(settlement.id, {
                          manual_resource_override: resource === "calculated" ? null : { [resource]: production.amount || 1 }
                        });
                      }}
                    >
                      <option value="calculated">calculated</option>
                      {RESOURCE_TYPES.map((resource) => <option key={resource}>{resource}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={production.amount}
                      disabled={production.resource === "calculated"}
                      onChange={(event) =>
                        production.resource !== "calculated" &&
                        updateSettlement(settlement.id, { manual_resource_override: { [production.resource]: asNumber(event.target.value) } })
                      }
                    />
                  </td>
                  <td className="inline-checks">
                    <CheckboxField label="Damaged" checked={settlement.damaged} onChange={(damaged) => updateSettlement(settlement.id, { damaged })} />
                    <CheckboxField label="Bombed" checked={settlement.bombed} onChange={(bombed) => updateSettlement(settlement.id, { bombed })} />
                    <CheckboxField label="Connected" checked={settlement.connected_for_upkeep} onChange={(connected_for_upkeep) => updateSettlement(settlement.id, { connected_for_upkeep })} />
                  </td>
                  <td><input value={settlement.notes} onChange={(event) => updateSettlement(settlement.id, { notes: event.target.value })} /></td>
                  <td>
                    <button className="icon danger" onClick={() => patchState((current) => ({ ...current, settlements: current.settlements.filter((item) => item.id !== settlement.id) }))}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {creating && (
        <SettlementCreateModal
          state={state}
          country={country}
          onClose={() => setCreating(false)}
          onCreate={(settlementsToAdd) => {
            patchState((current) => ({ ...current, settlements: [...current.settlements, ...settlementsToAdd] }));
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function SettlementCreateModal({
  state,
  country,
  onClose,
  onCreate
}: {
  state: GameState;
  country: Country;
  onClose: () => void;
  onCreate: (settlements: Settlement[]) => void;
}) {
  const [count, setCount] = useState(1);
  const [baseName, setBaseName] = useState("New Settlement");
  const [tier, setTier] = useState<SettlementTier>("village");
  const [biome, setBiome] = useState("plains");
  const [productionResource, setProductionResource] = useState<ResourceType | "calculated">("calculated");
  const [productionAmount, setProductionAmount] = useState(1);
  const [firstCapital, setFirstCapital] = useState(false);
  const names = useMemo(
    () => Array.from({ length: Math.max(1, count) }, (_, index) => (count === 1 ? baseName : `${baseName} ${index + 1}`)),
    [baseName, count]
  );

  return (
    <Modal
      title="Create Settlements"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() =>
              onCreate(
                names.map((name, index) => ({
                  id: createId("town"),
                  country_id: country.id,
                  name,
                  tier,
                  is_capital: firstCapital && index === 0,
                  biome_or_resource_type: biome,
                  manual_resource_override:
                    productionResource === "calculated" ? null : { [productionResource]: productionAmount },
                  upkeep_option: "A",
                  occupied_by_country_id: null,
                  damaged: false,
                  bombed: false,
                  connected_for_upkeep: true,
                  notes: ""
                }))
              )
            }
          >
            Create
          </button>
        </>
      }
    >
      <div className="form-grid">
        <NumberField label="How many" value={count} min={1} onChange={setCount} />
        <TextField label="Base name" value={baseName} onChange={setBaseName} />
        <SelectField label="Tier" value={tier} options={["village", "city", "large_city", "metropole"]} onChange={(value) => setTier(value as SettlementTier)} />
        <SelectField label="Biome/resource" value={biome} options={Object.keys(state.rules.resourceProduction)} onChange={setBiome} />
        <SelectField label="Production override" value={productionResource} options={["calculated", ...RESOURCE_TYPES]} onChange={(value) => setProductionResource(value as ResourceType | "calculated")} />
        <NumberField label="Override units produced each turn" value={productionAmount} min={0} onChange={setProductionAmount} />
        <CheckboxField label="First is capital" checked={firstCapital} onChange={setFirstCapital} />
      </div>
      <p className="quiet">Names: {names.join(", ")}</p>
    </Modal>
  );
}
