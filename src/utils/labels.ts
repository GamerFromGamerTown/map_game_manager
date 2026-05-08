const titleCase = (value: string): string =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export const labelFromKey = (value: string): string =>
  value === "totalDelta"
    ? "Total"
    : titleCase(
        value
          .replace(/delta/gi, "total")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/_/g, " ")
      );

export const resourceLabel = (value: string): string => {
  if (value === "gold") return "Gold";
  return labelFromKey(value);
};

export const biomeLabel = (value: string): string => {
  const legacyLabels: Record<string, string> = {
    stat_empty: "Empty",
    stat_food: "Food",
    stat_wood: "Wood",
    stat_coal: "Coal",
    stat_iron: "Iron",
    stat_bauxite: "Bauxite",
    stat_copper: "Copper",
    stat_gold: "Gold",
    stat_food_bauxite: "Food + Bauxite",
    stat_food_coal: "Food + Coal",
    stat_food_gold: "Food + Gold"
  };

  return legacyLabels[value] ?? labelFromKey(value);
};

export const routeTypeLabel = (value: string): string => labelFromKey(value);

export const isLegacySettlementType = (value: string): boolean => value.startsWith("stat_");

export const settlementTypeOptions = (values: string[], currentValue?: string): string[] => {
  const canonical = values.filter((value) => !isLegacySettlementType(value));
  if (currentValue && isLegacySettlementType(currentValue) && values.includes(currentValue)) {
    return [currentValue, ...canonical];
  }
  return canonical;
};
