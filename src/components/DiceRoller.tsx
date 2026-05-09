import { useEffect, useState } from "react";
import { Dice5, Info, Swords, Trash2 } from "lucide-react";
import { DiceRollLog, GameState } from "../types";
import { createId, diceResultCategory } from "../engine/calculations";
import { NumberField, SelectField } from "../ui/fields";
import { countryShortName } from "../utils/names";
import { labelFromKey } from "../utils/labels";

const clampDiceCount = (value: number) => Math.min(100, Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)));
const detailKeysToHide = new Set(["terrain", "raw_d20"]);

const terrainForRoll = (roll: DiceRollLog): string => {
  try {
    const modifiers = JSON.parse(roll.modifiers_json) as { attacker?: { terrain?: unknown } };
    return typeof modifiers.attacker?.terrain === "string" ? modifiers.attacker.terrain : "unknown";
  } catch {
    return "unknown";
  }
};

export function DiceRoller({
  state,
  patchState,
  visibleRollIds,
  setVisibleRollIds
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  visibleRollIds: string[];
  setVisibleRollIds: (ids: string[]) => void;
}) {
  const [countryId, setCountryId] = useState(state.countries[0]?.id ?? "");
  const [operationId, setOperationId] = useState("");
  const [mode, setMode] = useState("attack");
  const [missionType, setMissionType] = useState(Object.keys(state.rules.military.operations)[0] ?? "");
  const [troopType, setTroopType] = useState("normal");
  const [terrain, setTerrain] = useState("plain");
  const [supplyAllocated, setSupplyAllocated] = useState(0);
  const [encirclement, setEncirclement] = useState("none");
  const [fortification, setFortification] = useState("none");
  const [custom, setCustom] = useState(0);
  const [diceCount, setDiceCount] = useState(1);
  const [defenderRaw, setDefenderRaw] = useState(10);
  const [defenderCustom, setDefenderCustom] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const selectedOperation = state.operations.find((operation) => operation.id === operationId);
  const effectiveMissionType = selectedOperation?.operation_type ?? missionType;
  const supplyRequired =
    mode === "expansion"
      ? 0
      : selectedOperation?.supply_required ?? state.rules.military.operations[effectiveMissionType]?.supply_required ?? 0;
  const effectiveSupplyAllocated = mode === "expansion" ? 0 : selectedOperation?.supply_allocated ?? supplyAllocated;
  const usesCombatModifiers = mode !== "expansion";
  const hasOperations = state.operations.length > 0;
  const rollCount = clampDiceCount(diceCount);
  const expansionGoldCost = mode === "expansion" ? rollCount * state.rules.dice.expansion_roll_gold_cost : 0;
  const visibleRolls = visibleRollIds
    .map((id) => state.diceRolls.find((roll) => roll.id === id))
    .filter((roll): roll is DiceRollLog => Boolean(roll));

  useEffect(() => {
    if (countryId && state.countries.some((country) => country.id === countryId)) return;
    setCountryId(state.countries[0]?.id ?? "");
  }, [countryId, state.countries]);

  const terrainOptions = Array.from(
    new Set([
      ...Object.keys(state.rules.dice.attackTerrainNormal),
      ...Object.keys(state.rules.dice.attackTerrainTank),
      ...Object.keys(state.rules.dice.expansionTerrain)
    ])
  );

  const calculate = (roll: number) => {
    const supplyMissing = Math.max(0, supplyRequired - effectiveSupplyAllocated);
    const supplyModifier = supplyMissing * state.rules.military.supply_missing_dice_modifier;
    const encirclementModifier = usesCombatModifiers ? state.rules.dice.encirclement[encirclement] ?? 0 : 0;
    const fortificationModifier = usesCombatModifiers ? state.rules.dice.fortifications[fortification] ?? 0 : 0;
    const troopModifier = troopType === "high_quality" ? 3 : troopType === "tank" && mode !== "defense" ? 5 : 0;
    const terrainRule =
      mode === "expansion"
        ? state.rules.dice.expansionTerrain[terrain]
        : troopType === "tank" && state.rules.dice.attackTerrainTank[terrain] !== undefined
          ? state.rules.dice.attackTerrainTank[terrain]
          : state.rules.dice.attackTerrainNormal[terrain];
    const terrainModifier = terrainRule === "impassable" ? 0 : Number(terrainRule ?? 0);
    const final = roll + terrainModifier + troopModifier + supplyModifier + encirclementModifier + fortificationModifier + custom;
    const modifiers: Record<string, unknown> = {
      terrain,
      terrainModifier,
      troopType,
      troopModifier,
      custom
    };

    if (mode !== "expansion") {
      modifiers.supplyMissing = supplyMissing;
      modifiers.supplyModifier = supplyModifier;
      modifiers.supplyRequired = supplyRequired;
      modifiers.supplyAllocated = effectiveSupplyAllocated;
      modifiers.encirclement = encirclement;
      modifiers.encirclementModifier = encirclementModifier;
      modifiers.fortification = fortification;
      modifiers.fortificationModifier = fortificationModifier;
    } else {
      modifiers.expansionGoldCost = state.rules.dice.expansion_roll_gold_cost;
    }

    return {
      final,
      impassable: terrainRule === "impassable",
      modifiers
    };
  };

  const doRoll = () => {
    const rolls = Array.from({ length: rollCount }, () => {
      const attackerRoll = Math.floor(Math.random() * 20) + 1;
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

      return {
        id: createId("dice"),
        turn_number: state.turnNumber,
        country_id: countryId,
        operation_id: operationId || null,
        roll_type: mode,
        raw_d20: attackerRoll,
        modifiers_json: JSON.stringify(modifiers),
        final_score: finalScore,
        result_category: result,
        notes: ""
      };
    });

    setVisibleRollIds(rolls.map((roll) => roll.id));
    setShowDetails(false);
    patchState((current) => ({
      ...current,
      countries: mode === "expansion"
        ? current.countries.map((country) =>
            country.id === countryId ? { ...country, gold: country.gold - expansionGoldCost } : country
          )
        : current.countries,
      diceRolls: [...rolls, ...current.diceRolls]
    }));
  };

  return (
    <section className="panel full dice-panel">
      <div className="dice-layout">
        <div className="dice-main">
          <div className="form-section dice-form-section">
            <div className="section-heading dice-section-heading">
              <h2>Scenario</h2>
              <span>Who is rolling, what kind of mission it is, and where it happens.</span>
            </div>
            <div className="form-row dice-primary-grid">
              <SelectField label="Country" value={countryId} options={state.countries.map((country) => country.id)} optionLabel={(id) => countryShortName(state, id)} onChange={setCountryId} />
              <SelectField label="Mode" value={mode} options={["attack", "defense", "expansion", "contested attack vs defense"]} optionLabel={labelFromKey} onChange={setMode} />
              {mode !== "expansion" && (
                <SelectField label="Mission type" value={effectiveMissionType} options={Object.keys(state.rules.military.operations)} optionLabel={labelFromKey} onChange={setMissionType} />
              )}
              <SelectField label="Troop type" value={troopType} options={["normal", "high_quality", "tank"]} optionLabel={labelFromKey} onChange={setTroopType} />
              <SelectField label="Terrain" value={terrain} options={terrainOptions} optionLabel={labelFromKey} onChange={setTerrain} />
              {hasOperations && (
                <SelectField
                  label="Use military operation"
                  value={operationId}
                  options={["", ...state.operations.map((operation) => operation.id)]}
                  optionLabel={(id) => id ? state.operations.find((operation) => operation.id)?.name ?? id : "No operation"}
                  onChange={(id) => {
                    setOperationId(id);
                    const operation = state.operations.find((item) => item.id === id);
                    if (operation) setMissionType(operation.operation_type);
                  }}
                />
              )}
            </div>
          </div>

          <div className="form-section dice-form-section">
            <div className="section-heading dice-section-heading">
              <h2>Situational modifiers</h2>
              {mode !== "expansion" && <span>Supply required: {supplyRequired}</span>}
            </div>
            <div className="form-row dice-adjustment-grid">
              {mode !== "expansion" && (
                selectedOperation ? (
                  <div className="dice-readout">
                    <span>Supply allocated by operation</span>
                    <strong>{effectiveSupplyAllocated}</strong>
                  </div>
                ) : (
                  <NumberField label="Supply allocated" value={supplyAllocated} onChange={setSupplyAllocated} />
                )
              )}
              <NumberField label="GM +/- modifier" value={custom} onChange={setCustom} />
              {usesCombatModifiers && (
                <>
                <SelectField label="Encirclement" value={encirclement} options={Object.keys(state.rules.dice.encirclement)} optionLabel={labelFromKey} onChange={setEncirclement} />
                <SelectField label="Fortification" value={fortification} options={Object.keys(state.rules.dice.fortifications)} optionLabel={labelFromKey} onChange={setFortification} />
                </>
              )}
            </div>
            <p className="dice-field-help">
              GM +/- modifier is for one-off adjustments not already covered by supply, troop type, terrain, encirclement, or fortifications.
            </p>
          </div>

          {mode === "contested attack vs defense" && (
            <div className="form-section dice-form-section">
              <div className="section-heading">
                <h2>Defender Roll</h2>
              </div>
              <div className="form-row dice-adjustment-grid">
                <NumberField label="Defender D20" value={defenderRaw} onChange={setDefenderRaw} />
                <NumberField label="Manual defender +/- modifier" value={defenderCustom} onChange={setDefenderCustom} />
              </div>
            </div>
          )}
        </div>

        <aside className="dice-summary">
          <Dice5 size={26} />
          <strong>Roll D20</strong>
          <p>Resolve {rollCount} configured {rollCount === 1 ? "roll" : "rolls"} and add them to the audit log.</p>
          {mode === "expansion" && (
            <p className="dice-cost-line">
              Expansion cost: {expansionGoldCost.toLocaleString()} Gold
            </p>
          )}
          <NumberField label="Number of dice to roll" value={diceCount} min={1} max={100} onChange={(value) => setDiceCount(clampDiceCount(value))} />
          <button className="primary roll-button" onClick={doRoll}>
            <Swords size={16} /> Roll {rollCount} D20
          </button>
        </aside>
      </div>
      {visibleRolls.length > 0 && (
        <div className="roll-result">
          <div className="roll-result-header">
            <strong>Latest {visibleRolls.length === 1 ? "roll" : `${visibleRolls.length} rolls`}</strong>
            <div className="roll-result-actions">
              <button className="ghost compact-button" onClick={() => setShowDetails((current) => !current)}>
                <Info size={14} /> {showDetails ? "Hide details" : "Details"}
              </button>
              <button className="ghost compact-button" onClick={() => setVisibleRollIds([])} title="Clear visible results">
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>
          <div className="roll-result-list">
            {visibleRolls.map((roll) => (
              <div className="roll-result-line" key={roll.id}>
                <strong>{roll.raw_d20}</strong>
                <span>{roll.result_category}</span>
                <span>Terrain: {labelFromKey(terrainForRoll(roll))}</span>
                <span>Final: {roll.final_score}</span>
              </div>
            ))}
          </div>
          {showDetails && (
            <div className="roll-detail-list">
              {visibleRolls.map((roll, index) => (
                <ModifierSummary key={roll.id} title={visibleRolls.length > 1 ? `Roll ${index + 1}` : "Modifier details"} modifiersJson={roll.modifiers_json} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ModifierSummary({ title, modifiersJson }: { title: string; modifiersJson: string }) {
  let modifiers: Record<string, unknown> = {};
  try {
    modifiers = JSON.parse(modifiersJson) as Record<string, unknown>;
  } catch {
    return <span className="quiet">Modifier details unavailable.</span>;
  }

  return (
    <div className="modifier-summary">
      <h3>{title}</h3>
      {Object.entries(modifiers).map(([group, value]) => (
        <div key={group}>
          <strong>{labelFromKey(group)}</strong>
          {value && typeof value === "object" ? (
            Object.entries(value as Record<string, unknown>).map(([key, item]) => (
              detailKeysToHide.has(key) ? null : <span key={key}>
                <span>{labelFromKey(key)}</span>
                <strong>{labelFromKey(String(item))}</strong>
              </span>
            ))
          ) : (
            <span>
              <span>Value</span>
              <strong>{labelFromKey(String(value ?? ""))}</strong>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
