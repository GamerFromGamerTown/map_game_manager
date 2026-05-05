import { useState } from "react";
import { Country, GameState, OverrideLog, TurnPreview } from "../../types";
import { createId } from "../../engine/calculations";
import { CheckboxField, formatSigned, Metric, NumberField, SelectField, TextField } from "../../ui/fields";

export function OverviewTab({
  state,
  country,
  preview,
  patchState,
  updateCountry
}: {
  state: GameState;
  country: Country;
  preview?: TurnPreview["countries"][number];
  patchState: (updater: (current: GameState) => GameState) => void;
  updateCountry: (id: string, patch: Partial<Country>) => void;
}) {
  const [overrideField, setOverrideField] = useState("gold");
  const [overrideValue, setOverrideValue] = useState(0);
  const [overrideMode, setOverrideMode] = useState<"set" | "delta">("delta");
  const [overrideReason, setOverrideReason] = useState("Manual GM override");
  const numericFields = [
    "gold",
    "stability",
    "manpower",
    "manpower_cap",
    "reserve",
    "equipment",
    "high_quality_equipment",
    "tanks",
    "supply"
  ];

  const applyOverride = () => {
    const currentValue = Number(country[overrideField as keyof Country] ?? 0);
    const nextValue = overrideMode === "delta" ? currentValue + overrideValue : overrideValue;
    const entry: OverrideLog = {
      id: createId("override"),
      turn_number: state.turnNumber,
      entity_type: "Country",
      entity_id: country.id,
      field_name: overrideField,
      old_value: String(currentValue),
      new_value: String(nextValue),
      reason: overrideReason,
      timestamp: new Date().toISOString()
    };

    patchState((current) => ({
      ...current,
      countries: current.countries.map((item) =>
        item.id === country.id ? { ...item, [overrideField]: nextValue } : item
      ),
      overrides: [entry, ...current.overrides]
    }));
  };

  return (
    <div className="section-stack">
      <div className="stat-grid">
        <Metric label="Projected Gold" value={`${Math.round(preview?.goldAfter ?? country.gold)} (${formatSigned(preview?.goldDelta ?? 0)})`} />
        <Metric label="Projected Stability" value={`${Math.round(preview?.stabilityAfter ?? country.stability)} (${formatSigned(preview?.stabilityDelta ?? 0)})`} />
        <Metric label="Projected Manpower" value={`${Math.round(preview?.manpowerAfter ?? country.manpower)} (${formatSigned(preview?.manpowerGain ?? 0)})`} />
        <Metric label="Necessities" value={`${preview?.necessitiesProduced ?? 0} / ${preview?.necessitiesRequired ?? 0}`} />
      </div>

      <div className="country-overview-grid">
        <section className="form-section identity-section">
          <div className="section-heading">
            <h2>Country Identity</h2>
            <span>Name, color, and political status</span>
          </div>
          <div className="identity-color-row">
            <label className="country-color-field">
              <span>Country color</span>
              <input type="color" value={country.color} onChange={(event) => updateCountry(country.id, { color: event.target.value })} />
            </label>
            <TextField
              id={`country-${country.id}-name`}
              label="Country name"
              value={country.name}
              onChange={(name) => updateCountry(country.id, { name })}
            />
          </div>
          <TextField label="Short sidebar name" value={country.short_name ?? ""} onChange={(short_name) => updateCountry(country.id, { short_name })} />
          <div className="form-row two-wide">
            <SelectField
              label="Ruling party"
              value={country.ruling_party}
              options={Object.keys(state.rules.rulingParties)}
              onChange={(ruling_party) => updateCountry(country.id, { ruling_party })}
            />
            <NumberField
              label="Peace turns"
              value={country.peace_turns_count}
              onChange={(peace_turns_count) => updateCountry(country.id, { peace_turns_count })}
            />
          </div>
          <div className="toolbar-line">
            <CheckboxField label="Player country" checked={country.is_player_country} onChange={(is_player_country) => updateCountry(country.id, { is_player_country })} />
            <CheckboxField label="At war" checked={country.at_war} onChange={(at_war) => updateCountry(country.id, { at_war })} />
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <h2>Core Numbers</h2>
            <span>Values the turn processor will use</span>
          </div>
          <div className="core-number-grid">
            <NumberField
              id={`country-${country.id}-gold`}
              label="Gold"
              value={country.gold}
              onChange={(gold) => updateCountry(country.id, { gold })}
            />
            <NumberField
              id={`country-${country.id}-stability`}
              label="Stability"
              value={country.stability}
              onChange={(stability) => updateCountry(country.id, { stability })}
            />
            <NumberField label="Manpower" value={country.manpower} onChange={(manpower) => updateCountry(country.id, { manpower })} />
            <NumberField label="Manpower cap" value={country.manpower_cap} onChange={(manpower_cap) => updateCountry(country.id, { manpower_cap, manual_manpower_cap_override: manpower_cap })} />
            <NumberField label="Reserve" value={country.reserve} onChange={(reserve) => updateCountry(country.id, { reserve })} />
            <NumberField label="Supply" value={country.supply} onChange={(supply) => updateCountry(country.id, { supply })} />
          </div>
        </section>

        <section className="form-section country-equipment-section">
          <div className="section-heading">
            <h2>Military Stock</h2>
            <span>Equipment stockpiles stored on the country sheet</span>
          </div>
          <div className="form-row three-wide compact-row">
            <NumberField label="Equipment" value={country.equipment} onChange={(equipment) => updateCountry(country.id, { equipment })} />
            <NumberField label="High quality equipment" value={country.high_quality_equipment} onChange={(high_quality_equipment) => updateCountry(country.id, { high_quality_equipment })} />
            <NumberField label="Tanks" value={country.tanks} onChange={(tanks) => updateCountry(country.id, { tanks })} />
          </div>
        </section>
      </div>

      <div className="override-bar">
        <SelectField label="Field" value={overrideField} options={numericFields} onChange={setOverrideField} />
        <SelectField label="Mode" value={overrideMode} options={["delta", "set"]} onChange={(value) => setOverrideMode(value as "set" | "delta")} />
        <NumberField label="Value" value={overrideValue} onChange={setOverrideValue} />
        <TextField label="Reason" value={overrideReason} onChange={setOverrideReason} />
        <button className="primary" onClick={applyOverride}>Apply Override</button>
      </div>
    </div>
  );
}
