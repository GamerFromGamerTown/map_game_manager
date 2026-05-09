import { GameState, RulesConfig } from "../types";
import { defaultRules } from "../rules/defaultRules";
import { normalizeFactoryTypeName } from "../rules/factoryRules";

const mergeRuleRecords = <T extends Record<string, unknown>>(defaults: T, current: T | undefined): T => ({
  ...structuredClone(defaults),
  ...(current ?? {})
});

const mergeFactoryRules = (
  defaults: RulesConfig["factoryRules"],
  current: RulesConfig["factoryRules"] | undefined
): RulesConfig["factoryRules"] => {
  const currentByKey = new Map((current ?? []).map((rule) => [normalizeFactoryTypeName(rule.type), rule]));
  const merged = defaults.map((defaultRule) => {
    const currentRule = currentByKey.get(normalizeFactoryTypeName(defaultRule.type));
    if (!currentRule) return structuredClone(defaultRule);
    return {
      ...structuredClone(defaultRule),
      ...currentRule,
      aliases: Array.from(new Set([...(defaultRule.aliases ?? []), ...(currentRule.aliases ?? [])]))
    };
  });
  const defaultKeys = new Set(defaults.map((rule) => normalizeFactoryTypeName(rule.type)));
  return [
    ...merged,
    ...(current ?? []).filter((rule) => !defaultKeys.has(normalizeFactoryTypeName(rule.type))).map((rule) => structuredClone(rule))
  ];
};

const normalizeRules = (rules: RulesConfig): RulesConfig => ({
  ...structuredClone(defaultRules),
  ...rules,
  settings: {
    ...defaultRules.settings,
    ...rules.settings
  },
  settlementTiers: mergeRuleRecords(defaultRules.settlementTiers, rules.settlementTiers),
  resourceProduction: mergeRuleRecords(defaultRules.resourceProduction, rules.resourceProduction),
  factoryRules: mergeFactoryRules(defaultRules.factoryRules, rules.factoryRules),
  factoryRepair: {
    ...defaultRules.factoryRepair,
    ...rules.factoryRepair
  },
  manpowerRules: {
    ...defaultRules.manpowerRules,
    ...rules.manpowerRules
  },
  stabilityRules: {
    ...defaultRules.stabilityRules,
    ...rules.stabilityRules,
    stabilityBands: rules.stabilityRules?.stabilityBands ?? defaultRules.stabilityRules.stabilityBands
  },
  rulingParties: Object.fromEntries(
    Object.entries({
      ...defaultRules.rulingParties,
      ...rules.rulingParties
    }).map(([party, rule]) => [
      party,
      {
        ...(defaultRules.rulingParties[party] ?? {}),
        ...rule
      }
    ])
  ),
  military: {
    ...defaultRules.military,
    ...rules.military,
    supplyTiers: {
      ...defaultRules.military.supplyTiers,
      ...rules.military?.supplyTiers
    },
    operations: {
      ...defaultRules.military.operations,
      ...rules.military?.operations
    }
  },
  dice: {
    ...defaultRules.dice,
    ...rules.dice,
    resultBands: rules.dice?.resultBands ?? defaultRules.dice.resultBands,
    attackTerrainNormal: {
      ...defaultRules.dice.attackTerrainNormal,
      ...rules.dice?.attackTerrainNormal
    },
    attackTerrainTank: {
      ...defaultRules.dice.attackTerrainTank,
      ...rules.dice?.attackTerrainTank
    },
    expansionTerrain: {
      ...defaultRules.dice.expansionTerrain,
      ...rules.dice?.expansionTerrain
    },
    encirclement: {
      ...defaultRules.dice.encirclement,
      ...rules.dice?.encirclement
    },
    fortifications: {
      ...defaultRules.dice.fortifications,
      ...rules.dice?.fortifications
    }
  }
});

export const normalizeLoadedState = (state: GameState): GameState => ({
  ...state,
  rules: normalizeRules(state.rules)
});
