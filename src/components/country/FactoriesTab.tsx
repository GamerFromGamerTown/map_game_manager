import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Country, Factory, GameState } from "../../types";
import { createId } from "../../engine/calculations";
import { CheckboxField, Modal, NumberField, SelectField } from "../../ui/fields";
import { ResourceBagView } from "../../ui/ResourceBagView";

export function FactoriesTab({
  state,
  country,
  updateFactory,
  patchState
}: {
  state: GameState;
  country: Country;
  updateFactory: (id: string, patch: Partial<Factory>) => void;
  patchState: (updater: (current: GameState) => GameState) => void;
}) {
  const [creating, setCreating] = useState(false);
  const factories = state.factories.filter((factory) => factory.country_id === country.id);
  const factoryTypes = state.rules.factoryRules.map((rule) => rule.type);

  return (
    <div className="section-stack">
      <button className="large-add-action" onClick={() => setCreating(true)}>
        <Plus size={18} /> Add factory
      </button>
      <div className="factory-card-grid">
        {factories.map((factory) => {
          const rule = state.rules.factoryRules.find((item) => item.type === factory.type);
          return (
            <article className="factory-card" key={factory.id} id={`factory-${factory.id}`} tabIndex={-1}>
              <div className="factory-main-grid">
                <label>
                  <span>Type</span>
                  <select
                    id={`factory-${factory.id}-type`}
                    value={factory.type}
                    onChange={(event) => updateFactory(factory.id, { type: event.target.value })}
                  >
                    {factoryTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <div className="rule-output-box">
                  <span>Inputs</span>
                  <ResourceBagView bag={rule?.inputs_per_turn} />
                </div>
                <div className="rule-output-box">
                  <span>Outputs</span>
                  <ResourceBagView bag={rule?.outputs_per_turn} />
                </div>
              </div>
              <div className="settlement-state-row">
                <CheckboxField label="Active" checked={factory.active} onChange={(active) => updateFactory(factory.id, { active })} />
                <CheckboxField label="Damaged" checked={factory.damaged} onChange={(damaged) => updateFactory(factory.id, { damaged })} />
                <CheckboxField label="Bombed" checked={factory.bombed} onChange={(bombed) => updateFactory(factory.id, { bombed })} />
                <button
                  className="icon danger settlement-delete"
                  onClick={() =>
                    patchState((current) => ({
                      ...current,
                      factories: current.factories.filter((item) => item.id !== factory.id)
                    }))
                  }
                  aria-label={`Delete ${factory.type}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="settlement-notes">
                <details>
                  <summary>Notes</summary>
                  <input value={factory.notes} onChange={(event) => updateFactory(factory.id, { notes: event.target.value })} />
                </details>
              </div>
            </article>
          );
        })}
      </div>
      {creating && (
        <FactoryCreateModal
          factoryTypes={factoryTypes}
          state={state}
          country={country}
          onClose={() => setCreating(false)}
          onCreate={(factoriesToAdd) => {
            patchState((current) => ({ ...current, factories: [...current.factories, ...factoriesToAdd] }));
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function FactoryCreateModal({
  state,
  country,
  factoryTypes,
  onClose,
  onCreate
}: {
  state: GameState;
  country: Country;
  factoryTypes: string[];
  onClose: () => void;
  onCreate: (factories: Factory[]) => void;
}) {
  const [count, setCount] = useState(1);
  const [type, setType] = useState(factoryTypes[0] ?? "Sawmill");
  const [active, setActive] = useState(true);
  const [damaged, setDamaged] = useState(false);
  const [bombed, setBombed] = useState(false);
  const rule = useMemo(() => state.rules.factoryRules.find((item) => item.type === type), [state.rules.factoryRules, type]);

  return (
    <Modal
      title="Create Factories"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() =>
              onCreate(
                Array.from({ length: Math.max(1, count) }, () => ({
                  id: createId("factory"),
                  country_id: country.id,
                  type,
                  active,
                  damaged,
                  bombed,
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
        <SelectField label="Type" value={type} options={factoryTypes} onChange={setType} />
        <CheckboxField label="Active" checked={active} onChange={setActive} />
        <CheckboxField label="Damaged" checked={damaged} onChange={setDamaged} />
        <CheckboxField label="Bombed" checked={bombed} onChange={setBombed} />
      </div>
      <div className="rule-preview">
        <span>Inputs: <ResourceBagView bag={rule?.inputs_per_turn} /></span>
        <span>Outputs: <ResourceBagView bag={rule?.outputs_per_turn} /></span>
      </div>
    </Modal>
  );
}
