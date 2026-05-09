import { useMemo, useState } from "react";
import { GameState, RESOURCE_TYPES, ResourceType, SettlementTier } from "../../types";
import { createId } from "../../engine/calculations";
import { withCreatedTurn } from "../../data/turnTracking";
import { asNumber, CheckboxField, Modal, NumberField, SelectField, TextField } from "../../ui/fields";
import { biomeLabel, labelFromKey, resourceLabel, settlementTypeOptions } from "../../utils/labels";

export function CountryOnboardingModal({
  state,
  onCreate,
  onClose
}: {
  state: GameState;
  onCreate: (next: GameState, countryId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("New Country");
  const [shortName, setShortName] = useState("");
  const [color, setColor] = useState("#8d6fcb");
  const [rulingParty, setRulingParty] = useState(Object.keys(state.rules.rulingParties)[0] ?? "Authoritarian");
  const [gold, setGold] = useState(0);
  const [stability, setStability] = useState(state.rules.stabilityRules.base_stability);
  const [manpower, setManpower] = useState(0);
  const [manpowerCap, setManpowerCap] = useState(state.rules.settings.base_manpower_cap);
  const [manualCap, setManualCap] = useState(false);
  const [townLines, setTownLines] = useState("");
  const [townTier, setTownTier] = useState<SettlementTier>("village");
  const [townBiome, setTownBiome] = useState("plains");
  const [useProductionOverride, setUseProductionOverride] = useState(false);
  const [productionResource, setProductionResource] = useState<ResourceType>("food");
  const [productionAmount, setProductionAmount] = useState(1);
  const [firstTownCapital, setFirstTownCapital] = useState(true);
  const [policies, setPolicies] = useState<Record<string, string>>(
    Object.fromEntries(state.rules.policyCategories.map((category) => [category.category, category.base_option]))
  );

  const towns = useMemo(
    () =>
      townLines
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [townLines]
  );

  const create = () => {
    const id = createId("country");
    const selectedPolicies = state.rules.policyCategories.map((category) => ({
      country_id: id,
      policy_category: category.category,
      selected_option: policies[category.category] ?? category.base_option,
      last_changed_turn: -1
    }));
    const manual_resource_override = useProductionOverride ? { [productionResource]: productionAmount } : null;
    const settlements = towns.map((townName, index) =>
      withCreatedTurn(
        {
          id: createId("town"),
          country_id: id,
          name: townName,
          tier: townTier,
          is_capital: firstTownCapital && index === 0,
          biome_or_resource_type: townBiome,
          manual_resource_override,
          upkeep_option: "A" as const,
          occupied_by_country_id: null,
          damaged: false,
          bombed: false,
          connected_for_upkeep: true,
          notes: ""
        },
        state.turnNumber
      )
    );

    onCreate(
      {
        ...state,
        countries: [
          ...state.countries,
          {
            id,
            name,
            short_name: shortName.trim() || undefined,
            color,
            is_player_country: false,
            ruling_party: rulingParty,
            gold,
            stability,
            manpower,
            manpower_cap: manpowerCap,
            manual_manpower_cap_override: manualCap ? manpowerCap : null,
            reserve: 0,
            equipment: 0,
            high_quality_equipment: 0,
            tanks: 0,
            supply: 0,
            current_turn_created: state.turnNumber,
            at_war: false,
            peace_turns_count: 0,
            notes: ""
          }
        ],
        settlements: [...state.settlements, ...settlements],
        policies: [...state.policies, ...selectedPolicies],
        stockpiles: [
          ...state.stockpiles,
          ...RESOURCE_TYPES.map((resource_type) => ({ country_id: id, resource_type, amount: 0 }))
        ],
        graphPositions: {
          ...state.graphPositions,
          [id]: { x: 180 + state.countries.length * 90, y: 360 }
        }
      },
      id
    );
  };

  return (
    <Modal
      title="Create Country"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={create}>
            Create Country
          </button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label="Name" value={name} onChange={setName} />
        <TextField label="Short sidebar name" value={shortName} onChange={setShortName} />
        <label>
          <span>Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <SelectField
          label="Ruling party"
          value={rulingParty}
          options={Object.keys(state.rules.rulingParties)}
          onChange={setRulingParty}
        />
        <NumberField label="Gold" value={gold} onChange={setGold} />
        <NumberField label="Stability" value={stability} onChange={setStability} />
        <NumberField label="Manpower" value={manpower} onChange={setManpower} />
        <NumberField label="Manpower cap" value={manpowerCap} onChange={setManpowerCap} />
        <CheckboxField label="Manual cap override" checked={manualCap} onChange={setManualCap} />
      </div>

      <div className="modal-subsection">
        <h3>Starting Settlements</h3>
        <textarea
          value={townLines}
          onChange={(event) => setTownLines(event.target.value)}
          placeholder="One settlement name per line"
        />
        <div className="form-grid">
          <SelectField label="Tier" value={townTier} options={["village", "city", "large_city", "metropole"]} optionLabel={labelFromKey} onChange={(value) => setTownTier(value as SettlementTier)} />
          <SelectField label="Biome/resource" value={townBiome} options={settlementTypeOptions(Object.keys(state.rules.resourceProduction))} optionLabel={biomeLabel} onChange={setTownBiome} />
          <CheckboxField label="First settlement is capital" checked={firstTownCapital} onChange={setFirstTownCapital} />
          <CheckboxField label="Override production" checked={useProductionOverride} onChange={setUseProductionOverride} />
          {useProductionOverride && (
            <>
              <SelectField label="Produces" value={productionResource} options={[...RESOURCE_TYPES]} optionLabel={resourceLabel} onChange={(value) => setProductionResource(value as ResourceType)} />
              <label>
                <span>Override units produced each turn</span>
                <input value={productionAmount} type="number" onChange={(event) => setProductionAmount(asNumber(event.target.value))} />
              </label>
            </>
          )}
        </div>
        <p className="quiet">{towns.length} starting settlements queued</p>
      </div>

      <div className="modal-subsection">
        <h3>Starting Policies</h3>
        <div className="policy-onboard-grid">
          {state.rules.policyCategories.map((category) => (
            <SelectField
              key={category.category}
              label={category.category}
              value={policies[category.category] ?? category.base_option}
              options={category.options.map((option) => option.name)}
              onChange={(value) => setPolicies((current) => ({ ...current, [category.category]: value }))}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
