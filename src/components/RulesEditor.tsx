import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { GameState } from "../types";
import { isLegacySettlementType, labelFromKey } from "../utils/labels";

type RuleValue = string | number | boolean | null | RuleValue[] | { [key: string]: RuleValue };
type RuleObject = { [key: string]: RuleValue };

const sections = [
  ["Settings", "settings"],
  ["Settlement rules", "settlementTiers"],
  ["Resource production", "resourceProduction"],
  ["Factory rules", "factoryRules"],
  ["Policy rules", "policyCategories"],
  ["Ruling parties", "rulingParties"],
  ["Stability rules", "stabilityRules"],
  ["Puppet rules", "puppetTypes"],
  ["Dice modifiers", "dice"]
] as const;

type RuleSection = (typeof sections)[number][1];

const permissionPresets = [
  {
    label: "Full control",
    value: ["any buildings", "country name", "settlement names", "trades", "creating settlements", "upgrading settlements", "ideological policies", "ruling party"]
  },
  {
    label: "Administrative control",
    value: ["any buildings", "settlement names", "country name", "trades", "creating settlements", "upgrading settlements", "ideological policies"]
  },
  {
    label: "Occupation control",
    value: ["militaristic buildings", "country name", "settlement names"]
  },
  {
    label: "Military only",
    value: ["militaristic buildings"]
  },
  {
    label: "Custom",
    value: null
  }
] as const;

export function RulesEditor({
  state,
  patchState
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
}) {
  const [active, setActive] = useState<RuleSection>("settings");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setText(JSON.stringify(state.rules[active], null, 2));
    setError("");
  }, [active, state.rules]);

  const updateActive = (value: RuleValue) => {
    patchState((current) => ({ ...current, rules: { ...current.rules, [active]: value } }));
  };

  const saveJson = () => {
    try {
      updateActive(JSON.parse(text) as RuleValue);
      setError("");
    } catch {
      setError("Invalid JSON");
    }
  };

  return (
    <section className="panel full rules-editor">
      <div className="tabs">
        {sections.map(([label, key]) => (
          <button key={key} className={active === key ? "active" : ""} onClick={() => setActive(key)}>
            {label}
          </button>
        ))}
      </div>

      <RuleValueEditor label={sections.find(([, key]) => key === active)?.[0] ?? active} value={state.rules[active] as RuleValue} onChange={updateActive} />

      <details className="advanced-json">
        <summary>Advanced JSON editor</summary>
        <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        <div className="actions left">
          <button className="primary" onClick={saveJson}>
            <Save size={16} /> Save JSON Section
          </button>
          {error && <span className="bad">{error}</span>}
        </div>
      </details>
    </section>
  );
}

function RuleValueEditor({
  label,
  value,
  onChange
}: {
  label: string;
  value: RuleValue;
  onChange: (value: RuleValue) => void;
}) {
  if (typeof value === "number") {
    return (
      <label className="rule-field">
        <span>{label}</span>
        <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value || 0))} />
      </label>
    );
  }

  if (typeof value === "boolean") {
    return (
      <label className="check-field rule-field">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }

  if (typeof value === "string" || value === null) {
    return (
      <label className="rule-field">
        <span>{label}</span>
        <input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }

  if (Array.isArray(value)) {
    if (label === "Master permissions") {
      const selected = permissionPresetFor(value);
      return (
        <label className="rule-field">
          <span>{label}</span>
          <select
            value={selected}
            onChange={(event) => {
              const preset = permissionPresets.find((item) => item.label === event.target.value);
              if (preset?.value) onChange([...preset.value]);
            }}
          >
            {permissionPresets.map((preset) => (
              <option key={preset.label}>{preset.label}</option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <div className={label === "Stability bands" ? "rule-group stability-bands-rule" : "rule-group"}>
        <h3>{label}</h3>
        {value.map((item, index) => (
          <div className={label === "Stability bands" ? "rule-array-row stability-band-card" : "rule-array-row"} key={index}>
            <RuleValueEditor
              label={arrayItemLabel(label, item, index)}
              value={item}
              onChange={(next) => onChange(value.map((entry, itemIndex) => (itemIndex === index ? next : entry)))}
            />
          </div>
        ))}
      </div>
    );
  }

  const entries = visibleObjectEntries(label, value);

  return (
    <div className="rule-group">
      <h3>{label}</h3>
      <div className="rule-grid">
        {entries.map(([key, entry]) => (
          <RuleValueEditor
            key={key}
            label={fieldLabel(label, key)}
            value={entry}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
      </div>
    </div>
  );
}

function arrayItemLabel(label: string, item: RuleValue, index: number): string {
  if (label === "Factory rules" && isRuleObject(item) && typeof item.type === "string") {
    return item.type;
  }

  if (label === "Stability bands" && isRuleObject(item) && typeof item.min === "number" && typeof item.max === "number") {
    return `Stability ${item.min}-${item.max}`;
  }

  return `${label} ${index + 1}`;
}

function fieldLabel(parentLabel: string, key: string): string {
  const factoryLabels: Record<string, string> = {
    type: "Factory name",
    build_gold_cost: "Build cost (gold)",
    inputs_per_turn: "Consumes each turn",
    outputs_per_turn: "Produces each turn"
  };
  if (parentLabel === "Factory rules" || key in factoryLabels) return factoryLabels[key] ?? labelFromKey(key);
  if (key === "stabilityBands") return "Stability bands";
  if (key === "master_permissions") return "Master permissions";

  return labelFromKey(key);
}

function visibleObjectEntries(label: string, value: RuleObject): [string, RuleValue][] {
  const entries = Object.entries(value);
  if (isPuppetRule(value)) return entries.filter(([key]) => key !== "color_changes");
  if (label !== "Resource production") return entries;

  return entries.filter(([key, entry]) => !isLegacySettlementType(key) && !isEmptyRuleObject(entry));
}

function permissionPresetFor(value: RuleValue[]): string {
  const normalized = JSON.stringify([...value].sort());
  return permissionPresets.find((preset) => preset.value && JSON.stringify([...preset.value].sort()) === normalized)?.label ?? "Custom";
}

function isEmptyRuleObject(value: RuleValue): boolean {
  return isRuleObject(value) && Object.keys(value).length === 0;
}

function isRuleObject(value: RuleValue): value is RuleObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPuppetRule(value: RuleObject): boolean {
  return "tribute_percent" in value && "master_permissions" in value && "diplomacy_inherited_from_master" in value;
}
