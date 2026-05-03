import { Country, PolicyCategoryRule } from "../types";

export const policyChangeStabilityCost = (
  category: PolicyCategoryRule,
  currentOption: string,
  nextOption: string,
  country: Country
): number => {
  const from = Math.max(0, category.options.findIndex((option) => option.name === currentOption));
  const to = Math.max(0, category.options.findIndex((option) => option.name === nextOption));
  const steps = Math.abs(to - from);
  if (steps === 0) return 0;

  if (category.category === "Military Service") {
    const stepCost = country.at_war
      ? category.military_service_at_war_step_cost ?? 0
      : to < from
        ? category.military_service_upward_peace_step_cost ?? 0
        : category.military_service_downward_step_cost ?? 0;
    return steps * stepCost;
  }

  return steps * (typeof category.step_cost === "number" ? category.step_cost : 0);
};
