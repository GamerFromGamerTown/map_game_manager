import { Factory, RulesConfig } from "../types";

type FactoryRule = RulesConfig["factoryRules"][number];

const commonFactoryTerms: Record<string, string> = {
  electronic: "electronics",
  alumnium: "aluminium",
  alluminum: "aluminium",
  aluminum: "aluminium",
  part: "parts",
  equipments: "equipment",
  necessities: "necessities"
};

export const normalizeFactoryTypeName = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => commonFactoryTerms[word] ?? word)
    .join(" ");

const factoryRuleKeys = (rule: FactoryRule): string[] => [
  normalizeFactoryTypeName(rule.type),
  ...(rule.aliases ?? []).map(normalizeFactoryTypeName)
];

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
};

const canFuzzyMatch = (input: string, candidate: string): boolean => {
  if (!input.endsWith("factory") || !candidate.endsWith("factory")) return false;
  const distance = editDistance(input, candidate);
  return distance <= Math.max(1, Math.floor(candidate.length * 0.12));
};

export const findFactoryRule = (rules: RulesConfig, factoryType: string): FactoryRule | undefined => {
  const normalized = normalizeFactoryTypeName(factoryType);
  const exact = rules.factoryRules.find((rule) => factoryRuleKeys(rule).includes(normalized));
  if (exact) return exact;

  const fuzzyMatches = rules.factoryRules.filter((rule) =>
    factoryRuleKeys(rule).some((key) => canFuzzyMatch(normalized, key))
  );
  return fuzzyMatches.length === 1 ? fuzzyMatches[0] : undefined;
};

export const canonicalFactoryType = (rules: RulesConfig, factoryType: string): string =>
  findFactoryRule(rules, factoryType)?.type ?? factoryType;

export const canonicalizeFactory = (rules: RulesConfig, factory: Factory): Factory => ({
  ...factory,
  type: canonicalFactoryType(rules, factory.type)
});
