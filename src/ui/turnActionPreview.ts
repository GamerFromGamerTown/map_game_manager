import {
  CountryPreview,
  DiceRollLog,
  DiplomaticRelation,
  Factory,
  GameState,
  MilitaryOperation,
  PuppetRelation,
  RESOURCE_TYPES,
  ResourceBag,
  ResourceType,
  Settlement,
  TradeRoute,
  TurnPreview,
  TurnTrackedEntity
} from "../types";
import { settlementProductionForCountry } from "../engine/calculations";
import { countryName } from "../utils/names";
import { labelFromKey, resourceLabel, routeTypeLabel } from "../utils/labels";

export interface TurnActionCard {
  id: string;
  countryId?: string;
  countryName?: string;
  title: string;
  details: string[];
}

export interface TurnActionSection {
  id: string;
  title: string;
  totalCount: number;
  showCountryLabels: boolean;
  cards: TurnActionCard[];
}

export interface ActiveEffectsSummary {
  openByDefault: false;
  warningCount: number;
  cards: Array<{
    id: string;
    title: string;
    details: string[];
  }>;
}

export interface TurnActionPreviewModel {
  activeEffects: ActiveEffectsSummary;
  sections: TurnActionSection[];
}

type CountMap = Map<string, number>;

const plural = (count: number, singular: string, pluralLabel = `${singular}s`): string =>
  `${formatNumber(count)} ${count === 1 ? singular : pluralLabel}`;

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });

const formatSignedNumber = (value: number): string => `${value > 0 ? "+" : ""}${formatNumber(value)}`;

const increment = (counts: CountMap, key: string, amount = 1) => {
  counts.set(key, (counts.get(key) ?? 0) + amount);
};

const addBagToCounts = (counts: CountMap, bag: ResourceBag | undefined, multiplier = 1) => {
  Object.entries(bag ?? {}).forEach(([resource, amount]) => {
    const numeric = Number(amount ?? 0) * multiplier;
    if (numeric !== 0) increment(counts, resource, numeric);
  });
};

const addBag = (target: ResourceBag, bag: ResourceBag | undefined, multiplier = 1) => {
  Object.entries(bag ?? {}).forEach(([resource, amount]) => {
    const numeric = Number(amount ?? 0) * multiplier;
    if (numeric !== 0) {
      target[resource as ResourceType] = Number(target[resource as ResourceType] ?? 0) + numeric;
    }
  });
};

const formatCounts = (counts: CountMap, label: (key: string) => string = labelFromKey): string =>
  Array.from(counts.entries())
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => label(a).localeCompare(label(b)))
    .map(([key, amount]) => `${label(key)} x${formatNumber(amount)}`)
    .join(", ");

const formatBag = (bag: ResourceBag, signed = false): string => {
  const keys = Array.from(new Set([...RESOURCE_TYPES, ...Object.keys(bag)]));
  const parts = keys.filter((resource) => Number(bag[resource as ResourceType] ?? 0) !== 0).map((resource) => {
    const amount = Number(bag[resource as ResourceType] ?? 0);
    return `${resourceLabel(resource)} ${signed ? formatSignedNumber(amount) : `x${formatNumber(amount)}`}`;
  });
  return parts.length ? parts.join(", ") : "No changes";
};

const fieldsLine = (entity: TurnTrackedEntity): string => {
  const fields = entity.updated_fields?.filter(Boolean) ?? [];
  return fields.length ? `Fields: ${fields.map(labelFromKey).join(", ")}` : "Fields changed this turn";
};

const isCreatedThisTurn = (entity: TurnTrackedEntity, turnNumber: number): boolean => entity.created_turn === turnNumber;

const isUpdatedThisTurn = (entity: TurnTrackedEntity, turnNumber: number): boolean =>
  entity.updated_turn === turnNumber && entity.created_turn !== turnNumber;

const groupByCountry = <T extends { country_id: string }>(items: T[]): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => grouped.set(item.country_id, [...(grouped.get(item.country_id) ?? []), item]));
  return grouped;
};

const makeSection = (id: string, title: string, cards: TurnActionCard[]): TurnActionSection | null => {
  if (cards.length === 0) return null;
  const countryIds = new Set(cards.map((card) => card.countryId).filter(Boolean));
  return {
    id,
    title,
    totalCount: cards.length,
    showCountryLabels: countryIds.size > 1,
    cards
  };
};

const terrainForRoll = (roll: DiceRollLog): string => {
  try {
    const modifiers = JSON.parse(roll.modifiers_json) as { attacker?: { terrain?: unknown } };
    return typeof modifiers.attacker?.terrain === "string" ? modifiers.attacker.terrain : "unknown";
  } catch {
    return "unknown";
  }
};

const expansionCostForRoll = (state: GameState, roll: DiceRollLog): number => {
  try {
    const modifiers = JSON.parse(roll.modifiers_json) as { attacker?: { expansionGoldCost?: unknown } };
    const cost = Number(modifiers.attacker?.expansionGoldCost);
    return Number.isFinite(cost) ? cost : state.rules.dice.expansion_roll_gold_cost;
  } catch {
    return state.rules.dice.expansion_roll_gold_cost;
  }
};

const buildExpansionSection = (state: GameState): TurnActionSection | null => {
  const rollsByCountry = new Map<string, DiceRollLog[]>();
  state.diceRolls
    .filter((roll) => roll.turn_number === state.turnNumber && roll.roll_type === "expansion")
    .forEach((roll) => rollsByCountry.set(roll.country_id, [...(rollsByCountry.get(roll.country_id) ?? []), roll]));

  const cards = Array.from(rollsByCountry.entries()).map(([countryId, rolls]) => {
    const terrainCounts: CountMap = new Map();
    const resultCounts: CountMap = new Map();
    rolls.forEach((roll) => {
      increment(terrainCounts, terrainForRoll(roll));
      increment(resultCounts, roll.result_category);
    });
    const cost = rolls.reduce((sum, roll) => sum + expansionCostForRoll(state, roll), 0);

    return {
      id: `expansion-${countryId}`,
      countryId,
      countryName: countryName(state, countryId),
      title: `Expanded ${formatNumber(rolls.length)} ${rolls.length === 1 ? "time" : "times"}`,
      details: [
        `Terrain: ${formatCounts(terrainCounts)}`,
        `Results: ${formatCounts(resultCounts)}`,
        `Cost: ${formatNumber(cost)} Gold`
      ]
    };
  });

  return makeSection("expansion", "Expansion", cards);
};

const settlementOutputKey = (state: GameState, settlement: Settlement): string => {
  const produced = settlementProductionForCountry(state, settlement);
  const resources = Object.entries(produced).filter(([, amount]) => Number(amount ?? 0) !== 0);
  if (resources.length === 0) return "none";
  if (resources.length === 1) return resources[0][0];
  return resources.map(([resource]) => resourceLabel(resource)).join(" + ");
};

const buildSettlementSection = (state: GameState): TurnActionSection | null => {
  const cards: TurnActionCard[] = [];
  const created = state.settlements.filter((settlement) => isCreatedThisTurn(settlement, state.turnNumber));
  groupByCountry(created).forEach((settlements, countryId) => {
    const tierCounts: CountMap = new Map();
    const outputCounts: CountMap = new Map();
    const capitalCount = settlements.filter((settlement) => settlement.is_capital).length;
    settlements.forEach((settlement) => {
      increment(tierCounts, settlement.tier);
      increment(outputCounts, settlementOutputKey(state, settlement));
    });

    cards.push({
      id: `settlements-created-${countryId}`,
      countryId,
      countryName: countryName(state, countryId),
      title: `Created ${plural(settlements.length, "settlement")}`,
      details: [
        `Tier mix: ${formatCounts(tierCounts)}`,
        `Output mix: ${formatCounts(outputCounts, (key) => (key === "none" ? "No Output" : resourceLabel(key)))}`,
        `Capital: ${capitalCount ? formatNumber(capitalCount) : "none"}`
      ]
    });
  });

  const edited = state.settlements.filter((settlement) => isUpdatedThisTurn(settlement, state.turnNumber));
  groupByCountry(edited).forEach((settlements, countryId) => {
    cards.push({
      id: `settlements-edited-${countryId}`,
      countryId,
      countryName: countryName(state, countryId),
      title: `Edited ${plural(settlements.length, "settlement")}`,
      details: [fieldsLine({ updated_fields: Array.from(new Set(settlements.flatMap((item) => item.updated_fields ?? []))) })]
    });
  });

  return makeSection("settlements", "Settlements", cards);
};

const factoryRuleFor = (state: GameState, factory: Factory) =>
  state.rules.factoryRules.find((rule) => rule.type === factory.type);

const buildFactorySection = (state: GameState): TurnActionSection | null => {
  const cards: TurnActionCard[] = [];
  const created = state.factories.filter((factory) => isCreatedThisTurn(factory, state.turnNumber));
  groupByCountry(created).forEach((factories, countryId) => {
    const typeCounts: CountMap = new Map();
    const outputs: ResourceBag = {};
    const inputs: ResourceBag = {};
    let activeCount = 0;
    let damagedOrBombedCount = 0;
    factories.forEach((factory) => {
      increment(typeCounts, factory.type);
      if (factory.active) activeCount += 1;
      if (factory.damaged || factory.bombed) damagedOrBombedCount += 1;
      const rule = factoryRuleFor(state, factory);
      addBag(inputs, rule?.inputs_per_turn);
      addBag(outputs, rule?.outputs_per_turn);
    });

    cards.push({
      id: `factories-created-${countryId}`,
      countryId,
      countryName: countryName(state, countryId),
      title: `Built ${plural(factories.length, "factory", "factories")}`,
      details: [
        `Type mix: ${formatCounts(typeCounts, (key) => key)}`,
        `Outputs: ${formatBag(outputs)}`,
        `Inputs: ${formatBag(inputs)}`,
        `Active: ${formatNumber(activeCount)}; damaged/bombed: ${formatNumber(damagedOrBombedCount)}`
      ]
    });
  });

  const edited = state.factories.filter((factory) => isUpdatedThisTurn(factory, state.turnNumber));
  groupByCountry(edited).forEach((factories, countryId) => {
    cards.push({
      id: `factories-edited-${countryId}`,
      countryId,
      countryName: countryName(state, countryId),
      title: `Edited ${plural(factories.length, "factory", "factories")}`,
      details: [fieldsLine({ updated_fields: Array.from(new Set(factories.flatMap((item) => item.updated_fields ?? []))) })]
    });
  });

  return makeSection("factories", "Factories", cards);
};

const buildPolicySection = (state: GameState): TurnActionSection | null => {
  const grouped = new Map<string, typeof state.policies>();
  state.policies
    .filter((policy) => policy.last_changed_turn === state.turnNumber)
    .forEach((policy) => grouped.set(policy.country_id, [...(grouped.get(policy.country_id) ?? []), policy]));

  const cards = Array.from(grouped.entries()).map(([countryId, policies]) => ({
    id: `policies-${countryId}`,
    countryId,
    countryName: countryName(state, countryId),
    title: `Changed ${plural(policies.length, "policy", "policies")}`,
    details: policies.map((policy) => `${policy.policy_category} -> ${policy.selected_option}`)
  }));

  return makeSection("policies", "Policies", cards);
};

const tradeDetails = (state: GameState, trade: TradeRoute): string[] => [
  `${countryName(state, trade.sender_country_id)} -> ${countryName(state, trade.receiver_country_id)}`,
  `${resourceLabel(trade.resource_type)} x${formatNumber(Number(trade.amount_per_turn || 0))}`,
  `${formatNumber(Number(trade.payment_gold_per_turn ?? 0))} Gold payment`,
  `Route: ${routeTypeLabel(trade.route_type)}`,
  `Flags: ${trade.active ? "active" : "inactive"}, ${trade.route_valid ? "valid" : "invalid"}, ${trade.blocked_by_embargo ? "blocked" : "clear"}`
];

const buildTradeSection = (state: GameState): TurnActionSection | null => {
  const createdCards = state.trades
    .filter((trade) => isCreatedThisTurn(trade, state.turnNumber))
    .map((trade) => ({
      id: `trade-created-${trade.id}`,
      countryId: trade.sender_country_id,
      countryName: countryName(state, trade.sender_country_id),
      title: "Added trade route",
      details: tradeDetails(state, trade)
    }));
  const editedCards = state.trades
    .filter((trade) => isUpdatedThisTurn(trade, state.turnNumber))
    .map((trade) => ({
      id: `trade-edited-${trade.id}`,
      countryId: trade.sender_country_id,
      countryName: countryName(state, trade.sender_country_id),
      title: "Edited trade route",
      details: [...tradeDetails(state, trade), fieldsLine(trade)]
    }));

  return makeSection("trade", "Trade", [...createdCards, ...editedCards]);
};

const relationDetails = (state: GameState, relation: DiplomaticRelation): string[] => [
  `${countryName(state, relation.country_a_id)} <-> ${countryName(state, relation.country_b_id)}`,
  `Type: ${relation.relation_type}`,
  `Status: ${relation.active ? "active" : "inactive"}`
];

const puppetDetails = (state: GameState, puppet: PuppetRelation): string[] => [
  `${countryName(state, puppet.master_country_id)} over ${countryName(state, puppet.puppet_country_id)}`,
  `Type: ${puppet.puppet_type}`,
  `Tribute: ${formatNumber(Number(puppet.tribute_percent || 0))}%`,
  `Immunity: ${formatNumber(Number(puppet.rebellion_immunity_turns_remaining || 0))} turns`,
  `Status: ${puppet.active ? "active" : "inactive"}`
];

const buildDiplomacySection = (state: GameState): TurnActionSection | null => {
  const relationCards = state.diplomacy
    .filter((relation) => isCreatedThisTurn(relation, state.turnNumber) || isUpdatedThisTurn(relation, state.turnNumber))
    .map((relation) => ({
      id: `diplomacy-${relation.id}`,
      countryId: relation.country_a_id,
      countryName: countryName(state, relation.country_a_id),
      title: `${isCreatedThisTurn(relation, state.turnNumber) ? "Added" : "Edited"} relation`,
      details: isUpdatedThisTurn(relation, state.turnNumber)
        ? [...relationDetails(state, relation), fieldsLine(relation)]
        : relationDetails(state, relation)
    }));
  const puppetCards = state.puppets
    .filter((puppet) => isCreatedThisTurn(puppet, state.turnNumber) || isUpdatedThisTurn(puppet, state.turnNumber))
    .map((puppet) => ({
      id: `puppet-${puppet.id}`,
      countryId: puppet.master_country_id,
      countryName: countryName(state, puppet.master_country_id),
      title: `${isCreatedThisTurn(puppet, state.turnNumber) ? "Added" : "Edited"} puppet relation`,
      details: isUpdatedThisTurn(puppet, state.turnNumber)
        ? [...puppetDetails(state, puppet), fieldsLine(puppet)]
        : puppetDetails(state, puppet)
    }));

  return makeSection("diplomacy", "Diplomacy and Puppets", [...relationCards, ...puppetCards]);
};

const troopLine = (operation: MilitaryOperation): string => {
  const parts = [
    `Normal ${formatNumber(Number(operation.troops_normal || 0))}`,
    `High Quality ${formatNumber(Number(operation.troops_high_quality || 0))}`,
    `Tanks ${formatNumber(Number(operation.troops_tank || 0))}`
  ];
  return `Troops: ${parts.join(", ")}`;
};

const operationDetails = (state: GameState, operation: MilitaryOperation): string[] => [
  operation.operation_type,
  `${countryName(state, operation.attacker_country_id)} -> ${countryName(state, operation.defender_country_id)}`,
  troopLine(operation),
  `Supply ${formatNumber(Number(operation.supply_allocated || 0))}/${formatNumber(Number(operation.supply_required || 0))}`,
  `Status: ${operation.status}`
];

const buildMilitarySection = (state: GameState): TurnActionSection | null => {
  const cards = state.operations
    .filter((operation) => isCreatedThisTurn(operation, state.turnNumber) || isUpdatedThisTurn(operation, state.turnNumber))
    .map((operation) => ({
      id: `operation-${operation.id}`,
      countryId: operation.attacker_country_id,
      countryName: countryName(state, operation.attacker_country_id),
      title: `${isCreatedThisTurn(operation, state.turnNumber) ? "Added" : "Edited"} ${operation.name}`,
      details: isUpdatedThisTurn(operation, state.turnNumber)
        ? [...operationDetails(state, operation), fieldsLine(operation)]
        : operationDetails(state, operation)
    }));

  return makeSection("military", "Military", cards);
};

const aggregateCountryBag = (preview: TurnPreview, select: (country: CountryPreview) => ResourceBag): ResourceBag => {
  const total: ResourceBag = {};
  preview.countries.forEach((country) => addBag(total, select(country)));
  return total;
};

const buildActiveEffects = (preview: TurnPreview): ActiveEffectsSummary => {
  const warnings = preview.globalWarnings.length + preview.countries.reduce((sum, country) => sum + country.warnings.length, 0);
  const goldDetails = preview.countries
    .filter((country) => country.goldDelta !== 0)
    .map((country) => `${country.countryName}: ${formatSignedNumber(country.goldDelta)} Gold`);
  const necessityDetails = preview.countries.map((country) =>
    `${country.countryName}: ${country.necessitiesMet ? "met" : "missing"} ${formatNumber(country.necessitiesProduced)}/${formatNumber(country.necessitiesRequired)}`
  );

  return {
    openByDefault: false,
    warningCount: warnings,
    cards: [
      {
        id: "gold",
        title: "Gold",
        details: goldDetails.length ? goldDetails : ["No gold changes"]
      },
      {
        id: "resources",
        title: "Resource balance",
        details: [`Net: ${formatBag(aggregateCountryBag(preview, (country) => country.resourceDelta), true)}`]
      },
      {
        id: "factory-flow",
        title: "Factory flow",
        details: [
          `Inputs: ${formatBag(aggregateCountryBag(preview, (country) => country.factoryInputs))}`,
          `Outputs: ${formatBag(aggregateCountryBag(preview, (country) => country.factoryOutputs))}`
        ]
      },
      {
        id: "settlement-flow",
        title: "Settlement flow",
        details: [
          `Production: ${formatBag(aggregateCountryBag(preview, (country) => country.resourceProduction))}`,
          `Upkeep: ${formatBag(aggregateCountryBag(preview, (country) => country.settlementUpkeep))}`
        ]
      },
      {
        id: "trade-flow",
        title: "Trade flow",
        details: [
          `In: ${formatBag(aggregateCountryBag(preview, (country) => country.tradeIn))}`,
          `Out: ${formatBag(aggregateCountryBag(preview, (country) => country.tradeOut))}`
        ]
      },
      {
        id: "necessities",
        title: "Necessities",
        details: necessityDetails
      }
    ]
  };
};

export const buildTurnActionPreview = (state: GameState, preview: TurnPreview): TurnActionPreviewModel => {
  const sections = [
    buildExpansionSection(state),
    buildSettlementSection(state),
    buildFactorySection(state),
    buildPolicySection(state),
    buildTradeSection(state),
    buildDiplomacySection(state),
    buildMilitarySection(state)
  ].filter((section): section is TurnActionSection => Boolean(section));

  return {
    activeEffects: buildActiveEffects(preview),
    sections
  };
};
