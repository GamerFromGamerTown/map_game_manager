import { useEffect, useMemo, useState } from "react";
import { Check, Code2, RotateCcw, Save, Search } from "lucide-react";
import {
  FactoryRule,
  GameState,
  PolicyCategoryRule,
  PolicyOptionRule,
  RESOURCE_TYPES,
  ResourceBag,
  SettlementTier,
  SettlementTierRule
} from "../types";
import { defaultRules } from "../rules/defaultRules";
import { asNumber } from "../ui/fields";
import { ResourceBagEditor, ResourceBagView } from "../ui/ResourceBagView";

type RuleValue = string | number | boolean | null | RuleValue[] | { [key: string]: RuleValue };

export const sections = [
  ["Settings", "settings", "Core economy switches and numeric defaults"],
  ["Settlement tiers", "settlementTiers", "Tier output, caps, and upkeep"],
  ["Resource production", "resourceProduction", "Biome and mineral production tables"],
  ["Factory rules", "factoryRules", "Build costs, inputs, and outputs"],
  ["Policy rules", "policyCategories", "Policy categories and option effects"],
  ["Ruling parties", "rulingParties", "Party modifiers and stability caps"],
  ["Stability rules", "stabilityRules", "Bands, caps, and stability events"],
  ["Diplomacy rules", "diplomacyRelationTypes", "Available relation types"],
  ["Puppet rules", "puppetTypes", "Tribute and master permissions"],
  ["Dice modifiers", "dice", "Result bands and combat modifiers"]
] as const;

export type RuleSection = (typeof sections)[number][1];

const tierOrder: SettlementTier[] = ["village", "city", "large_city", "metropole"];

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const sectionLabel = (section: RuleSection) => sections.find(([, key]) => key === section)?.[0] ?? section;

export function RulesEditor({
  state,
  patchState,
  active,
  setActive
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  active: RuleSection;
  setActive: (section: RuleSection) => void;
}) {
  const [text, setText] = useState("");
  const [jsonMessage, setJsonMessage] = useState("");
  const [query, setQuery] = useState("");
  const activeSection = sections.find(([, key]) => key === active) ?? sections[0];

  useEffect(() => {
    setText(JSON.stringify(state.rules[active], null, 2));
    setJsonMessage("");
  }, [active, state.rules]);

  const updateActive = (value: RuleValue) => {
    patchState((current) => ({ ...current, rules: { ...current.rules, [active]: value } }));
  };

  const saveJson = () => {
    try {
      updateActive(JSON.parse(text) as RuleValue);
      setJsonMessage("JSON saved to structured rules.");
    } catch {
      setJsonMessage("Invalid JSON. Fix syntax before saving.");
    }
  };

  const validateJson = () => {
    try {
      JSON.parse(text);
      setJsonMessage("JSON is valid.");
    } catch (error) {
      setJsonMessage(error instanceof Error ? error.message : "Invalid JSON.");
    }
  };

  const formatJson = () => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
      setJsonMessage("JSON formatted.");
    } catch {
      setJsonMessage("Invalid JSON. Fix syntax before formatting.");
    }
  };

  const diffJson = () => {
    try {
      const parsed = JSON.parse(text);
      const current = state.rules[active];
      setJsonMessage(JSON.stringify(parsed) === JSON.stringify(current) ? "No diff from structured controls." : "JSON differs from structured controls.");
    } catch {
      setJsonMessage("Invalid JSON. Fix syntax before diffing.");
    }
  };

  const resetSection = () => {
    updateActive(structuredClone(defaultRules[active] as RuleValue));
    setJsonMessage(`${activeSection[0]} reset to default rules.`);
  };

  return (
    <section className="panel full rules-editor">
      <div className="rules-editor-heading">
        <div>
          <h2>Rules Editor</h2>
          <p className="quiet">Structured tables edit the current rules object. Advanced JSON is available below.</p>
        </div>
        <label className="rules-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this rule section" />
        </label>
      </div>

      <div className="rules-editor-layout">
        <nav className="rules-section-nav" aria-label="Rule sections">
          <div className="rules-section-tabs" role="tablist">
            {sections.map(([label, key, description]) => (
              <button
                key={key}
                role="tab"
                aria-selected={active === key}
                aria-controls={`rules-section-${key}`}
                className={active === key ? "active" : ""}
                onClick={() => setActive(key)}
              >
                <span>{label}</span>
                <small>{description}</small>
              </button>
            ))}
          </div>
        </nav>

        <section className="rules-active-section" id={`rules-section-${active}`} role="tabpanel">
          <div className="section-heading rules-active-heading">
            <div>
              <h2>{activeSection[0]}</h2>
              <span>{activeSection[2]}</span>
            </div>
            <span>{describeRuleValue(state.rules[active] as RuleValue)}</span>
          </div>

          {active === "settings" && <SettingsTable state={state} patchState={patchState} query={query} />}
          {active === "settlementTiers" && <SettlementTierTable state={state} patchState={patchState} query={query} />}
          {active === "resourceProduction" && <ResourceProductionTable state={state} patchState={patchState} query={query} />}
          {active === "factoryRules" && <FactoryRulesTable state={state} patchState={patchState} query={query} />}
          {active === "policyCategories" && <PolicyRulesTable state={state} patchState={patchState} query={query} />}
          {active === "rulingParties" && (
            <KeyValueRuleTable title="Ruling parties" value={state.rules.rulingParties as unknown as RuleValue} query={query} />
          )}
          {active === "stabilityRules" && (
            <KeyValueRuleTable title="Stability rules" value={state.rules.stabilityRules as unknown as RuleValue} query={query} />
          )}
          {active === "diplomacyRelationTypes" && (
            <StringListTable
              title="Diplomacy relation types"
              values={state.rules.diplomacyRelationTypes}
              query={query}
              onChange={(values) => patchState((current) => ({ ...current, rules: { ...current.rules, diplomacyRelationTypes: values } }))}
            />
          )}
          {active === "puppetTypes" && (
            <KeyValueRuleTable title="Puppet rules" value={state.rules.puppetTypes as unknown as RuleValue} query={query} />
          )}
          {active === "dice" && <KeyValueRuleTable title="Dice modifiers" value={state.rules.dice as unknown as RuleValue} query={query} />}
        </section>
      </div>

      <details className="advanced-json">
        <summary>
          <Code2 size={16} /> Advanced JSON editor for {sectionLabel(active)}
        </summary>
        <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        <div className="actions left">
          <button onClick={validateJson}>
            <Check size={16} /> Validate JSON
          </button>
          <button onClick={formatJson}>Format JSON</button>
          <button onClick={diffJson}>Diff against structured controls</button>
          <button onClick={resetSection}>
            <RotateCcw size={16} /> Reset section
          </button>
          <button className="primary" onClick={saveJson}>
            <Save size={16} /> Save JSON section
          </button>
          {jsonMessage && <span className={jsonMessage.includes("Invalid") ? "bad" : "good"}>{jsonMessage}</span>}
        </div>
      </details>
    </section>
  );
}

function describeRuleValue(value: RuleValue): string {
  if (Array.isArray(value)) return `${value.length} rows`;
  if (value && typeof value === "object") return `${Object.keys(value).length} fields`;
  return "1 field";
}

function matches(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function SettingsTable({
  state,
  patchState,
  query
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  query: string;
}) {
  const rows = Object.entries(state.rules.settings).filter(([key]) => matches(key, query));
  const update = (key: string, value: string | boolean) =>
    patchState((current) => ({
      ...current,
      rules: {
        ...current.rules,
        settings: {
          ...current.rules.settings,
          [key]: typeof value === "boolean" ? value : asNumber(value)
        }
      }
    }));

  return (
    <div className="table-wrap">
      <table className="rule-data-table dense-table sticky-first-column">
        <thead>
          <tr>
            <th>Setting</th>
            <th>Value</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key} id={`rule-setting-${slug(key)}`} tabIndex={-1}>
              <td>{key}</td>
              <td>
                {typeof value === "boolean" ? (
                  <input type="checkbox" checked={value} onChange={(event) => update(key, event.target.checked)} />
                ) : (
                  <input type="number" value={Number(value)} onChange={(event) => update(key, event.target.value)} />
                )}
              </td>
              <td>{typeof value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettlementTierTable({
  state,
  patchState,
  query
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  query: string;
}) {
  const [expanded, setExpanded] = useState<SettlementTier | "">("");
  const rows = tierOrder.filter((tier) => matches(tier, query));
  const updateTier = (tier: SettlementTier, patch: Partial<SettlementTierRule>) =>
    patchState((current) => ({
      ...current,
      rules: {
        ...current.rules,
        settlementTiers: {
          ...current.rules.settlementTiers,
          [tier]: { ...current.rules.settlementTiers[tier], ...patch }
        }
      }
    }));
  const updateUpkeep = (tier: SettlementTier, option: "A" | "B", bag: ResourceBag) =>
    updateTier(tier, { upkeep: { ...state.rules.settlementTiers[tier].upkeep, [option]: bag } });

  return (
    <div className="table-wrap">
      <table className="rule-data-table dense-table sticky-first-column">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Create gold</th>
            <th>Create stability</th>
            <th>Gold/turn</th>
            <th>Capital extra</th>
            <th>Manpower cap</th>
            <th>Manpower gain</th>
            <th>Multiplier</th>
            <th>Upkeep</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tier) => {
            const rule = state.rules.settlementTiers[tier];
            return (
              <>
                <tr key={tier} id={`rule-settlement-${tier}`} tabIndex={-1}>
                  <td>{tier}</td>
                  <td><input type="number" value={rule.creation_gold_cost ?? 0} onChange={(event) => updateTier(tier, { creation_gold_cost: asNumber(event.target.value) })} /></td>
                  <td><input type="number" value={rule.creation_stability_cost ?? 0} onChange={(event) => updateTier(tier, { creation_stability_cost: asNumber(event.target.value) })} /></td>
                  <td><input type="number" value={rule.gold_per_turn} onChange={(event) => updateTier(tier, { gold_per_turn: asNumber(event.target.value) })} /></td>
                  <td><input type="number" value={rule.capital_extra_gold_per_turn} onChange={(event) => updateTier(tier, { capital_extra_gold_per_turn: asNumber(event.target.value) })} /></td>
                  <td><input type="number" value={rule.manpower_cap_bonus} onChange={(event) => updateTier(tier, { manpower_cap_bonus: asNumber(event.target.value) })} /></td>
                  <td><input type="number" value={rule.manpower_gain_per_turn} onChange={(event) => updateTier(tier, { manpower_gain_per_turn: asNumber(event.target.value) })} /></td>
                  <td><input type="number" value={rule.tier_multiplier} onChange={(event) => updateTier(tier, { tier_multiplier: asNumber(event.target.value) })} /></td>
                  <td>
                    <button onClick={() => setExpanded(expanded === tier ? "" : tier)}>
                      {expanded === tier ? "Close upkeep" : "Edit upkeep"}
                    </button>
                  </td>
                </tr>
                {expanded === tier && (
                  <tr className="expanded-rule-row">
                    <td colSpan={9}>
                      <div className="rule-expansion-grid">
                        <div>
                          <h3>Upkeep option A</h3>
                          <ResourceBagEditor bag={rule.upkeep.A ?? {}} onChange={(bag) => updateUpkeep(tier, "A", bag)} compact />
                        </div>
                        <div>
                          <h3>Upkeep option B</h3>
                          <ResourceBagEditor bag={rule.upkeep.B ?? {}} onChange={(bag) => updateUpkeep(tier, "B", bag)} compact />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResourceProductionTable({
  state,
  patchState,
  query
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  query: string;
}) {
  const [sort, setSort] = useState<"name" | "total">("name");
  const rows = useMemo(
    () =>
      Object.entries(state.rules.resourceProduction)
        .filter(([name]) => matches(name, query))
        .sort(([aName, aBag], [bName, bBag]) => {
          if (sort === "name") return aName.localeCompare(bName);
          const aTotal = RESOURCE_TYPES.reduce((sum, resource) => sum + Number(aBag[resource] ?? 0), 0);
          const bTotal = RESOURCE_TYPES.reduce((sum, resource) => sum + Number(bBag[resource] ?? 0), 0);
          return bTotal - aTotal || aName.localeCompare(bName);
        }),
    [query, sort, state.rules.resourceProduction]
  );
  const update = (name: string, resource: string, value: number | boolean) =>
    patchState((current) => ({
      ...current,
      rules: {
        ...current.rules,
        resourceProduction: {
          ...current.rules.resourceProduction,
          [name]: {
            ...current.rules.resourceProduction[name],
            [resource]: value
          }
        }
      }
    }));

  return (
    <div className="table-wrap">
      <table className="rule-data-table dense-table resource-rule-table sticky-first-column">
        <thead>
          <tr>
            <th><button className="table-sort" onClick={() => setSort("name")}>Biome/resource</button></th>
            <th>Cannot settle</th>
            <th><button className="table-sort" onClick={() => setSort("total")}>Total</button></th>
            {RESOURCE_TYPES.map((resource) => <th key={resource}>{resource}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, bag]) => (
            <tr key={name} id={`rule-resource-${slug(name)}`} tabIndex={-1}>
              <td>{name}</td>
              <td><input type="checkbox" checked={Boolean(bag.cannot_be_settled)} onChange={(event) => update(name, "cannot_be_settled", event.target.checked)} /></td>
              <td className="numeric">{RESOURCE_TYPES.reduce((sum, resource) => sum + Number(bag[resource] ?? 0), 0)}</td>
              {RESOURCE_TYPES.map((resource) => (
                <td key={resource}>
                  <input type="number" value={Number(bag[resource] ?? 0)} onChange={(event) => update(name, resource, asNumber(event.target.value))} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FactoryRulesTable({
  state,
  patchState,
  query
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  query: string;
}) {
  const [expanded, setExpanded] = useState("");
  const [sort, setSort] = useState<"type" | "cost">("type");
  const rows = state.rules.factoryRules
    .filter((rule) => matches(rule.type, query))
    .slice()
    .sort((a, b) => (sort === "type" ? a.type.localeCompare(b.type) : b.build_gold_cost - a.build_gold_cost));
  const updateRule = (index: number, patch: Partial<FactoryRule>) =>
    patchState((current) => ({
      ...current,
      rules: {
        ...current.rules,
        factoryRules: current.rules.factoryRules.map((rule, ruleIndex) =>
          ruleIndex === index ? { ...rule, ...patch } : rule
        )
      }
    }));

  return (
    <div className="table-wrap">
      <table className="rule-data-table dense-table sticky-first-column">
        <thead>
          <tr>
            <th><button className="table-sort" onClick={() => setSort("type")}>Type</button></th>
            <th><button className="table-sort" onClick={() => setSort("cost")}>Build cost</button></th>
            <th>Inputs/turn</th>
            <th>Outputs/turn</th>
            <th>Missing-input warning</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rule) => {
            const index = state.rules.factoryRules.indexOf(rule);
            const ruleId = `rule-factory-${slug(rule.type)}`;
            return (
              <>
                <tr key={rule.type} id={ruleId} tabIndex={-1}>
                  <td><input value={rule.type} onChange={(event) => updateRule(index, { type: event.target.value })} /></td>
                  <td><input type="number" value={rule.build_gold_cost} onChange={(event) => updateRule(index, { build_gold_cost: asNumber(event.target.value) })} /></td>
                  <td><ResourceBagView bag={rule.inputs_per_turn} /></td>
                  <td><ResourceBagView bag={rule.outputs_per_turn} /></td>
                  <td>{Object.keys(rule.inputs_per_turn).length > 0 ? "Block output when short" : "No inputs required"}</td>
                  <td><button onClick={() => setExpanded(expanded === rule.type ? "" : rule.type)}>{expanded === rule.type ? "Close" : "Edit IO"}</button></td>
                </tr>
                {expanded === rule.type && (
                  <tr className="expanded-rule-row">
                    <td colSpan={6}>
                      <div className="rule-expansion-grid">
                        <div>
                          <h3>Inputs per turn</h3>
                          <ResourceBagEditor bag={rule.inputs_per_turn} onChange={(bag) => updateRule(index, { inputs_per_turn: bag })} compact />
                        </div>
                        <div>
                          <h3>Outputs per turn</h3>
                          <ResourceBagEditor bag={rule.outputs_per_turn} onChange={(bag) => updateRule(index, { outputs_per_turn: bag })} compact />
                          <label className="rule-field">
                            <span>Gold output</span>
                            <input
                              type="number"
                              value={Number(rule.outputs_per_turn.gold ?? 0)}
                              onChange={(event) =>
                                updateRule(index, {
                                  outputs_per_turn: { ...rule.outputs_per_turn, gold: asNumber(event.target.value) }
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PolicyRulesTable({
  state,
  patchState,
  query
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  query: string;
}) {
  const [expanded, setExpanded] = useState("");
  const [sort, setSort] = useState<"category" | "options">("category");
  const rows = state.rules.policyCategories
    .filter((rule) => matches(rule.category, query) || matches(rule.abbreviation, query))
    .slice()
    .sort((a, b) => (sort === "category" ? a.category.localeCompare(b.category) : b.options.length - a.options.length));
  const updateCategory = (index: number, patch: Partial<PolicyCategoryRule>) =>
    patchState((current) => ({
      ...current,
      rules: {
        ...current.rules,
        policyCategories: current.rules.policyCategories.map((rule, ruleIndex) =>
          ruleIndex === index ? { ...rule, ...patch } : rule
        )
      }
    }));
  const updateOption = (categoryIndex: number, optionIndex: number, patch: Partial<PolicyOptionRule>) => {
    const category = state.rules.policyCategories[categoryIndex];
    updateCategory(categoryIndex, {
      options: category.options.map((option, index) => (index === optionIndex ? { ...option, ...patch } : option))
    });
  };

  return (
    <div className="table-wrap">
      <table className="rule-data-table dense-table sticky-first-column">
        <thead>
          <tr>
            <th><button className="table-sort" onClick={() => setSort("category")}>Category</button></th>
            <th>Abbrev.</th>
            <th>Step cost</th>
            <th>Forced by master</th>
            <th>Base option</th>
            <th><button className="table-sort" onClick={() => setSort("options")}>Option count</button></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((category) => {
            const index = state.rules.policyCategories.indexOf(category);
            return (
              <>
                <tr key={category.category} id={`rule-policy-${slug(category.category)}`} tabIndex={-1}>
                  <td><input value={category.category} onChange={(event) => updateCategory(index, { category: event.target.value })} /></td>
                  <td><input value={category.abbreviation} onChange={(event) => updateCategory(index, { abbreviation: event.target.value })} /></td>
                  <td><input value={String(category.step_cost)} onChange={(event) => updateCategory(index, { step_cost: event.target.value })} /></td>
                  <td><input type="checkbox" checked={category.can_be_forced_by_master} onChange={(event) => updateCategory(index, { can_be_forced_by_master: event.target.checked })} /></td>
                  <td>
                    <select value={category.base_option} onChange={(event) => updateCategory(index, { base_option: event.target.value })}>
                      {category.options.map((option) => <option key={option.name}>{option.name}</option>)}
                    </select>
                  </td>
                  <td className="numeric">{category.options.length}</td>
                  <td><button onClick={() => setExpanded(expanded === category.category ? "" : category.category)}>{expanded === category.category ? "Close" : "Edit options"}</button></td>
                </tr>
                {expanded === category.category && (
                  <tr className="expanded-rule-row">
                    <td colSpan={7}>
                      <table className="nested-rule-table dense-table">
                        <thead>
                          <tr><th>Option</th><th>Gold</th><th>Stability</th><th>Manpower</th><th>Special</th></tr>
                        </thead>
                        <tbody>
                          {category.options.map((option, optionIndex) => (
                            <tr key={option.name}>
                              <td><input value={option.name} onChange={(event) => updateOption(index, optionIndex, { name: event.target.value })} /></td>
                              <td><input type="number" value={option.gold_per_turn ?? 0} onChange={(event) => updateOption(index, optionIndex, { gold_per_turn: asNumber(event.target.value) })} /></td>
                              <td><input type="number" value={option.stability_per_turn ?? 0} onChange={(event) => updateOption(index, optionIndex, { stability_per_turn: asNumber(event.target.value) })} /></td>
                              <td><input type="number" value={option.manpower_per_turn ?? 0} onChange={(event) => updateOption(index, optionIndex, { manpower_per_turn: asNumber(event.target.value) })} /></td>
                              <td><input value={option.special ?? ""} onChange={(event) => updateOption(index, optionIndex, { special: event.target.value })} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueRuleTable({ title, value, query }: { title: string; value: RuleValue; query: string }) {
  const rows = flattenRuleValue(value).filter((row) => matches(`${row.path} ${row.value}`, query));
  return (
    <div className="table-wrap">
      <table className="rule-data-table dense-table sticky-first-column">
        <caption>{title}</caption>
        <thead><tr><th>Path</th><th>Value</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path}>
              <td>{row.path}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StringListTable({
  title,
  values,
  query,
  onChange
}: {
  title: string;
  values: string[];
  query: string;
  onChange: (values: string[]) => void;
}) {
  const rows = values.map((value, index) => ({ value, index })).filter((row) => matches(row.value, query));
  return (
    <div className="table-wrap">
      <table className="rule-data-table dense-table sticky-first-column">
        <caption>{title}</caption>
        <thead><tr><th>Relation type</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index}>
              <td><input value={row.value} onChange={(event) => onChange(values.map((value, index) => index === row.index ? event.target.value : value))} /></td>
              <td><button onClick={() => onChange(values.filter((_, index) => index !== row.index))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-footer-actions">
        <button onClick={() => onChange([...values, "New Relation Type"])}>Add relation type</button>
      </div>
    </div>
  );
}

function flattenRuleValue(value: RuleValue, prefix = ""): Array<{ path: string; value: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenRuleValue(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => flattenRuleValue(entry, prefix ? `${prefix}.${key}` : key));
  }
  return [{ path: prefix || "value", value: String(value ?? "") }];
}
