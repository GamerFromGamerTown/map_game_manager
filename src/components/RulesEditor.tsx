import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { CustomRuleEffects, GameState, PolicyCategoryRule, PolicyOptionRule, RulesConfig } from "../types";
import { isLegacySettlementType, labelFromKey } from "../utils/labels";

type RuleValue = string | number | boolean | null | RuleValue[] | { [key: string]: RuleValue };
type RuleObject = { [key: string]: RuleValue };
type DiceRules = RulesConfig["dice"];
type DicePanel = "resultBands" | "attackTerrainNormal" | "attackTerrainTank" | "expansionTerrain" | "encirclement" | "fortifications" | "costs";
type PolicyRules = RulesConfig["policyCategories"];
type FactoryRuleItem = RulesConfig["factoryRules"][number];
type RulingPartyRules = RulesConfig["rulingParties"];
type RulingPartyRuleItem = RulingPartyRules[string];
type StabilityRules = RulesConfig["stabilityRules"];
type StabilityBandItem = StabilityRules["stabilityBands"][number];
type PuppetRules = RulesConfig["puppetTypes"];
type PuppetRuleItem = PuppetRules[string];
type StabilityPanel = "settings" | "bands";

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

const dicePanels: Array<{ key: DicePanel; label: string }> = [
  { key: "resultBands", label: "Result bands" },
  { key: "attackTerrainNormal", label: "Attack terrain" },
  { key: "attackTerrainTank", label: "Tank terrain" },
  { key: "expansionTerrain", label: "Expansion terrain" },
  { key: "encirclement", label: "Encirclement" },
  { key: "fortifications", label: "Fortifications" },
  { key: "costs", label: "General costs" }
];

const rulingPartyFieldKeys: Array<keyof RulingPartyRuleItem> = [
  "stability_per_turn",
  "stability_per_turn_at_peace",
  "stability_per_turn_at_war",
  "gold_per_turn",
  "stability_cap",
  "stability_cap_at_peace",
  "stability_cap_at_war",
  "stability_per_council_player",
  "minimum_players_required",
  "fallback_party_when_below_minimum",
  "fallback_stability_when_below_minimum",
  "notes"
];

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

      {active === "factoryRules" ? (
        <FactoryRulesEditor value={state.rules.factoryRules} onChange={(next) => updateActive(next as unknown as RuleValue)} />
      ) : active === "policyCategories" ? (
        <PolicyRulesEditor value={state.rules.policyCategories} onChange={(next) => updateActive(next as unknown as RuleValue)} />
      ) : active === "rulingParties" ? (
        <RulingPartyRulesEditor value={state.rules.rulingParties} onChange={(next) => updateActive(next as unknown as RuleValue)} />
      ) : active === "stabilityRules" ? (
        <StabilityRulesEditor value={state.rules.stabilityRules} onChange={(next) => updateActive(next as unknown as RuleValue)} />
      ) : active === "puppetTypes" ? (
        <PuppetRulesEditor value={state.rules.puppetTypes} onChange={(next) => updateActive(next as unknown as RuleValue)} />
      ) : active === "dice" ? (
        <DiceRulesEditor value={state.rules.dice} onChange={(next) => updateActive(next as RuleValue)} />
      ) : (
        <RuleValueEditor label={sections.find(([, key]) => key === active)?.[0] ?? active} value={state.rules[active] as RuleValue} onChange={updateActive} />
      )}

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

function PolicyRulesEditor({
  value,
  onChange
}: {
  value: PolicyRules;
  onChange: (value: PolicyRules) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeCategory = value[Math.min(activeIndex, Math.max(value.length - 1, 0))];

  const updateCategoryAt = (index: number, nextCategory: PolicyCategoryRule) => {
    onChange(value.map((category, itemIndex) => (itemIndex === index ? nextCategory : category)));
  };

  const updateActiveCategory = (patch: Partial<PolicyCategoryRule>) => {
    if (!activeCategory) return;
    updateCategoryAt(activeIndex, { ...activeCategory, ...patch });
  };

  const addPolicy = () => {
    const next = [...value, createNewPolicyCategory()];
    onChange(next);
    setActiveIndex(next.length - 1);
  };

  if (!activeCategory) {
    return (
      <div className="policy-rules-editor">
        <button type="button" aria-label="Add policy" onClick={addPolicy}>+ Policy</button>
      </div>
    );
  }

  return (
    <div className="policy-rules-editor">
      <div className="policy-rules-sidebar">
        <nav className="policy-rules-subnav" aria-label="Policy categories">
          {value.map((category, index) => (
            <button
              key={`${category.category}-${index}`}
              className={index === activeIndex ? "active" : ""}
              type="button"
              onClick={() => setActiveIndex(index)}
            >
              {category.category}
            </button>
          ))}
        </nav>
        <button type="button" aria-label="Add policy" onClick={addPolicy}>+ Policy</button>
      </div>

      <div className="policy-rules-panel">
        <div className="rule-group">
          <h3>{activeCategory.category}</h3>
          <div className="policy-rule-meta-grid">
            <label className="rule-field">
              <span>Policy name</span>
              <input value={activeCategory.category} onChange={(event) => updateActiveCategory({ category: event.target.value })} />
            </label>
            <label className="rule-field">
              <span>Abbreviation</span>
              <input value={activeCategory.abbreviation} onChange={(event) => updateActiveCategory({ abbreviation: event.target.value })} />
            </label>
            <label className="rule-field">
              <span>Step cost per tier</span>
              <input value={String(activeCategory.step_cost)} onChange={(event) => updateActiveCategory({ step_cost: parseStepCostValue(event.target.value) })} />
            </label>
            <label className="rule-field">
              <span>Base tier</span>
              <select value={activeCategory.base_option} onChange={(event) => updateActiveCategory({ base_option: event.target.value })}>
                {activeCategory.options.map((option) => (
                  <option key={option.name}>{option.name}</option>
                ))}
              </select>
            </label>
            <label className="check-field rule-field">
              <input
                type="checkbox"
                checked={activeCategory.can_be_forced_by_master}
                onChange={(event) => updateActiveCategory({ can_be_forced_by_master: event.target.checked })}
              />
              <span>Can be forced by master</span>
            </label>
            <label className="check-field rule-field">
              <input
                type="checkbox"
                checked={Boolean(activeCategory.forced_cost_halved)}
                onChange={(event) => updateActiveCategory({ forced_cost_halved: event.target.checked })}
              />
              <span>Forced cost halved</span>
            </label>
          </div>
          {hasMilitaryStepCosts(activeCategory) && (
            <div className="policy-rule-meta-grid compact">
              <label className="rule-field">
                <span>Military upward peace step cost</span>
                <input
                  type="number"
                  value={activeCategory.military_service_upward_peace_step_cost ?? 0}
                  onChange={(event) => updateActiveCategory({ military_service_upward_peace_step_cost: Number(event.target.value || 0) })}
                />
              </label>
              <label className="rule-field">
                <span>Military downward step cost</span>
                <input
                  type="number"
                  value={activeCategory.military_service_downward_step_cost ?? 0}
                  onChange={(event) => updateActiveCategory({ military_service_downward_step_cost: Number(event.target.value || 0) })}
                />
              </label>
              <label className="rule-field">
                <span>Military at-war step cost</span>
                <input
                  type="number"
                  value={activeCategory.military_service_at_war_step_cost ?? 0}
                  onChange={(event) => updateActiveCategory({ military_service_at_war_step_cost: Number(event.target.value || 0) })}
                />
              </label>
            </div>
          )}
          <CustomEffectsEditor
            label="Policy custom effects"
            effects={activeCategory.custom_effects}
            addButtonLabel="Add policy custom effect"
            defaultKey="custom_effect"
            onChange={(custom_effects) => updateActiveCategory({ custom_effects })}
          />
        </div>

        <PolicyTierEditor
          category={activeCategory}
          onChange={(nextCategory) => updateCategoryAt(activeIndex, nextCategory)}
        />
      </div>
    </div>
  );
}

function FocusedRuleList({
  items,
  activeIndex,
  activeKey,
  onSelect,
  onSelectKey,
  addLabel,
  addText,
  onAdd
}: {
  items: string[];
  activeIndex?: number;
  activeKey?: string;
  onSelect?: (index: number) => void;
  onSelectKey?: (key: string) => void;
  addLabel: string;
  addText: string;
  onAdd: () => void;
}) {
  return (
    <div className="focused-rules-sidebar">
      <nav className="focused-rules-subnav" aria-label="Rule entries">
        {items.map((item, index) => (
          <button
            key={`${item}-${index}`}
            className={activeKey ? item === activeKey ? "active" : "" : index === activeIndex ? "active" : ""}
            type="button"
            onClick={() => (onSelectKey ? onSelectKey(item) : onSelect?.(index))}
          >
            {item}
          </button>
        ))}
      </nav>
      <button type="button" aria-label={addLabel} onClick={onAdd}>{addText}</button>
    </div>
  );
}

function CustomEffectsEditor({
  label,
  effects,
  addButtonLabel,
  defaultKey,
  onChange
}: {
  label: string;
  effects?: CustomRuleEffects;
  addButtonLabel: string;
  defaultKey: string;
  onChange: (effects: CustomRuleEffects) => void;
}) {
  const entries = Object.entries(effects ?? {});
  const updateEntry = (oldKey: string, nextKey: string, nextValue: string | number) => {
    const next = { ...(effects ?? {}) };
    delete next[oldKey];
    next[nextKey || oldKey] = nextValue;
    onChange(next);
  };
  const addEffect = () => {
    const key = uniqueName(defaultKey, Object.keys(effects ?? {}));
    onChange({ ...(effects ?? {}), [key]: 0 });
  };

  return (
    <div className="custom-effects-editor">
      <div className="custom-effects-heading">
        <h4>{label}</h4>
        <button type="button" aria-label={addButtonLabel} onClick={addEffect}>+ Effect</button>
      </div>
      {entries.map(([key, entry]) => (
        <div className="custom-effect-row" key={key}>
          <input value={key} onChange={(event) => updateEntry(key, event.target.value, entry)} />
          <input value={String(entry)} onChange={(event) => updateEntry(key, key, parseOptionalRuleValue(event.target.value) ?? "")} />
          <button
            type="button"
            aria-label={`Delete ${key}`}
            onClick={() => {
              const next = { ...(effects ?? {}) };
              delete next[key];
              onChange(next);
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

function PolicyTierEditor({
  category,
  onChange
}: {
  category: PolicyCategoryRule;
  onChange: (value: PolicyCategoryRule) => void;
}) {
  const updateOption = (index: number, patch: Partial<PolicyOptionRule>) => {
    const nextOptions = category.options.map((option, itemIndex) => (itemIndex === index ? { ...option, ...patch } : option));
    const nextBase = category.options[index]?.name === category.base_option && patch.name ? patch.name : category.base_option;
    onChange({ ...category, options: nextOptions, base_option: nextBase });
  };

  const moveOption = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= category.options.length) return;
    const nextOptions = [...category.options];
    [nextOptions[index], nextOptions[targetIndex]] = [nextOptions[targetIndex], nextOptions[index]];
    onChange({ ...category, options: nextOptions });
  };

  const addTier = () => {
    const nextTier = createNewPolicyOption(category.options.length + 1);
    onChange({ ...category, options: [...category.options, nextTier] });
  };

  const deleteTier = (index: number) => {
    if (category.options.length <= 1) return;
    const deleted = category.options[index];
    const nextOptions = category.options.filter((_, itemIndex) => itemIndex !== index);
    const base_option = deleted.name === category.base_option ? nextOptions[0].name : category.base_option;
    onChange({ ...category, options: nextOptions, base_option });
  };

  return (
    <div className="rule-group policy-tier-section">
      <div className="policy-tier-heading">
        <h3>Ordered Tiers</h3>
        <button type="button" aria-label="Add tier" onClick={addTier}>+ Tier</button>
      </div>
      <table className="policy-tier-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Tier</th>
            <th>Gold</th>
            <th>Manpower</th>
            <th>Stability</th>
            <th>Special</th>
            <th>Base</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>
          {category.options.map((option, index) => (
            <tr key={`${option.name}-${index}`}>
              <td>
                <div className="tier-order-controls">
                  <button
                    type="button"
                    aria-label={`Move ${option.name} up`}
                    disabled={index === 0}
                    onClick={() => moveOption(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${option.name} down`}
                    disabled={index === category.options.length - 1}
                    onClick={() => moveOption(index, 1)}
                  >
                    ↓
                  </button>
                </div>
              </td>
              <td>
                <input value={option.name} onChange={(event) => updateOption(index, { name: event.target.value })} />
              </td>
              <td>
                <input
                  type="number"
                  value={option.gold_per_turn ?? 0}
                  onChange={(event) => updateOption(index, { gold_per_turn: Number(event.target.value || 0) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={option.manpower_per_turn ?? 0}
                  onChange={(event) => updateOption(index, { manpower_per_turn: Number(event.target.value || 0) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={option.stability_per_turn ?? 0}
                  onChange={(event) => updateOption(index, { stability_per_turn: Number(event.target.value || 0) })}
                />
              </td>
              <td>
                <input value={option.special ?? ""} onChange={(event) => updateOption(index, { special: event.target.value })} />
              </td>
              <td>
                <input
                  aria-label={`Set ${option.name} as base tier`}
                  type="radio"
                  checked={category.base_option === option.name}
                  onChange={() => onChange({ ...category, base_option: option.name })}
                />
              </td>
              <td>
                <button
                  type="button"
                  aria-label={`Delete ${option.name}`}
                  disabled={category.options.length <= 1}
                  onClick={() => deleteTier(index)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="policy-tier-effects-list">
        {category.options.map((option, index) => (
          <CustomEffectsEditor
            key={`${option.name}-${index}-effects`}
            label={`${option.name} custom effects`}
            effects={option.custom_effects}
            addButtonLabel="Add tier custom effect"
            defaultKey="tier_effect"
            onChange={(custom_effects) => updateOption(index, { custom_effects })}
          />
        ))}
      </div>
    </div>
  );
}

function FactoryRulesEditor({
  value,
  onChange
}: {
  value: FactoryRuleItem[];
  onChange: (value: FactoryRuleItem[]) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFactory = value[Math.min(activeIndex, Math.max(value.length - 1, 0))];
  const updateFactory = (patch: Partial<FactoryRuleItem>) => {
    if (!activeFactory) return;
    onChange(value.map((factory, index) => (index === activeIndex ? { ...factory, ...patch } : factory)));
  };
  const addFactory = () => {
    const next = [...value, { type: "New Factory", build_gold_cost: 0, inputs_per_turn: {}, outputs_per_turn: {} }];
    onChange(next);
    setActiveIndex(next.length - 1);
  };

  return (
    <div className="factory-rules-editor focused-rules-editor">
      <FocusedRuleList
        items={value.map((factory) => factory.type)}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        addLabel="Add factory rule"
        addText="+ Factory"
        onAdd={addFactory}
      />
      {activeFactory && (
        <div className="focused-rules-panel rule-group">
          <h3>{activeFactory.type}</h3>
          <div className="policy-rule-meta-grid">
            <label className="rule-field">
              <span>Factory name</span>
              <input value={activeFactory.type} onChange={(event) => updateFactory({ type: event.target.value })} />
            </label>
            <label className="rule-field">
              <span>Build cost (gold)</span>
              <input type="number" value={activeFactory.build_gold_cost} onChange={(event) => updateFactory({ build_gold_cost: Number(event.target.value || 0) })} />
            </label>
          </div>
          <div className="rule-grid">
            <RuleValueEditor
              label="Consumes each turn"
              value={activeFactory.inputs_per_turn as RuleValue}
              onChange={(inputs_per_turn) => updateFactory({ inputs_per_turn: inputs_per_turn as FactoryRuleItem["inputs_per_turn"] })}
            />
            <RuleValueEditor
              label="Produces each turn"
              value={activeFactory.outputs_per_turn as RuleValue}
              onChange={(outputs_per_turn) => updateFactory({ outputs_per_turn: outputs_per_turn as FactoryRuleItem["outputs_per_turn"] })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RulingPartyRulesEditor({
  value,
  onChange
}: {
  value: RulingPartyRules;
  onChange: (value: RulingPartyRules) => void;
}) {
  const names = Object.keys(value);
  const [activeName, setActiveName] = useState(names[0] ?? "");
  const activeParty = value[activeName] ?? value[names[0]];

  const updateParty = (patch: Partial<RulingPartyRuleItem>) => {
    if (!activeName) return;
    onChange({ ...value, [activeName]: { ...activeParty, ...patch } });
  };
  const renameParty = (nextName: string) => {
    if (!activeName || !nextName.trim()) return;
    const { [activeName]: party, ...rest } = value;
    onChange({ ...rest, [nextName]: party });
    setActiveName(nextName);
  };
  const addParty = () => {
    const nextName = uniqueName("New Party", Object.keys(value));
    onChange({ ...value, [nextName]: { stability_per_turn: 0, gold_per_turn: 0, stability_cap: 100 } });
    setActiveName(nextName);
  };

  return (
    <div className="ruling-party-rules-editor focused-rules-editor">
      <FocusedRuleList items={Object.keys(value)} activeKey={activeName} onSelectKey={setActiveName} addLabel="Add ruling party" addText="+ Party" onAdd={addParty} />
      {activeParty && (
        <div className="focused-rules-panel rule-group">
          <h3>{activeName}</h3>
          <div className="policy-rule-meta-grid">
            <label className="rule-field">
              <span>Ruling party name</span>
              <input value={activeName} onChange={(event) => renameParty(event.target.value)} />
            </label>
            {rulingPartyFieldKeys.map((key) => (
              <label className="rule-field" key={key}>
                <span>{labelFromKey(key)}</span>
                <input value={String(activeParty[key] ?? "")} onChange={(event) => updateParty({ [key]: parseOptionalRuleValue(event.target.value) } as Partial<RulingPartyRuleItem>)} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StabilityRulesEditor({
  value,
  onChange
}: {
  value: StabilityRules;
  onChange: (value: StabilityRules) => void;
}) {
  const [activePanel, setActivePanel] = useState<StabilityPanel>("settings");
  const settingsEntries = Object.entries(value).filter(([key]) => key !== "stabilityBands") as Array<[keyof Omit<StabilityRules, "stabilityBands">, number]>;
  const updateBand = (index: number, patch: Partial<StabilityBandItem>) =>
    onChange({ ...value, stabilityBands: value.stabilityBands.map((band, itemIndex) => (itemIndex === index ? { ...band, ...patch } : band)) });
  const moveBand = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= value.stabilityBands.length) return;
    const next = [...value.stabilityBands];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange({ ...value, stabilityBands: next });
  };

  return (
    <div className="stability-rules-editor focused-rules-editor">
      <div className="focused-rules-sidebar">
        <nav className="focused-rules-subnav" aria-label="Stability rule sections">
          <button className={activePanel === "settings" ? "active" : ""} type="button" onClick={() => setActivePanel("settings")}>Core settings</button>
          <button className={activePanel === "bands" ? "active" : ""} type="button" onClick={() => setActivePanel("bands")}>Stability bands</button>
        </nav>
      </div>
      <div className="focused-rules-panel rule-group">
        {activePanel === "settings" ? (
          <>
            <h3>Core Stability Settings</h3>
            <div className="policy-rule-meta-grid">
              {settingsEntries.map(([key, entry]) => (
                <label className="rule-field" key={String(key)}>
                  <span>{labelFromKey(String(key))}</span>
                  <input type="number" value={entry} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value || 0) })} />
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="policy-tier-heading">
              <h3>Stability Bands</h3>
              <button
                type="button"
                aria-label="Add stability band"
                onClick={() => onChange({ ...value, stabilityBands: [...value.stabilityBands, { min: 0, max: 0, gold_per_turn: 0, revolt_risk: "custom revolt risk" }] })}
              >
                + Band
              </button>
            </div>
            <table className="dice-rules-table">
              <thead>
                <tr><th>Order</th><th>Min</th><th>Max</th><th>Gold</th><th>Revolt risk</th></tr>
              </thead>
              <tbody>
                {value.stabilityBands.map((band, index) => (
                  <tr key={`${band.min}-${band.max}-${index}`}>
                    <td><div className="tier-order-controls"><button type="button" onClick={() => moveBand(index, -1)}>↑</button><button type="button" onClick={() => moveBand(index, 1)}>↓</button></div></td>
                    <td><input type="number" value={band.min} onChange={(event) => updateBand(index, { min: Number(event.target.value || 0) })} /></td>
                    <td><input type="number" value={band.max} onChange={(event) => updateBand(index, { max: Number(event.target.value || 0) })} /></td>
                    <td><input type="number" value={band.gold_per_turn} onChange={(event) => updateBand(index, { gold_per_turn: Number(event.target.value || 0) })} /></td>
                    <td><input value={band.revolt_risk} onChange={(event) => updateBand(index, { revolt_risk: event.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function PuppetRulesEditor({
  value,
  onChange
}: {
  value: PuppetRules;
  onChange: (value: PuppetRules) => void;
}) {
  const names = Object.keys(value);
  const [activeName, setActiveName] = useState(names[0] ?? "");
  const activePuppet = value[activeName] ?? value[names[0]];
  const updatePuppet = (patch: Partial<PuppetRuleItem>) => {
    if (!activeName) return;
    onChange({ ...value, [activeName]: { ...activePuppet, ...patch } });
  };
  const renamePuppet = (nextName: string) => {
    if (!activeName || !nextName.trim()) return;
    const { [activeName]: puppet, ...rest } = value;
    onChange({ ...rest, [nextName]: puppet });
    setActiveName(nextName);
  };
  const addPuppet = () => {
    const nextName = uniqueName("New Puppet Type", Object.keys(value));
    onChange({ ...value, [nextName]: { tribute_percent: 0, rounded_up: false, diplomacy_inherited_from_master: false, color_changes: false, master_permissions: [] } });
    setActiveName(nextName);
  };

  return (
    <div className="puppet-rules-editor focused-rules-editor">
      <FocusedRuleList items={Object.keys(value)} activeKey={activeName} onSelectKey={setActiveName} addLabel="Add puppet type" addText="+ Puppet Type" onAdd={addPuppet} />
      {activePuppet && (
        <div className="focused-rules-panel rule-group">
          <h3>{activeName}</h3>
          <div className="policy-rule-meta-grid">
            <label className="rule-field"><span>Puppet type name</span><input value={activeName} onChange={(event) => renamePuppet(event.target.value)} /></label>
            <label className="rule-field"><span>Tribute percent</span><input value={String(activePuppet.tribute_percent)} onChange={(event) => updatePuppet({ tribute_percent: parseStepCostValue(event.target.value) as PuppetRuleItem["tribute_percent"] })} /></label>
            <label className="check-field rule-field"><input type="checkbox" checked={activePuppet.rounded_up} onChange={(event) => updatePuppet({ rounded_up: event.target.checked })} /><span>Rounded up</span></label>
            <label className="rule-field"><span>Diplomacy inherited from master</span><input value={String(activePuppet.diplomacy_inherited_from_master)} onChange={(event) => updatePuppet({ diplomacy_inherited_from_master: parseBooleanishValue(event.target.value) })} /></label>
            <label className="rule-field"><span>Master permissions</span><select value={permissionPresetFor(activePuppet.master_permissions)} onChange={(event) => {
              const preset = permissionPresets.find((item) => item.label === event.target.value);
              if (preset?.value) updatePuppet({ master_permissions: [...preset.value] });
            }}>{permissionPresets.map((preset) => <option key={preset.label}>{preset.label}</option>)}</select></label>
          </div>
        </div>
      )}
    </div>
  );
}

function DiceRulesEditor({
  value,
  onChange
}: {
  value: DiceRules;
  onChange: (value: DiceRules) => void;
}) {
  const [activePanel, setActivePanel] = useState<DicePanel>("resultBands");

  const updateDice = (patch: Partial<DiceRules>) => onChange({ ...value, ...patch });

  return (
    <div className="dice-rules-editor">
      <nav className="dice-rules-subnav" aria-label="Dice modifier sections">
        {dicePanels.map((panel) => (
          <button
            key={panel.key}
            className={activePanel === panel.key ? "active" : ""}
            type="button"
            onClick={() => setActivePanel(panel.key)}
          >
            {panel.label}
          </button>
        ))}
      </nav>

      <div className="dice-rules-panel">
        {activePanel === "resultBands" && (
          <ResultBandsEditor
            value={value.resultBands}
            onChange={(resultBands) => updateDice({ resultBands })}
          />
        )}
        {activePanel === "attackTerrainNormal" && (
          <NumberRecordEditor
            title="Attack Terrain"
            value={value.attackTerrainNormal as Record<string, number>}
            onChange={(attackTerrainNormal) => updateDice({ attackTerrainNormal })}
          />
        )}
        {activePanel === "attackTerrainTank" && (
          <TankTerrainEditor
            value={value.attackTerrainTank}
            onChange={(attackTerrainTank) => updateDice({ attackTerrainTank })}
          />
        )}
        {activePanel === "expansionTerrain" && (
          <NumberRecordEditor
            title="Expansion Terrain"
            value={value.expansionTerrain}
            onChange={(expansionTerrain) => updateDice({ expansionTerrain })}
          />
        )}
        {activePanel === "encirclement" && (
          <NumberRecordEditor
            title="Encirclement"
            value={value.encirclement}
            onChange={(encirclement) => updateDice({ encirclement })}
          />
        )}
        {activePanel === "fortifications" && (
          <NumberRecordEditor
            title="Fortifications"
            value={value.fortifications}
            onChange={(fortifications) => updateDice({ fortifications })}
          />
        )}
        {activePanel === "costs" && (
          <div className="rule-group dice-rules-cost-grid">
            <h3>General Costs</h3>
            <label className="rule-field">
              <span>Expansion roll gold cost</span>
              <input
                type="number"
                value={value.expansion_roll_gold_cost}
                onChange={(event) => updateDice({ expansion_roll_gold_cost: Number(event.target.value || 0) })}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBandsEditor({
  value,
  onChange
}: {
  value: DiceRules["resultBands"];
  onChange: (value: DiceRules["resultBands"]) => void;
}) {
  return (
    <div className="rule-group">
      <h3>Result Bands</h3>
      <table className="dice-rules-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Min</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          {value.map((band, index) => (
            <tr key={`${band.category}-${index}`}>
              <td>
                <input
                  value={band.category}
                  onChange={(event) =>
                    onChange(value.map((entry, itemIndex) => (itemIndex === index ? { ...entry, category: event.target.value } : entry)))
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  value={band.min}
                  onChange={(event) =>
                    onChange(value.map((entry, itemIndex) => (itemIndex === index ? { ...entry, min: Number(event.target.value || 0) } : entry)))
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  value={band.max}
                  onChange={(event) =>
                    onChange(value.map((entry, itemIndex) => (itemIndex === index ? { ...entry, max: Number(event.target.value || 0) } : entry)))
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NumberRecordEditor({
  title,
  value,
  onChange
}: {
  title: string;
  value: Record<string, number>;
  onChange: (value: Record<string, number>) => void;
}) {
  return (
    <div className="rule-group">
      <h3>{title}</h3>
      <table className="dice-rules-table">
        <thead>
          <tr>
            <th>Modifier</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(value).map(([key, entry]) => (
            <tr key={key}>
              <td>{labelFromKey(key)}</td>
              <td>
                <input
                  type="number"
                  value={entry}
                  onChange={(event) => onChange({ ...value, [key]: Number(event.target.value || 0) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TankTerrainEditor({
  value,
  onChange
}: {
  value: DiceRules["attackTerrainTank"];
  onChange: (value: DiceRules["attackTerrainTank"]) => void;
}) {
  return (
    <div className="rule-group">
      <h3>Tank Terrain</h3>
      <table className="dice-rules-table">
        <thead>
          <tr>
            <th>Modifier</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(value).map(([key, entry]) => (
            <tr key={key}>
              <td>{labelFromKey(key)}</td>
              <td>
                <input
                  value={String(entry)}
                  onChange={(event) => onChange({ ...value, [key]: parseTankTerrainValue(event.target.value) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function parseTankTerrainValue(value: string): number | "impassable" {
  if (value.trim().toLowerCase() === "impassable") return "impassable";
  return Number(value || 0);
}

function parseStepCostValue(value: string): number | string {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : value;
}

function parseOptionalRuleValue(value: string): string | number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : value;
}

function parseBooleanishValue(value: string): string | boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return value;
}

function uniqueName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName;
  let index = 2;
  while (existingNames.includes(`${baseName} ${index}`)) {
    index += 1;
  }
  return `${baseName} ${index}`;
}

function createNewPolicyCategory(): PolicyCategoryRule {
  const baseOption = createNewPolicyOption(1);
  return {
    category: "New Policy",
    abbreviation: "NP",
    step_cost: 5,
    can_be_forced_by_master: false,
    forced_cost_halved: false,
    base_option: baseOption.name,
    options: [baseOption]
  };
}

function createNewPolicyOption(index: number): PolicyOptionRule {
  return {
    name: `New Tier ${index}`,
    gold_per_turn: 0,
    manpower_per_turn: 0,
    stability_per_turn: 0,
    special: ""
  };
}

function hasMilitaryStepCosts(category: PolicyCategoryRule): boolean {
  return (
    category.military_service_upward_peace_step_cost !== undefined ||
    category.military_service_downward_step_cost !== undefined ||
    category.military_service_at_war_step_cost !== undefined
  );
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
