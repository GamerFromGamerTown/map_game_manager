import {
  Country,
  CountryPreview,
  GameState,
  PolicyOptionRule,
  RESOURCE_TYPES,
  ResourceBag,
  ResourceType,
  RulesConfig,
  Settlement,
  TurnLog,
  TurnPreview
} from "../types";

export const createId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const emptyBag = (): ResourceBag =>
  Object.fromEntries(RESOURCE_TYPES.map((resource) => [resource, 0])) as ResourceBag;

export const normalizeBag = (bag: ResourceBag = {}): ResourceBag => {
  const normalized = emptyBag();
  RESOURCE_TYPES.forEach((resource) => {
    normalized[resource] = Number(bag[resource] ?? 0);
  });
  return normalized;
};

const cloneBag = (bag: ResourceBag): ResourceBag => normalizeBag(bag);

const addToBag = (target: ResourceBag, resource: ResourceType, amount: number) => {
  target[resource] = Number(target[resource] ?? 0) + amount;
};

const addBag = (target: ResourceBag, source: ResourceBag, multiplier = 1) => {
  RESOURCE_TYPES.forEach((resource) => {
    const value = Number(source[resource] ?? 0);
    if (value !== 0) {
      addToBag(target, resource, value * multiplier);
    }
  });
};

const subtractBag = (target: ResourceBag, source: ResourceBag) => {
  RESOURCE_TYPES.forEach((resource) => {
    const value = Number(source[resource] ?? 0);
    if (value !== 0) {
      addToBag(target, resource, -value);
    }
  });
};

const hasResources = (stock: ResourceBag, cost: ResourceBag): boolean =>
  RESOURCE_TYPES.every((resource) => Number(stock[resource] ?? 0) >= Number(cost[resource] ?? 0));

const missingResources = (stock: ResourceBag, cost: ResourceBag): string[] =>
  RESOURCE_TYPES.filter((resource) => Number(cost[resource] ?? 0) > Number(stock[resource] ?? 0)).map(
    (resource) => `${resource} ${stock[resource] ?? 0}/${cost[resource]}`
  );

const diffBag = (after: ResourceBag, before: ResourceBag): ResourceBag => {
  const diff = emptyBag();
  RESOURCE_TYPES.forEach((resource) => {
    diff[resource] = Number(after[resource] ?? 0) - Number(before[resource] ?? 0);
  });
  return diff;
};

export const stockpileForCountry = (state: GameState, countryId: string): ResourceBag => {
  const bag = emptyBag();
  state.stockpiles
    .filter((row) => row.country_id === countryId)
    .forEach((row) => {
      bag[row.resource_type] = row.amount;
    });

  const country = state.countries.find((item) => item.id === countryId);
  if (country) {
    bag.equipment = Number(bag.equipment ?? country.equipment);
    bag.high_quality_equipment = Number(bag.high_quality_equipment ?? country.high_quality_equipment);
    bag.tanks = Number(bag.tanks ?? country.tanks);
    bag.supply = Number(bag.supply ?? country.supply);
  }

  return bag;
};

const selectedPolicyOption = (
  state: GameState,
  countryId: string,
  category: string
): PolicyOptionRule | undefined => {
  const categoryRule = state.rules.policyCategories.find((item) => item.category === category);
  const selected =
    state.policies.find((item) => item.country_id === countryId && item.policy_category === category)
      ?.selected_option ?? categoryRule?.base_option;
  return categoryRule?.options.find((option) => option.name === selected);
};

const isAgricultural = (state: GameState, countryId: string): boolean =>
  selectedPolicyOption(state, countryId, "Economical Focus")?.name === "Agricultural";

const activeWarsForCountry = (state: GameState, countryId: string): number =>
  state.diplomacy.filter(
    (relation) =>
      relation.active &&
      relation.relation_type === "War" &&
      (relation.country_a_id === countryId || relation.country_b_id === countryId)
  ).length;

const countryIsAtWar = (state: GameState, country: Country): boolean =>
  country.at_war || activeWarsForCountry(state, country.id) > 0;

const getStabilityBandGold = (rules: RulesConfig, stability: number): number =>
  rules.stabilityRules.stabilityBands.find((band) => stability >= band.min && stability <= band.max)
    ?.gold_per_turn ?? 0;

const getStabilityBandLabel = (rules: RulesConfig, stability: number): string =>
  rules.stabilityRules.stabilityBands.find((band) => stability >= band.min && stability <= band.max)
    ?.revolt_risk ?? "none";

const rulingPartyEffects = (country: Country, atWar: boolean, rules: RulesConfig) => {
  const rule = rules.rulingParties[country.ruling_party] ?? rules.rulingParties.Authoritarian;

  if (rule.minimum_players_required !== undefined || rule.stability_per_council_player !== undefined) {
    const players = country.council_player_count ?? 2;
    const minimumPlayers = rule.minimum_players_required ?? 2;
    return {
      stability: players >= minimumPlayers ? players * (rule.stability_per_council_player ?? 0) : 0,
      gold: rule.gold_per_turn ?? 0,
      cap: rule.stability_cap ?? rules.stabilityRules.default_stability_cap,
      warning:
        players < minimumPlayers
          ? `${country.ruling_party} has fewer than ${minimumPlayers} players; rules say it becomes ${rule.fallback_party_when_below_minimum ?? "another party"} at ${rule.fallback_stability_when_below_minimum ?? "configured"} stability.`
          : ""
    };
  }

  return {
    stability:
      (atWar ? rule.stability_per_turn_at_war : rule.stability_per_turn_at_peace) ??
      rule.stability_per_turn ??
      0,
    gold: rule.gold_per_turn ?? 0,
    cap:
      (atWar ? rule.stability_cap_at_war : rule.stability_cap_at_peace) ??
      rule.stability_cap ??
      rules.stabilityRules.default_stability_cap,
    warning: ""
  };
};

const settlementCanProduce = (settlement: Settlement): boolean => !settlement.damaged && !settlement.bombed;

const settlementProduction = (
  settlement: Settlement,
  state: GameState,
  agricultural: boolean
): ResourceBag => {
  const tierRule = state.rules.settlementTiers[settlement.tier];
  if (settlement.manual_resource_override) {
    return normalizeBag(settlement.manual_resource_override);
  }

  const base = state.rules.resourceProduction[settlement.biome_or_resource_type] ?? {};
  const produced = emptyBag();
  RESOURCE_TYPES.forEach((resource) => {
    const baseAmount = Number(base[resource] ?? 0);
    if (baseAmount === 0) {
      return;
    }

    const foodMultiplier = agricultural && resource === "food" ? 2 : 1;
    produced[resource] = baseAmount * tierRule.tier_multiplier * foodMultiplier;
  });
  return produced;
};

const initializePreview = (country: Country, resourcesBefore: ResourceBag): CountryPreview => ({
  countryId: country.id,
  countryName: country.name,
  goldBefore: country.gold,
  goldAfter: country.gold,
  goldDelta: 0,
  grossGoldIncome: 0,
  expenses: 0,
  stabilityBefore: country.stability,
  stabilityAfter: country.stability,
  stabilityDelta: 0,
  manpowerBefore: country.manpower,
  manpowerAfter: country.manpower,
  manpowerGain: 0,
  manpowerCapBefore: country.manpower_cap,
  manpowerCapAfter: country.manpower_cap,
  reserveCap: country.manpower_cap * 2,
  resourcesBefore,
  resourcesAfter: cloneBag(resourcesBefore),
  resourceDelta: emptyBag(),
  resourceProduction: emptyBag(),
  factoryInputs: emptyBag(),
  factoryOutputs: emptyBag(),
  settlementUpkeep: emptyBag(),
  tradeIn: emptyBag(),
  tradeOut: emptyBag(),
  bankGold: 0,
  settlementGold: 0,
  capitalGold: 0,
  policyGold: 0,
  rulingPartyGold: 0,
  stabilityBandGold: 0,
  tradeGoldNet: 0,
  puppetTributePaid: 0,
  puppetTributeReceived: 0,
  necessitiesRequired: 0,
  necessitiesProduced: 0,
  necessitiesMet: false,
  stabilityCap: 100,
  formulaBreakdown: {},
  warnings: []
});

export const previewNextTurn = (state: GameState): TurnPreview => {
  const work = new Map<
    string,
    {
      country: Country;
      resources: ResourceBag;
      preview: CountryPreview;
      policyStability: number;
      policyManpower: number;
      rulingStability: number;
      peaceStability: number;
      necessityStability: number;
      tradeGoldPositive: number;
    }
  >();

  state.countries.forEach((country) => {
    const resources = stockpileForCountry(state, country.id);
    work.set(country.id, {
      country,
      resources,
      preview: initializePreview(country, cloneBag(resources)),
      policyStability: 0,
      policyManpower: 0,
      rulingStability: 0,
      peaceStability: 0,
      necessityStability: 0,
      tradeGoldPositive: 0
    });
  });

  state.countries.forEach((country) => {
    const item = work.get(country.id);
    if (!item) return;

    const settlements = state.settlements.filter((settlement) => settlement.country_id === country.id);
    const capitalCount = settlements.filter((settlement) => settlement.is_capital).length;
    if (settlements.length >= 5 && capitalCount === 0) {
      item.preview.warnings.push("No capital selected despite having 5 or more settlements.");
    }
    if (capitalCount > 1) {
      item.preview.warnings.push("Multiple capitals are selected for this country.");
    }

    const agricultural = isAgricultural(state, country.id);
    let calculatedManpowerCap = state.rules.settings.base_manpower_cap;
    let settlementManpowerGain = 0;

    settlements.forEach((settlement) => {
      const tierRule = state.rules.settlementTiers[settlement.tier];
      calculatedManpowerCap += tierRule.manpower_cap_bonus;

      const resourceRule = state.rules.resourceProduction[settlement.biome_or_resource_type];
      if (resourceRule?.cannot_be_settled) {
        item.preview.warnings.push(`${settlement.name} uses a biome marked cannot be settled.`);
      }

      if (!settlementCanProduce(settlement)) {
        return;
      }

      item.preview.settlementGold += tierRule.gold_per_turn;
      if (settlement.is_capital && state.rules.settings.apply_capital_bonus) {
        item.preview.capitalGold +=
          state.rules.settings.base_capital_gold_per_turn + tierRule.capital_extra_gold_per_turn;
      }

      settlementManpowerGain += tierRule.manpower_gain_per_turn;
      const produced = settlementProduction(settlement, state, agricultural);
      addBag(item.resources, produced);
      addBag(item.preview.resourceProduction, produced);
    });

    if (country.turn_preview_warnings?.length) {
      item.preview.warnings.push(...country.turn_preview_warnings);
    }

    const cap = country.manual_manpower_cap_override ?? calculatedManpowerCap;
    item.preview.manpowerCapAfter = cap;
    item.preview.reserveCap = cap * state.rules.settings.reserve_cap_multiplier;
    item.preview.manpowerGain = state.rules.settings.base_manpower_gain_per_turn + settlementManpowerGain;
  });

  state.countries.forEach((country) => {
    const item = work.get(country.id);
    if (!item) return;

    state.rules.policyCategories.forEach((category) => {
      const option = selectedPolicyOption(state, country.id, category.category);
      item.preview.policyGold += option?.gold_per_turn ?? 0;
      item.policyStability += option?.stability_per_turn ?? 0;
      item.policyManpower += option?.manpower_per_turn ?? 0;
    });

    const atWar = countryIsAtWar(state, country);
    const party = rulingPartyEffects(country, atWar, state.rules);
    item.rulingStability = party.stability;
    item.preview.rulingPartyGold = party.gold;
    item.preview.stabilityCap = party.cap;
    if (party.warning) {
      item.preview.warnings.push(party.warning);
    }
    if (!atWar && country.peace_turns_count > state.rules.stabilityRules.peace_bonus_after_turns) {
      item.peaceStability = state.rules.stabilityRules.peace_bonus_stability_per_turn;
    }
    item.preview.stabilityBandGold = getStabilityBandGold(state.rules, country.stability);
  });

  state.factories.forEach((factory) => {
    const item = work.get(factory.country_id);
    if (!item) return;

    if (!factory.active) {
      return;
    }
    if (factory.damaged || factory.bombed) {
      item.preview.warnings.push(`${factory.type} is damaged or bombed and produces nothing.`);
      return;
    }

    const rule = state.rules.factoryRules.find((candidate) => candidate.type === factory.type);
    if (!rule) {
      item.preview.warnings.push(`Factory type "${factory.type}" is missing from rules.`);
      return;
    }

    if (!hasResources(item.resources, rule.inputs_per_turn)) {
      item.preview.warnings.push(
        `${factory.type} missing inputs: ${missingResources(item.resources, rule.inputs_per_turn).join(", ")}.`
      );
      return;
    }

    subtractBag(item.resources, rule.inputs_per_turn);
    addBag(item.preview.factoryInputs, rule.inputs_per_turn);

    Object.entries(rule.outputs_per_turn).forEach(([resource, amount]) => {
      if (resource === "gold") {
        item.preview.bankGold += Number(amount ?? 0);
        return;
      }
      addToBag(item.resources, resource as ResourceType, Number(amount ?? 0));
      addToBag(item.preview.factoryOutputs, resource as ResourceType, Number(amount ?? 0));
    });
  });

  state.trades.forEach((route) => {
    const sender = work.get(route.sender_country_id);
    const receiver = work.get(route.receiver_country_id);
    if (!sender || !receiver) return;

    const label = `${route.resource_type} trade ${sender.country.name} -> ${receiver.country.name}`;
    if (!route.active) {
      sender.preview.warnings.push(`Inactive trade route: ${label}.`);
      return;
    }
    if (!route.route_valid) {
      sender.preview.warnings.push(`Invalid trade route: ${label}.`);
      return;
    }
    if (route.blocked_by_embargo) {
      sender.preview.warnings.push(`Trade blocked by embargo: ${label}.`);
      receiver.preview.warnings.push(`Incoming trade blocked by embargo: ${label}.`);
      return;
    }

    let amount = Number(route.amount_per_turn || 0);
    if (route.resource_type === "gold") {
      const available = sender.country.gold + sender.preview.tradeGoldNet;
      if (available < amount) {
        if (state.rules.settings.partial_trade_transfer) {
          amount = Math.max(0, available);
        } else {
          sender.preview.warnings.push(`Sender lacks gold for trade: ${label}.`);
          return;
        }
      }
      sender.preview.tradeGoldNet -= amount;
      receiver.preview.tradeGoldNet += amount;
      receiver.tradeGoldPositive += amount;
    } else {
      const resource = route.resource_type;
      const available = Number(sender.resources[resource] ?? 0);
      if (available < amount) {
        if (state.rules.settings.partial_trade_transfer) {
          amount = Math.max(0, available);
        } else {
          sender.preview.warnings.push(`Sender lacks resource for trade: ${label} has ${available}/${amount}.`);
          return;
        }
      }

      addToBag(sender.resources, resource, -amount);
      addToBag(receiver.resources, resource, amount);
      addToBag(sender.preview.tradeOut, resource, amount);
      addToBag(receiver.preview.tradeIn, resource, amount);
    }

    const payment = Number(route.payment_gold_per_turn ?? 0);
    if (payment !== 0) {
      receiver.preview.tradeGoldNet -= payment;
      sender.preview.tradeGoldNet += payment;
      sender.tradeGoldPositive += Math.max(0, payment);
    }

    if (route.route_type === "sea") {
      const cost =
        Number(route.sea_transport_cost_per_unit || state.rules.settings.sea_transport_cost_per_unit_resource) *
        Number(route.amount_per_turn || 0);
      const payer = route.sea_cost_payer === "receiver" ? receiver : sender;
      payer.preview.tradeGoldNet -= cost;
      if (payer.country.gold + payer.preview.tradeGoldNet < 0) {
        payer.preview.warnings.push(`Sea trade unaffordable for ${label}; cost ${cost} gold.`);
      }
    }
  });

  state.settlements.forEach((settlement) => {
    const item = work.get(settlement.country_id);
    if (!item) return;
    const tierRule = state.rules.settlementTiers[settlement.tier];
    const upkeep = tierRule.upkeep[settlement.upkeep_option ?? "A"];
    if (!upkeep || Object.keys(upkeep).length === 0) {
      return;
    }

    if (!settlement.connected_for_upkeep) {
      item.preview.warnings.push(`${settlement.name} is not connected for upkeep.`);
      return;
    }

    if (!hasResources(item.resources, upkeep)) {
      item.preview.warnings.push(
        `${settlement.name} missing upkeep: ${missingResources(item.resources, upkeep).join(", ")}.`
      );
      if (state.rules.settings.auto_downgrade_settlements_on_missing_upkeep) {
        item.preview.warnings.push(`${settlement.name} would be auto-downgraded by the current rule setting.`);
      }
      return;
    }

    subtractBag(item.resources, upkeep);
    addBag(item.preview.settlementUpkeep, upkeep);
  });

  state.countries.forEach((country) => {
    const item = work.get(country.id);
    if (!item) return;

    item.preview.necessitiesRequired = Math.floor(
      item.preview.manpowerCapAfter / state.rules.settings.necessities_manpower_cap_divisor
    );
    item.preview.necessitiesProduced = Number(item.preview.factoryOutputs.necessities ?? 0);
    item.preview.necessitiesMet = Number(item.resources.necessities ?? 0) >= item.preview.necessitiesRequired;
    item.necessityStability = item.preview.necessitiesMet
      ? state.rules.settings.necessities_met_stability_per_turn
      : state.rules.settings.necessities_missing_stability_per_turn;

    if (item.preview.necessitiesRequired > 0) {
      if (item.preview.necessitiesMet) {
        addToBag(item.resources, "necessities", -item.preview.necessitiesRequired);
      } else {
        item.preview.warnings.push(
          `Necessities not met: ${item.resources.necessities ?? 0}/${item.preview.necessitiesRequired}.`
        );
      }
    }
  });

  state.countries.forEach((country) => {
    const item = work.get(country.id);
    if (!item) return;

    const positiveTrade = item.tradeGoldPositive + Math.max(0, item.preview.tradeGoldNet);
    item.preview.grossGoldIncome =
      item.preview.settlementGold +
      item.preview.capitalGold +
      item.preview.bankGold +
      Math.max(0, item.preview.policyGold) +
      Math.max(0, item.preview.rulingPartyGold) +
      Math.max(0, item.preview.stabilityBandGold) +
      positiveTrade;
  });

  state.puppets
    .filter((puppet) => puppet.active)
    .forEach((puppet) => {
      const master = work.get(puppet.master_country_id);
      const subject = work.get(puppet.puppet_country_id);
      if (!master || !subject) return;

      const tribute = Math.ceil(Math.max(0, subject.preview.grossGoldIncome) * (puppet.tribute_percent / 100));
      subject.preview.puppetTributePaid += tribute;
      master.preview.puppetTributeReceived += tribute;
      subject.preview.warnings.push(
        `Puppet tribute: ceil(${subject.preview.grossGoldIncome} * ${puppet.tribute_percent}%) = ${tribute}.`
      );
      master.preview.warnings.push(`${subject.country.name} pays ${tribute} gold puppet tribute.`);
    });

  const globalWarnings = evaluateGlobalWarnings(state);
  state.countries.forEach((country) => {
    const item = work.get(country.id);
    if (!item) return;

    const goldDelta =
      item.preview.settlementGold +
      item.preview.capitalGold +
      item.preview.bankGold +
      item.preview.policyGold +
      item.preview.rulingPartyGold +
      item.preview.stabilityBandGold +
      item.preview.tradeGoldNet -
      item.preview.puppetTributePaid +
      item.preview.puppetTributeReceived;

    item.preview.goldDelta = goldDelta;
    item.preview.goldAfter = country.gold + goldDelta;
    item.preview.expenses = Math.abs(
      Math.min(0, item.preview.policyGold) +
        Math.min(0, item.preview.rulingPartyGold) +
        Math.min(0, item.preview.stabilityBandGold) +
        Math.min(0, item.preview.tradeGoldNet) -
        item.preview.puppetTributePaid
    );

    const manpowerGain = item.preview.manpowerGain + item.policyManpower;
    item.preview.manpowerGain = manpowerGain;
    item.preview.manpowerAfter = Math.min(item.preview.manpowerCapAfter, Math.max(0, country.manpower + manpowerGain));

    const stabilityDelta =
      state.rules.stabilityRules.base_stability_gain_per_turn +
      item.policyStability +
      item.rulingStability +
      item.peaceStability +
      item.necessityStability;
    item.preview.stabilityDelta = stabilityDelta;
    item.preview.stabilityAfter = Math.max(
      0,
      Math.min(item.preview.stabilityCap, country.stability + stabilityDelta)
    );

    item.preview.resourcesAfter = cloneBag(item.resources);
    item.preview.resourceDelta = diffBag(item.preview.resourcesAfter, item.preview.resourcesBefore);

    if (item.preview.goldAfter < 0) {
      item.preview.warnings.push(`Negative gold projected: ${item.preview.goldAfter}.`);
    }
    RESOURCE_TYPES.forEach((resource) => {
      if (Number(item.preview.resourcesAfter[resource] ?? 0) < 0) {
        item.preview.warnings.push(`Negative ${resource} stockpile projected.`);
      }
    });
    if (item.preview.stabilityAfter < 30 && item.preview.stabilityAfter > 0) {
      item.preview.warnings.push(`Stability below 30; revolt risk is ${getStabilityBandLabel(state.rules, item.preview.stabilityAfter)}.`);
    }
    if (item.preview.stabilityAfter === 0) {
      item.preview.warnings.push("Stability at 0; rules apply Anarchism and double revolt risk.");
    }

    const isPuppet = state.puppets.some((puppet) => puppet.active && puppet.puppet_country_id === country.id);
    if (isPuppet && (item.preview.stabilityAfter >= 60 || item.preview.stabilityAfter <= 30)) {
      item.preview.warnings.push("Puppet eligible for rebellion by stability rule.");
    }

    state.operations
      .filter(
        (operation) =>
          operation.attacker_country_id === country.id || operation.defender_country_id === country.id
      )
      .forEach((operation) => {
        if (operation.supply_allocated < operation.supply_required) {
          item.preview.warnings.push(
            `${operation.name} has insufficient supply: ${operation.supply_allocated}/${operation.supply_required}.`
          );
        }
      });

    item.preview.formulaBreakdown = {
      gold: {
        settlementGold: item.preview.settlementGold,
        capitalGold: item.preview.capitalGold,
        policyGold: item.preview.policyGold,
        rulingPartyGold: item.preview.rulingPartyGold,
        stabilityBandGold: item.preview.stabilityBandGold,
        bankGold: item.preview.bankGold,
        tradeGoldNet: item.preview.tradeGoldNet,
        puppetTributePaid: item.preview.puppetTributePaid,
        puppetTributeReceived: item.preview.puppetTributeReceived,
        totalDelta: item.preview.goldDelta
      },
      stability: {
        base: state.rules.stabilityRules.base_stability_gain_per_turn,
        policy: item.policyStability,
        rulingParty: item.rulingStability,
        peace: item.peaceStability,
        necessities: item.necessityStability,
        cap: item.preview.stabilityCap,
        totalDelta: item.preview.stabilityDelta
      },
      manpower: {
        baseAndSettlementsBeforePolicy: item.preview.manpowerGain - item.policyManpower,
        policy: item.policyManpower,
        cap: item.preview.manpowerCapAfter,
        reserveCap: item.preview.reserveCap
      },
      necessities: {
        producedThisTurn: item.preview.necessitiesProduced,
        required: item.preview.necessitiesRequired,
        met: item.preview.necessitiesMet
      },
      resources: {
        production: item.preview.resourceProduction,
        factoryInputs: item.preview.factoryInputs,
        factoryOutputs: item.preview.factoryOutputs,
        tradeIn: item.preview.tradeIn,
        tradeOut: item.preview.tradeOut,
        settlementUpkeep: item.preview.settlementUpkeep,
        delta: item.preview.resourceDelta
      }
    };
  });

  return {
    turnNumber: state.turnNumber,
    nextTurnNumber: state.turnNumber + 1,
    countries: Array.from(work.values()).map((item) => item.preview),
    globalWarnings
  };
};

const relationPairKey = (a: string, b: string): string => [a, b].sort().join("::");

const evaluateGlobalWarnings = (state: GameState): string[] => {
  const warnings: string[] = [];
  const activeRelations = state.diplomacy.filter((relation) => relation.active);
  const wars = new Set(
    activeRelations.filter((relation) => relation.relation_type === "War").map((relation) => relationPairKey(relation.country_a_id, relation.country_b_id))
  );
  const nonAggression = activeRelations.filter((relation) => relation.relation_type === "Non-Aggression Pact");

  nonAggression.forEach((relation) => {
    if (wars.has(relationPairKey(relation.country_a_id, relation.country_b_id))) {
      warnings.push("Non-aggression pact and war exist simultaneously.");
    }
  });

  state.trades
    .filter((route) => route.active)
    .forEach((route) => {
      const embargo = activeRelations.some((relation) => {
        if (relation.relation_type !== "Embargo") return false;
        const direct =
          (relation.country_a_id === route.sender_country_id && relation.country_b_id === route.receiver_country_id) ||
          (relation.country_b_id === route.sender_country_id && relation.country_a_id === route.receiver_country_id);
        const puppetBlocked = state.puppets.some(
          (puppet) =>
            puppet.active &&
            (puppet.master_country_id === relation.country_b_id || puppet.puppet_country_id === relation.country_b_id) &&
            (route.sender_country_id === puppet.puppet_country_id || route.receiver_country_id === puppet.puppet_country_id)
        );
        return direct || puppetBlocked;
      });
      if (embargo && !route.blocked_by_embargo) {
        warnings.push(`Trade route ${route.id} appears affected by an embargo but is not marked blocked.`);
      }
    });

  activeRelations
    .filter((relation) => relation.relation_type === "War")
    .forEach((war) => {
      state.puppets
        .filter((puppet) => puppet.active)
        .forEach((puppet) => {
          if (war.country_a_id === puppet.puppet_country_id || war.country_b_id === puppet.puppet_country_id) {
            warnings.push("Declaring war on a puppet would also declare war on its master.");
          }
        });
      activeRelations
        .filter((relation) => relation.relation_type === "Military Alliance")
        .forEach((alliance) => {
          if (
            alliance.country_a_id === war.country_a_id ||
            alliance.country_b_id === war.country_a_id ||
            alliance.country_a_id === war.country_b_id ||
            alliance.country_b_id === war.country_b_id
          ) {
            warnings.push("Military alliance war chain would activate.");
          }
        });
      activeRelations
        .filter((relation) => relation.relation_type === "Defensive Pact")
        .forEach((pact) => {
          if (
            pact.country_a_id === war.country_a_id ||
            pact.country_b_id === war.country_a_id ||
            pact.country_a_id === war.country_b_id ||
            pact.country_b_id === war.country_b_id
          ) {
            warnings.push("Defensive pact may activate depending on attacker/defender direction.");
          }
        });
    });

  return Array.from(new Set(warnings));
};

export const commitTurn = (state: GameState, preview: TurnPreview, gmNotes: string): GameState => {
  preview = previewNextTurn(state);
  const previewByCountry = new Map(preview.countries.map((item) => [item.countryId, item]));
  const nextTurn = preview.nextTurnNumber;
  const allWarnings = preview.globalWarnings;

  const countries = state.countries.map((country) => {
    const item = previewByCountry.get(country.id);
    if (!item) return country;
    const atWar = countryIsAtWar(state, country);
    const resources = item.resourcesAfter;

    return {
      ...country,
      gold: item.goldAfter,
      stability: item.stabilityAfter,
      ruling_party: item.stabilityAfter === 0 ? "Anarchism" : country.ruling_party,
      manpower: item.manpowerAfter,
      manpower_cap: item.manpowerCapAfter,
      reserve: Math.min(country.reserve, item.reserveCap),
      equipment: Number(resources.equipment ?? 0),
      high_quality_equipment: Number(resources.high_quality_equipment ?? 0),
      tanks: Number(resources.tanks ?? 0),
      supply: Number(resources.supply ?? 0),
      at_war: atWar,
      peace_turns_count: atWar ? 0 : country.peace_turns_count + 1
    };
  });

  const stockpiles = countries.flatMap((country) => {
    const item = previewByCountry.get(country.id);
    const resources = item?.resourcesAfter ?? stockpileForCountry(state, country.id);
    return RESOURCE_TYPES.map((resource_type) => ({
      country_id: country.id,
      resource_type,
      amount: Number(resources[resource_type] ?? 0)
    }));
  });

  const turnLogs: TurnLog[] = [
    ...state.turnLogs,
    ...preview.countries.map((item) => ({
      id: createId("turn-log"),
      turn_number: nextTurn,
      country_id: item.countryId,
      gold_before: item.goldBefore,
      gold_after: item.goldAfter,
      stability_before: item.stabilityBefore,
      stability_after: item.stabilityAfter,
      manpower_before: item.manpowerBefore,
      manpower_after: item.manpowerAfter,
      resources_before_json: JSON.stringify(item.resourcesBefore),
      resources_after_json: JSON.stringify(item.resourcesAfter),
      formula_breakdown_json: JSON.stringify(item.formulaBreakdown),
      warnings_json: JSON.stringify([...allWarnings, ...item.warnings]),
      gm_notes: gmNotes
    }))
  ];

  return {
    ...state,
    turnNumber: nextTurn,
    countries,
    stockpiles,
    puppets: state.puppets.map((puppet) => ({
      ...puppet,
      rebellion_immunity_turns_remaining: Math.max(0, puppet.rebellion_immunity_turns_remaining - 1)
    })),
    turnLogs
  };
};

export const diceResultCategory = (rules: RulesConfig, finalScore: number): string =>
  rules.dice.resultBands.find((band) => finalScore >= band.min && finalScore <= band.max)?.category ??
  "unclassified";
