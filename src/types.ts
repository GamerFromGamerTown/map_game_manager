export const RESOURCE_TYPES = [
  "food",
  "wood",
  "plank",
  "coal",
  "iron",
  "iron_parts",
  "bauxite",
  "aluminium",
  "aluminium_parts",
  "copper",
  "copper_parts",
  "gold_ore",
  "gold_ingot",
  "equipment",
  "high_quality_equipment",
  "fine_machinery",
  "tank_parts",
  "tank_electronics",
  "tanks",
  "necessities",
  "supply"
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type TradableType = ResourceType | "gold";
export type ResourceBag = Partial<Record<ResourceType, number>>;
export type SettlementTier = "village" | "city" | "large_city" | "metropole";
export type RouteType = "road" | "railway" | "sea" | "abstract";

export interface Country {
  id: string;
  name: string;
  short_name?: string;
  color: string;
  is_player_country: boolean;
  ruling_party: string;
  gold: number;
  stability: number;
  manpower: number;
  manpower_cap: number;
  manual_manpower_cap_override?: number | null;
  reserve: number;
  equipment: number;
  high_quality_equipment: number;
  tanks: number;
  supply: number;
  current_turn_created: number;
  at_war: boolean;
  peace_turns_count: number;
  council_player_count?: number;
  turn_preview_warnings?: string[];
  notes: string;
}

export interface Settlement {
  id: string;
  country_id: string;
  name: string;
  tier: SettlementTier;
  is_capital: boolean;
  biome_or_resource_type: string;
  manual_resource_override?: ResourceBag | null;
  upkeep_option?: "A" | "B";
  occupied_by_country_id?: string | null;
  damaged: boolean;
  bombed: boolean;
  connected_for_upkeep: boolean;
  notes: string;
}

export interface Factory {
  id: string;
  country_id: string;
  type: string;
  active: boolean;
  damaged: boolean;
  bombed: boolean;
  notes: string;
}

export interface ResourceStockpile {
  country_id: string;
  resource_type: ResourceType;
  amount: number;
}

export interface PolicySelection {
  country_id: string;
  policy_category: string;
  selected_option: string;
  last_changed_turn: number;
}

export interface DiplomaticRelation {
  id: string;
  relation_type: string;
  country_a_id: string;
  country_b_id: string;
  active: boolean;
  notes: string;
  graph_custom?: {
    enabled: boolean;
    line_type: "solid" | "dashed" | "dotted";
    color: string;
    hover_text: string;
    directed?: boolean;
    group_id?: string;
  };
}

export interface PuppetRelation {
  id: string;
  master_country_id: string;
  puppet_country_id: string;
  puppet_type: string;
  tribute_percent: number;
  rebellion_immunity_turns_remaining: number;
  active: boolean;
  notes: string;
}

export interface TradeRoute {
  id: string;
  sender_country_id: string;
  receiver_country_id: string;
  resource_type: TradableType;
  amount_per_turn: number;
  payment_gold_per_turn?: number;
  recurring: boolean;
  route_type: RouteType;
  sea_transport_cost_per_unit: number;
  sea_cost_payer?: "sender" | "receiver";
  route_valid: boolean;
  blocked_by_embargo: boolean;
  active: boolean;
  notes: string;
}

export interface MilitaryOperation {
  id: string;
  name: string;
  attacker_country_id: string;
  defender_country_id: string;
  operation_type: string;
  troops_normal: number;
  troops_high_quality: number;
  troops_tank: number;
  supply_required: number;
  supply_allocated: number;
  status: string;
  notes: string;
}

export interface DiceRollLog {
  id: string;
  turn_number: number;
  country_id: string;
  operation_id?: string | null;
  roll_type: string;
  raw_d20: number;
  modifiers_json: string;
  final_score: number;
  result_category: string;
  notes: string;
}

export interface TurnLog {
  id: string;
  turn_number: number;
  country_id: string;
  gold_before: number;
  gold_after: number;
  stability_before: number;
  stability_after: number;
  manpower_before: number;
  manpower_after: number;
  resources_before_json: string;
  resources_after_json: string;
  formula_breakdown_json: string;
  warnings_json: string;
  gm_notes: string;
}

export interface OverrideLog {
  id: string;
  turn_number: number;
  entity_type: string;
  entity_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  reason: string;
  timestamp: string;
}

export interface SettlementTierRule {
  creation_gold_cost?: number;
  creation_stability_cost?: number;
  gold_per_turn: number;
  capital_extra_gold_per_turn: number;
  manpower_cap_bonus: number;
  manpower_gain_per_turn: number;
  tier_number: number;
  tier_multiplier: number;
  upkeep: {
    A?: ResourceBag;
    B?: ResourceBag;
  };
}

export interface FactoryRule {
  type: string;
  build_gold_cost: number;
  inputs_per_turn: ResourceBag;
  outputs_per_turn: ResourceBag & { gold?: number };
}

export interface PolicyOptionRule {
  name: string;
  manpower_per_turn?: number;
  gold_per_turn?: number;
  stability_per_turn?: number;
  special?: string;
}

export interface PolicyCategoryRule {
  category: string;
  abbreviation: string;
  step_cost: number | string;
  military_service_upward_peace_step_cost?: number;
  military_service_downward_step_cost?: number;
  military_service_at_war_step_cost?: number;
  can_be_forced_by_master: boolean;
  forced_cost_halved?: boolean;
  base_option: string;
  options: PolicyOptionRule[];
}

export interface RulingPartyRule {
  stability_per_turn?: number;
  stability_per_turn_at_peace?: number;
  stability_per_turn_at_war?: number;
  gold_per_turn?: number;
  stability_cap?: number;
  stability_cap_at_peace?: number;
  stability_cap_at_war?: number;
  stability_per_council_player?: number;
  minimum_players_required?: number;
  fallback_party_when_below_minimum?: string;
  fallback_stability_when_below_minimum?: number;
  notes?: string;
}

export interface StabilityBandRule {
  min: number;
  max: number;
  gold_per_turn: number;
  revolt_risk: string;
}

export interface PuppetTypeRule {
  tribute_percent: number | "custom";
  rounded_up: boolean;
  diplomacy_inherited_from_master: string | boolean;
  color_changes: string | false;
  master_permissions: string[];
}

export interface OperationRule {
  abbreviation: string;
  base_supply_tier: string;
  supply_required: number;
  overlap_allowed?: boolean;
  minimum_tank_troops?: number;
  tank_troops_allowed?: boolean;
}

export interface RulesConfig {
  resources: ResourceType[];
  settings: {
    auto_downgrade_settlements_on_missing_upkeep: boolean;
    partial_factory_production: boolean;
    partial_trade_transfer: boolean;
    apply_capital_bonus: boolean;
    base_capital_gold_per_turn: number;
    puppet_rebellion_immunity_turns: number;
    sea_transport_cost_per_unit_resource: number;
    base_manpower_cap: number;
    base_manpower_gain_per_turn: number;
    reserve_cap_multiplier: number;
    necessities_manpower_cap_divisor: number;
    necessities_met_stability_per_turn: number;
    necessities_missing_stability_per_turn: number;
  };
  settlementTiers: Record<SettlementTier, SettlementTierRule>;
  resourceProduction: Record<string, ResourceBag & { cannot_be_settled?: boolean }>;
  factoryRules: FactoryRule[];
  factoryRepair: {
    damaged_factory_repair_gold_cost: number;
    bombed_factory_repair_cost: "build_gold_cost";
    bombing_gold_cost: number;
  };
  manpowerRules: {
    normal_troop_cost_per_1000: ResourceBag & { manpower: number };
    high_quality_troop_cost_per_1000: ResourceBag & { manpower: number };
    tank_troop_cost_per_1000: ResourceBag & { manpower: number };
  };
  stabilityRules: {
    base_stability: number;
    default_stability_cap: number;
    base_stability_gain_per_turn: number;
    peace_bonus_after_turns: number;
    peace_bonus_stability_per_turn: number;
    capital_change_stability_cost: number;
    rename_settlement_stability_cost: number;
    stabilityBands: StabilityBandRule[];
  };
  rulingParties: Record<string, RulingPartyRule>;
  policyCategories: PolicyCategoryRule[];
  diplomacyRelationTypes: string[];
  puppetTypes: Record<string, PuppetTypeRule>;
  military: {
    supplyTiers: Record<string, number>;
    supply_missing_dice_modifier: number;
    overseas_movement_gold_per_1000_per_sea_tile: number;
    operations: Record<string, OperationRule>;
  };
  dice: {
    resultBands: Array<{ min: number; max: number; category: string }>;
    attackTerrainNormal: Record<string, number | "impassable">;
    attackTerrainTank: Record<string, number | "impassable">;
    expansionTerrain: Record<string, number>;
    encirclement: Record<string, number>;
    fortifications: Record<string, number>;
  };
}

export interface GraphPosition {
  x: number;
  y: number;
}

export interface GameState {
  schemaVersion: number;
  turnNumber: number;
  rules: RulesConfig;
  countries: Country[];
  settlements: Settlement[];
  factories: Factory[];
  stockpiles: ResourceStockpile[];
  policies: PolicySelection[];
  diplomacy: DiplomaticRelation[];
  puppets: PuppetRelation[];
  trades: TradeRoute[];
  operations: MilitaryOperation[];
  diceRolls: DiceRollLog[];
  turnLogs: TurnLog[];
  overrides: OverrideLog[];
  graphPositions: Record<string, GraphPosition>;
}

export interface CountryPreview {
  countryId: string;
  countryName: string;
  goldBefore: number;
  goldAfter: number;
  goldDelta: number;
  grossGoldIncome: number;
  expenses: number;
  stabilityBefore: number;
  stabilityAfter: number;
  stabilityDelta: number;
  manpowerBefore: number;
  manpowerAfter: number;
  manpowerGain: number;
  manpowerCapBefore: number;
  manpowerCapAfter: number;
  reserveCap: number;
  resourcesBefore: ResourceBag;
  resourcesAfter: ResourceBag;
  resourceDelta: ResourceBag;
  resourceProduction: ResourceBag;
  factoryInputs: ResourceBag;
  factoryOutputs: ResourceBag;
  settlementUpkeep: ResourceBag;
  tradeIn: ResourceBag;
  tradeOut: ResourceBag;
  bankGold: number;
  settlementGold: number;
  capitalGold: number;
  policyGold: number;
  rulingPartyGold: number;
  stabilityBandGold: number;
  tradeGoldNet: number;
  puppetTributePaid: number;
  puppetTributeReceived: number;
  necessitiesRequired: number;
  necessitiesProduced: number;
  necessitiesMet: boolean;
  stabilityCap: number;
  formulaBreakdown: Record<string, unknown>;
  warnings: string[];
}

export interface TurnPreview {
  turnNumber: number;
  nextTurnNumber: number;
  countries: CountryPreview[];
  globalWarnings: string[];
}
