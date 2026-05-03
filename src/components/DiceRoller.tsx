import { useMemo, useState } from "react";
import { Dice5, Swords } from "lucide-react";
import { DiceRollLog, GameState } from "../types";
import { createId, diceResultCategory } from "../engine/calculations";
import { CheckboxField, NumberField, SelectField, TextField } from "../ui/fields";
import { countryName } from "../utils/names";

export function DiceRoller({
  state,
  patchState
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
}) {
  const [countryId, setCountryId] = useState(state.countries[0]?.id ?? "");
  const [operationId, setOperationId] = useState("");
  const [mode, setMode] = useState("attack");
  const [troopType, setTroopType] = useState("normal");
  const [terrain, setTerrain] = useState("plain");
  const [raw, setRaw] = useState(10);
  const [manualRaw, setManualRaw] = useState(false);
  const [supplyRequired, setSupplyRequired] = useState(0);
  const [supplyAllocated, setSupplyAllocated] = useState(0);
  const [encirclement, setEncirclement] = useState("none");
  const [fortification, setFortification] = useState("none");
  const [custom, setCustom] = useState(0);
  const [defenderRaw, setDefenderRaw] = useState(10);
  const [defenderCustom, setDefenderCustom] = useState(0);
  const [notes, setNotes] = useState("");
  const [last, setLast] = useState<DiceRollLog | null>(null);

  const terrainOptions = Array.from(
    new Set([
      ...Object.keys(state.rules.dice.attackTerrainNormal),
      ...Object.keys(state.rules.dice.attackTerrainTank),
      ...Object.keys(state.rules.dice.expansionTerrain)
    ])
  );

  const calculate = (roll: number) => {
    const supplyMissing = Math.max(0, supplyRequired - supplyAllocated);
    const supplyModifier = supplyMissing * state.rules.military.supply_missing_dice_modifier;
    const encirclementModifier = state.rules.dice.encirclement[encirclement] ?? 0;
    const fortificationModifier = state.rules.dice.fortifications[fortification] ?? 0;
    const troopModifier = troopType === "high_quality" ? 3 : troopType === "tank" && mode !== "defense" ? 5 : 0;
    const terrainRule =
      mode === "expansion"
        ? state.rules.dice.expansionTerrain[terrain]
        : troopType === "tank" && state.rules.dice.attackTerrainTank[terrain] !== undefined
          ? state.rules.dice.attackTerrainTank[terrain]
          : state.rules.dice.attackTerrainNormal[terrain];
    const terrainModifier = terrainRule === "impassable" ? 0 : Number(terrainRule ?? 0);
    const final = roll + terrainModifier + troopModifier + supplyModifier + encirclementModifier + fortificationModifier + custom;

    return {
      final,
      impassable: terrainRule === "impassable",
      modifiers: {
        terrain,
        terrainModifier,
        troopType,
        troopModifier,
        supplyMissing,
        supplyModifier,
        encirclement,
        encirclementModifier,
        fortification,
        fortificationModifier,
        custom
      }
    };
  };

  const previewRoll = useMemo(() => calculate(raw), [
    raw,
    supplyRequired,
    supplyAllocated,
    encirclement,
    fortification,
    troopType,
    mode,
    terrain,
    custom
  ]);

  const doRoll = () => {
    const attackerRoll = manualRaw ? raw : Math.floor(Math.random() * 20) + 1;
    const attacker = calculate(attackerRoll);
    let finalScore = attacker.final;
    let result = attacker.impassable ? "impassable" : diceResultCategory(state.rules, finalScore);
    const modifiers: Record<string, unknown> = { attacker: attacker.modifiers };

    if (mode === "contested attack vs defense") {
      const defenderFinal = defenderRaw + defenderCustom;
      modifiers.defender = { raw_d20: defenderRaw, custom: defenderCustom, final: defenderFinal };
      if (attacker.final === defenderFinal) result = "reroll required";
      else if (attacker.final < defenderFinal) result = "attacker fails";
      else {
        finalScore = attacker.final - Math.floor(defenderFinal / 2);
        result = diceResultCategory(state.rules, finalScore);
      }
    }

    const log: DiceRollLog = {
      id: createId("dice"),
      turn_number: state.turnNumber,
      country_id: countryId,
      operation_id: operationId || null,
      roll_type: mode,
      raw_d20: attackerRoll,
      modifiers_json: JSON.stringify(modifiers),
      final_score: finalScore,
      result_category: result,
      notes
    };
    setLast(log);
    setRaw(attackerRoll);
    patchState((current) => ({ ...current, diceRolls: [log, ...current.diceRolls] }));
  };

  return (
    <section className="panel full dice-panel">
      <div className="dice-layout">
        <div className="dice-main">
          <div className="form-section">
            <div className="section-heading">
              <h2>Roll Context</h2>
              <span>Who this roll belongs to</span>
            </div>
            <div className="form-row two-wide">
              <SelectField label="Country" value={countryId} options={state.countries.map((country) => country.id)} optionLabel={(id) => countryName(state, id)} onChange={setCountryId} />
              <SelectField label="Operation" value={operationId} options={["", ...state.operations.map((operation) => operation.id)]} optionLabel={(id) => id ? state.operations.find((operation) => operation.id)?.name ?? id : "None"} onChange={setOperationId} />
            </div>
          </div>

          <div className="form-section">
            <div className="section-heading">
              <h2>Roll Setup</h2>
              <span>Core mode and troop assumptions</span>
            </div>
            <div className="form-row three-wide">
              <SelectField label="Mode" value={mode} options={["attack", "defense", "expansion", "contested attack vs defense"]} onChange={setMode} />
              <SelectField label="Troop type" value={troopType} options={["normal", "high_quality", "tank"]} onChange={setTroopType} />
              <SelectField label="Terrain" value={terrain} options={terrainOptions} onChange={setTerrain} />
            </div>
            <div className="manual-roll-row">
              <NumberField label="D20 value" value={raw} onChange={setRaw} />
              <CheckboxField label="Use manual D20" checked={manualRaw} onChange={setManualRaw} />
            </div>
          </div>

          <div className="form-section">
            <div className="section-heading">
              <h2>Modifiers</h2>
              <span>Supply and situational adjustments</span>
            </div>
            <div className="form-row three-wide">
              <NumberField label="Supply required" value={supplyRequired} onChange={setSupplyRequired} />
              <NumberField label="Supply allocated" value={supplyAllocated} onChange={setSupplyAllocated} />
              <NumberField label="GM custom modifier" value={custom} onChange={setCustom} />
            </div>
            <div className="form-row two-wide">
              <SelectField label="Encirclement" value={encirclement} options={Object.keys(state.rules.dice.encirclement)} onChange={setEncirclement} />
              <SelectField label="Fortification" value={fortification} options={Object.keys(state.rules.dice.fortifications)} onChange={setFortification} />
            </div>
          </div>

          {mode === "contested attack vs defense" && (
            <div className="form-section">
              <div className="section-heading">
                <h2>Defender Roll</h2>
                <span>Only used for contested rolls</span>
              </div>
              <div className="form-row two-wide compact-row">
                <NumberField label="Defender D20" value={defenderRaw} onChange={setDefenderRaw} />
                <NumberField label="Defender custom modifier" value={defenderCustom} onChange={setDefenderCustom} />
              </div>
            </div>
          )}

          <div className="form-section">
            <TextField label="Notes" value={notes} onChange={setNotes} />
          </div>
        </div>

        <aside className="dice-summary">
          <Dice5 size={26} />
          <span>Current Preview</span>
          <strong>{previewRoll.impassable ? "Impassable" : previewRoll.final}</strong>
          <p>
            {previewRoll.impassable
              ? "Terrain blocks this troop type."
              : diceResultCategory(state.rules, previewRoll.final)}
          </p>
          <button className="primary roll-button" onClick={doRoll}>
            <Swords size={16} /> Roll D20
          </button>
        </aside>
      </div>
      {last && (
        <div className="roll-result">
          <strong>{last.result_category}</strong>
          <span>raw {last.raw_d20}, final {last.final_score}</span>
          <ModifierSummary modifiersJson={last.modifiers_json} />
        </div>
      )}
    </section>
  );
}

function ModifierSummary({ modifiersJson }: { modifiersJson: string }) {
  let modifiers: Record<string, unknown> = {};
  try {
    modifiers = JSON.parse(modifiersJson) as Record<string, unknown>;
  } catch {
    return <span className="quiet">Modifier details unavailable.</span>;
  }

  return (
    <div className="modifier-summary">
      {Object.entries(modifiers).map(([group, value]) => (
        <div key={group}>
          <strong>{group}</strong>
          {value && typeof value === "object" ? (
            Object.entries(value as Record<string, unknown>).map(([key, item]) => (
              <span key={key}>{key}: {String(item)}</span>
            ))
          ) : (
            <span>{String(value ?? "")}</span>
          )}
        </div>
      ))}
    </div>
  );
}
