import { GameState, RulesConfig } from "../types";
import { defaultRules } from "../rules/defaultRules";

const mergeRuleRecords = <T extends Record<string, unknown>>(defaults: T, current: T | undefined): T => ({
  ...structuredClone(defaults),
  ...(current ?? {})
});

const normalizeRules = (rules: RulesConfig): RulesConfig => ({
  ...structuredClone(defaultRules),
  ...rules,
  settings: {
    ...defaultRules.settings,
    ...rules.settings
  },
  settlementTiers: mergeRuleRecords(defaultRules.settlementTiers, rules.settlementTiers),
  resourceProduction: mergeRuleRecords(defaultRules.resourceProduction, rules.resourceProduction),
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
