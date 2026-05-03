import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { GameState } from "../types";

type RuleValue = string | number | boolean | null | RuleValue[] | { [key: string]: RuleValue };

const sections = [
  ["Settings", "settings"],
  ["Settlement rules", "settlementTiers"],
  ["Resource production", "resourceProduction"],
  ["Factory rules", "factoryRules"],
  ["Policy rules", "policyCategories"],
  ["Ruling parties", "rulingParties"],
  ["Stability rules", "stabilityRules"],
  ["Diplomacy rules", "diplomacyRelationTypes"],
  ["Puppet rules", "puppetTypes"],
  ["Dice modifiers", "dice"]
] as const;

type RuleSection = (typeof sections)[number][1];

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
    return (
      <div className="rule-group">
        <h3>{label}</h3>
        {value.map((item, index) => (
          <div className="rule-array-row" key={index}>
            <RuleValueEditor
              label={`${label} ${index + 1}`}
              value={item}
              onChange={(next) => onChange(value.map((entry, itemIndex) => (itemIndex === index ? next : entry)))}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rule-group">
      <h3>{label}</h3>
      <div className="rule-grid">
        {Object.entries(value).map(([key, entry]) => (
          <RuleValueEditor
            key={key}
            label={humanizeKey(key)}
            value={entry}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
      </div>
    </div>
  );
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (match: string) => match.toUpperCase());
}
