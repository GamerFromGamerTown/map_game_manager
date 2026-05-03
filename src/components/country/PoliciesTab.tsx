import { useState } from "react";
import { Country, GameState, OverrideLog, PolicyCategoryRule, PolicySelection } from "../../types";
import { createId } from "../../engine/calculations";
import { policyChangeStabilityCost } from "../../engine/policies";
import { CheckboxField, formatSigned } from "../../ui/fields";

export function PoliciesTab({
  state,
  country,
  patchState
}: {
  state: GameState;
  country: Country;
  patchState: (updater: (current: GameState) => GameState) => void;
}) {
  const [waiveCost, setWaiveCost] = useState(false);

  const changePolicy = (category: PolicyCategoryRule, selectedOption: string) => {
    const selected =
      state.policies.find((policy) => policy.country_id === country.id && policy.policy_category === category.category) ??
      ({ selected_option: category.base_option, last_changed_turn: -1 } as PolicySelection);
    const cost = policyChangeStabilityCost(category, selected.selected_option, selectedOption, country);
    const entry: OverrideLog | null =
      waiveCost && cost > 0
        ? {
            id: createId("override"),
            turn_number: state.turnNumber,
            entity_type: "PolicySelection",
            entity_id: country.id,
            field_name: `${category.category} stability side effect`,
            old_value: String(cost),
            new_value: "0",
            reason: "GM waived policy-change stability cost",
            timestamp: new Date().toISOString()
          }
        : null;

    patchState((current) => {
      const exists = current.policies.some(
        (policy) => policy.country_id === country.id && policy.policy_category === category.category
      );
      const row: PolicySelection = {
        country_id: country.id,
        policy_category: category.category,
        selected_option: selectedOption,
        last_changed_turn: current.turnNumber
      };

      return {
        ...current,
        countries: current.countries.map((item) =>
          item.id === country.id && !waiveCost
            ? { ...item, stability: Math.max(0, item.stability - cost) }
            : item
        ),
        policies: exists
          ? current.policies.map((policy) =>
              policy.country_id === country.id && policy.policy_category === category.category ? row : policy
            )
          : [...current.policies, row],
        overrides: entry ? [entry, ...current.overrides] : current.overrides
      };
    });
  };

  return (
    <div className="section-stack">
      <div className="toolbar-line">
        <CheckboxField label="Waive policy stability side effects" checked={waiveCost} onChange={setWaiveCost} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Option</th>
              <th>Step Cost</th>
              <th>Gold</th>
              <th>Stability</th>
              <th>Manpower</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {state.rules.policyCategories.map((category) => {
              const selected =
                state.policies.find((policy) => policy.country_id === country.id && policy.policy_category === category.category) ??
                ({ selected_option: category.base_option, last_changed_turn: -1 } as PolicySelection);
              const option = category.options.find((item) => item.name === selected.selected_option) ?? category.options[0];
              return (
                <tr key={category.category}>
                  <td>{category.category}</td>
                  <td>
                    <select value={selected.selected_option} onChange={(event) => changePolicy(category, event.target.value)}>
                      {category.options.map((policyOption) => (
                        <option key={policyOption.name}>{policyOption.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>{String(category.step_cost)}</td>
                  <td>{formatSigned(option.gold_per_turn ?? 0)}</td>
                  <td>{formatSigned(option.stability_per_turn ?? 0)}</td>
                  <td>{formatSigned(option.manpower_per_turn ?? 0)}</td>
                  <td>{selected.last_changed_turn === state.turnNumber ? <span className="warn">changed this turn</span> : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="quiet">
        Policy changes subtract their step cost immediately unless the side-effect waiver is enabled. Undo restores the prior state either way.
      </p>
    </div>
  );
}
