import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Country, GameState, ResourceBag, Settlement, SettlementTier } from "../../types";
import { createId, settlementProductionForCountry } from "../../engine/calculations";
import { CheckboxField, Modal, NumberField, SelectField, TextField } from "../../ui/fields";

const formatAmount = (amount: number): string => (Number.isInteger(amount) ? String(amount) : amount.toFixed(2));

const productionSummary = (bag: ResourceBag): string => {
  const entries = Object.entries(bag).filter(([, amount]) => Number(amount) !== 0);
  if (entries.length === 0) return "No resource output";
  return entries.map(([resource, amount]) => `${resource} x${formatAmount(Number(amount))} / turn`).join(", ");
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
      <button className="large-add-action" onClick={() => setCreating(true)}>
        <Plus size={18} /> Add settlement
      </button>
      <div className="settlement-card-grid" id={`settlements-${country.id}`} tabIndex={-1}>
        {settlements.map((settlement) => (
          <article className="settlement-card" key={settlement.id} id={`settlement-${settlement.id}`} tabIndex={-1}>
            <div className="settlement-main-grid">
              <label className="settlement-name-field">
                <span>Name</span>
                <input
                  id={`settlement-${settlement.id}-name`}
                  value={settlement.name}
                  onChange={(event) => updateSettlement(settlement.id, { name: event.target.value })}
                />
              </label>
              <label>
                <span>Tier</span>
                <select
                  value={settlement.tier}
                  onChange={(event) => updateSettlement(settlement.id, { tier: event.target.value as SettlementTier })}
                >
                  {(["village", "city", "large_city", "metropole"] as SettlementTier[]).map((tier) => (
                    <option key={tier}>{tier}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Biome/resource</span>
                <select
                  id={`settlement-${settlement.id}-biome`}
                  value={settlement.biome_or_resource_type}
                  onChange={(event) =>
                    updateSettlement(settlement.id, {
                      biome_or_resource_type: event.target.value,
                      manual_resource_override: null
                    })
                  }
                >
                  {Object.keys(state.rules.resourceProduction).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Output</span>
                <div className="derived-output">{productionSummary(settlementProductionForCountry(state, settlement))}</div>
              </label>
            </div>
            <div className="settlement-state-row">
              <CheckboxField
                label="Connected"
                checked={settlement.connected_for_upkeep}
                onChange={(connected_for_upkeep) => updateSettlement(settlement.id, { connected_for_upkeep })}
              />
              <CheckboxField
                id={`settlement-${settlement.id}-capital`}
                label="Capital"
                checked={settlement.is_capital}
                onChange={(isCapital) =>
                  patchState((current) => ({
                    ...current,
                    settlements: current.settlements.map((item) =>
                      item.country_id === country.id
                        ? { ...item, is_capital: item.id === settlement.id ? isCapital : false }
                        : item
                    )
                  }))
                }
              />
              <CheckboxField label="Damaged" checked={settlement.damaged} onChange={(damaged) => updateSettlement(settlement.id, { damaged })} />
              <CheckboxField label="Bombed" checked={settlement.bombed} onChange={(bombed) => updateSettlement(settlement.id, { bombed })} />
              <button
                className="icon danger settlement-delete"
                onClick={() =>
                  patchState((current) => ({
                    ...current,
                    settlements: current.settlements.filter((item) => item.id !== settlement.id)
                  }))
                }
                aria-label={`Delete ${settlement.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="settlement-notes">
              <details>
                <summary>Notes</summary>
                <input value={settlement.notes} onChange={(event) => updateSettlement(settlement.id, { notes: event.target.value })} />
              </details>
            </div>
          </article>
        ))}
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
                  manual_resource_override: null,
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
        <CheckboxField label="First is capital" checked={firstCapital} onChange={setFirstCapital} />
      </div>
      <p className="quiet">Names: {names.join(", ")}</p>
    </Modal>
  );
}
