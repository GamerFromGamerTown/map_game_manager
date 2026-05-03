import {
  Country,
  Factory,
  GameState,
  PolicySelection,
  RESOURCE_TYPES,
  ResourceBag,
  ResourceStockpile,
  Settlement,
  SettlementTier,
  TradeRoute
} from "../types";
import { defaultRules } from "../rules/defaultRules";

const basePolicies: Array<[string, string]> = [
  ["Population Growth", "No Policy"],
  ["Market Type", "Mixed Market"],
  ["Immigration Laws", "Strict Citizenship"],
  ["Economical Focus", "Agricultural"],
  ["Living Conditions", "Low Regulations"],
  ["Healthcare", "Nationally Owned But Not Paid For"],
  ["Business Scale", "Mixed Focus"],
  ["Segregation", "Illegal"],
  ["Welfare", "No Welfare"],
  ["Protest Rights", "Regulated"],
  ["Judicial Rights", "State Run"],
  ["Worker's Rights", "No Rights"],
  ["Military Service", "Volunteer Army"],
  ["Infrastructure", "Private Investment"],
  ["Education", "Nationally Owned But Not Paid For"],
  ["Press Rights", "Regulated"]
];

const colors: Record<string, string> = {
  explo: "#c7443e",
  gaymer: "#d15bb0",
  pick: "#b38a38",
  magnus: "#3673d8",
  panguelle: "#5f6673",
  ed: "#4c8fbd",
  grisly: "#7d5aa6",
  elf: "#48a868",
  dew: "#3b9f9f"
};

const stockpileRows = (countryId: string, values: Partial<Record<string, number>>): ResourceStockpile[] =>
  RESOURCE_TYPES.map((resource_type) => ({
    country_id: countryId,
    resource_type,
    amount: values[resource_type] ?? 0
  }));

const policyRows = (countryId: string, overrides: Record<string, string> = {}): PolicySelection[] =>
  basePolicies.map(([policy_category, selected_option]) => ({
    country_id: countryId,
    policy_category,
    selected_option: overrides[policy_category] ?? selected_option,
    last_changed_turn: -1
  }));

const resourceOverride = (resource: string, amount: number): ResourceBag => {
  const mapped = resource === "gold" ? "gold_ore" : resource.toLowerCase();
  return { [mapped]: amount } as ResourceBag;
};

const biomeFor = (resource: string): string => {
  const mapped = resource.toLowerCase();
  if (mapped === "food") return "plains";
  if (mapped === "wood") return "forest";
  if (mapped === "gold") return "gold_ore";
  return `${mapped}_ore`;
};

const makeSettlement = (
  countryId: string,
  index: number,
  name: string,
  tier: SettlementTier,
  resource: string,
  amount: number,
  isCapital = false
): Settlement => ({
  id: `${countryId}-town-${index}`,
  country_id: countryId,
  name,
  tier,
  is_capital: isCapital,
  biome_or_resource_type: biomeFor(resource),
  manual_resource_override: resourceOverride(resource, amount),
  upkeep_option: "A",
  occupied_by_country_id: null,
  damaged: false,
  bombed: false,
  connected_for_upkeep: true,
  notes: ""
});

const makeFactory = (countryId: string, index: number, type: string): Factory => ({
  id: `${countryId}-factory-${index}`,
  country_id: countryId,
  type,
  active: true,
  damaged: false,
  bombed: false,
  notes: ""
});

const makeCountry = (
  id: string,
  name: string,
  rulingParty: string,
  gold: number,
  stability: number,
  manpower: number,
  manpowerCap: number,
  reserve: number,
  equipment = 0
): Country => ({
  id,
  name,
  color: colors[id] ?? "#64748b",
  is_player_country: true,
  ruling_party: rulingParty,
  gold,
  stability,
  manpower,
  manpower_cap: manpowerCap,
  manual_manpower_cap_override: null,
  reserve,
  equipment,
  high_quality_equipment: 0,
  tanks: 0,
  supply: 0,
  current_turn_created: 0,
  at_war: false,
  peace_turns_count: 0,
  notes: ""
});

const countryData = [
  ["explo", "Terria Rosia", "Monarchy", 6000, 71, 18000, 64000, 0, 0],
  ["gaymer", "Federation of Gaymers", "Monarchy", 6000, 71, 18000, 64000, 0, 0],
  ["pick", "The Crowned Lands of Dalkina", "Monarchy", 3500, 46, 15000, 76000, 0, 0],
  ["magnus", "Blueland", "Democratic", 50000, 100, 13000, 46000, 0, 0],
  ["panguelle", "Velkovaris Directorate", "Authoritarian", 20000, 55, 0, 64000, 20000, 0],
  ["ed", "Second Odradian Republic", "Democratic", 15000, 100, 24000, 58000, 0, 0],
  ["grisly", "The New Eruyios Empire", "Authoritarian", 18500, 93, 9000, 50000, 0, 0],
  ["elf", "Shukea", "Democratic", 10500, 80, 41000, 98000, 0, 20],
  ["dew", "United Kingdom of Pristanekdrzave", "Monarchy", 5000, 36, 18000, 76000, 0, 0]
] as const;

const settlements: Settlement[] = [
  ...[
    ["Daria", "wood", 1],
    ["Marsia", "coal", 1],
    ["Saint-Marsia", "coal", 1],
    ["Mark", "coal", 1],
    ["Saint Mark", "coal", 1],
    ["Moras", "iron", 1, true],
    ["Rasio", "iron", 1],
    ["Dorsia", "iron", 1],
    ["Saint-Darsia", "iron", 1],
    ["St-Rasio", "gold", 1],
    ["Andria", "gold", 1],
    ["Sikvia", "gold", 1]
  ].map((row, index) => makeSettlement("explo", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  ...[
    ["Daria", "wood", 1],
    ["Marsia", "coal", 1],
    ["Saint-Marsia", "coal", 1],
    ["Mark", "coal", 1],
    ["Saint Mark", "coal", 1],
    ["Moras", "iron", 1, true],
    ["Rasio", "iron", 1],
    ["Dorsia", "iron", 1],
    ["Saint-Darsia", "iron", 1],
    ["St-Rasio", "gold", 1],
    ["Andria", "gold", 1],
    ["Sikvia", "gold", 1]
  ].map((row, index) => makeSettlement("gaymer", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  ...[
    ["Calvin", "food", 2],
    ["Florla", "food", 2],
    ["Vince", "food", 2],
    ["Queens", "food", 2],
    ["Grilke", "coal", 1],
    ["Reed", "coal", 1],
    ["Moriha", "iron", 1, true],
    ["TuckTown", "bauxite", 1],
    ["Prairie", "bauxite", 1],
    ["Huttuh", "bauxite", 1],
    ["Vintage", "bauxite", 1],
    ["Colugo", "bauxite", 1],
    ["Stavill", "bauxite", 1],
    ["Shiftmill", "bauxite", 1],
    ["Grassroot", "gold", 1]
  ].map((row, index) => makeSettlement("pick", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  ...[
    ["Redland Hills", "food", 2, true],
    ["Kolipakastean", "coal", 1],
    ["Mashwedisa", "copper", 1]
  ].map((row, index) => makeSettlement("magnus", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  ...[
    ["DreadVormis", "coal", 1],
    ["Wutheringers", "coal", 1],
    ["Ocs Volkavis", "coal", 1],
    ["La-Mancharand", "coal", 1],
    ["Beringerg", "coal", 1],
    ["Lagetan", "coal", 1],
    ["Roseston", "coal", 1],
    ["Virex hollow", "iron", 1],
    ["Noctryss Vale", "iron", 1],
    ["Obsidian Reach", "iron", 1],
    ["Solkaris Pire", "gold", 1, true],
    ["Sperentia", "gold", 1]
  ].map((row, index) => makeSettlement("panguelle", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  ...[
    ["Deux-Rivierre", "food", 2],
    ["Guiovre", "wood", 1],
    ["Moselle", "coal", 1],
    ["Pereire", "coal", 1],
    ["Constantin", "iron", 1, true],
    ["Sint-Avertin", "iron", 1],
    ["Fessenheim", "iron", 1],
    ["Raccoon City", "iron", 1],
    ["Oleste", "copper", 1]
  ].map((row, index) => makeSettlement("ed", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  ...[
    ["Veinlands", "food", 2],
    ["DustPlague", "coal", 1],
    ["Earthforge", "iron", 1],
    ["Combpa", "copper", 1],
    ["Erympus", "gold", 1, true]
  ].map((row, index) => makeSettlement("grisly", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  makeSettlement("elf", 1, "Drumdorf", "city", "gold", 2, true),
  ...[
    ["Erlberg", "food", 2],
    ["Hirschrevier", "food", 2],
    ["Bumshausen", "coal", 1],
    ["Grünheim", "coal", 1],
    ["Turmberg", "coal", 1],
    ["Ducking", "coal", 1],
    ["Dinhausen", "coal", 1],
    ["Viehberg", "coal", 1],
    ["Hirschrevier", "coal", 1],
    ["Kohldorf", "coal", 1],
    ["Kuhheim", "iron", 1],
    ["Baumkirchen", "iron", 1],
    ["Vugging", "bauxite", 1],
    ["Beirdorf", "gold", 1]
  ].map((row, index) => makeSettlement("elf", index + 2, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3]))),
  ...[
    ["Grenvile", "food", 2],
    ["Victovilla", "food", 2],
    ["Latuque", "food", 2],
    ["Sept-Ile", "wood", 1],
    ["Saint-Mont", "wood", 1],
    ["Villana", "wood", 1],
    ["Saint-Village", "wood", 1],
    ["Saint-Aste", "wood", 1],
    ["Idefixovilla", "coal", 1],
    ["Saint-Juxta", "coal", 1],
    ["Moulin-Tourneville", "coal", 1],
    ["Samtanek", "coal", 1],
    ["Dewland", "coal", 1, true],
    ["Ferville", "iron", 1],
    ["Ferron", "iron", 1],
    ["Louisberg", "iron", 1],
    ["Mackenberg", "iron", 1]
  ].map((row, index) => makeSettlement("dew", index + 1, row[0] as string, "village", row[1] as string, row[2] as number, Boolean(row[3])))
];

const factories: Factory[] = [
  ...["Harbour", "Gold Factory", "Fine Machinery Factory", "Large Equipment Factory"].map((type, index) => makeFactory("explo", index + 1, type)),
  ...["Harbour", "Gold Factory", "Fine Machinery Factory", "Large Equipment Factory"].map((type, index) => makeFactory("gaymer", index + 1, type)),
  makeFactory("pick", 1, "Harbour"),
  ...["Gold Factory", "Gold Factory", "Luxuries Factory", "Fine Machinery Factory", "Large Equipment Factory"].map((type, index) => makeFactory("panguelle", index + 1, type)),
  ...["Sawmill", "Electronics Factory", "Copper Parts Factory"].map((type, index) => makeFactory("ed", index + 1, type)),
  makeFactory("grisly", 1, "Harbour"),
  ...[
    "Gold Factory",
    "Gold Factory",
    "Gold Factory",
    "Bank",
    "Luxuries Factory",
    "Harbour",
    "Bauxite Smeltery",
    "Aluminium Parts Factory",
    "Fine Machinery Factory",
    "Large Equipment Factory"
  ].map((type, index) => makeFactory("elf", index + 1, type)),
  ...["Iron Parts Factory", "Iron Parts Factory", "Gold Factory", "Luxuries Factory"].map((type, index) => makeFactory("dew", index + 1, type))
];

const stockpiles = [
  ...stockpileRows("explo", { food: 2, coal: 4, iron: 6, gold_ore: 2 }),
  ...stockpileRows("gaymer", { food: 2, coal: 4, iron: 6, gold_ore: 2 }),
  ...stockpileRows("pick", { food: 12, coal: 2, iron: 2, bauxite: 5, gold_ore: 2 }),
  ...stockpileRows("magnus", { food: 4, coal: 2, copper: 2 }),
  ...stockpileRows("panguelle", { iron: 4, gold_ore: 1 }),
  ...stockpileRows("ed", { food: 4, iron: 8 }),
  ...stockpileRows("grisly", { food: 3, coal: 1, iron: 1, copper: 1 }),
  ...stockpileRows("elf", { food: 2, coal: 3, iron: 2, bauxite: 1, equipment: 20 }),
  ...stockpileRows("dew", { food: 12, wood: 10, coal: 10, iron: 2 })
];

const trades: TradeRoute[] = [
  makeTrade("dew", "explo", "coal", 1, "sea", 500, "receiver"),
  makeTrade("explo", "dew", "gold_ore", 1, "sea", 0, "sender"),
  makeTrade("dew", "pick", "coal", 1, "sea", 500, "receiver"),
  makeTrade("dew", "pick", "iron", 1, "sea", 500, "receiver"),
  makeTrade("dew", "pick", "gold", 3000, "sea", 0, "sender"),
  makeTrade("pick", "dew", "bauxite", 3, "sea", 0, "sender")
];

function makeTrade(
  sender: string,
  receiver: string,
  resource: TradeRoute["resource_type"],
  amount: number,
  routeType: TradeRoute["route_type"],
  seaCost: number,
  payer: "sender" | "receiver"
): TradeRoute {
  return {
    id: `trade-${sender}-${receiver}-${resource}`,
    sender_country_id: sender,
    receiver_country_id: receiver,
    resource_type: resource,
    amount_per_turn: amount,
    payment_gold_per_turn: 0,
    recurring: true,
    route_type: routeType,
    sea_transport_cost_per_unit: seaCost,
    sea_cost_payer: payer,
    route_valid: true,
    blocked_by_embargo: false,
    active: true,
    notes: ""
  };
}

const relationSpecs = [
  ["Non-Aggression Pact", "explo", "gaymer"],
  ["Non-Aggression Pact", "panguelle", "elf"],
  ["Guarantee", "panguelle", "ed"],
  ["Guarantee", "panguelle", "pick"],
  ["Guarantee", "panguelle", "gaymer"],
  ["Defensive Pact", "grisly", "elf"],
  ["Non-Aggression Pact", "grisly", "elf"],
  ["Guarantee", "grisly", "elf"],
  ["Defensive Pact", "elf", "gaymer"],
  ["Non-Aggression Pact", "elf", "gaymer"],
  ["Guarantee", "elf", "gaymer"],
  ["Military Alliance", "dew", "elf"],
  ["Military Alliance", "dew", "explo"],
  ["Economic Alliance", "dew", "elf"],
  ["Economic Alliance", "dew", "explo"]
] as const;

export const createSeedState = (): GameState => ({
  schemaVersion: 2,
  turnNumber: 3,
  rules: {
    ...structuredClone(defaultRules),
    factoryRules: [
      { type: "Harbour", build_gold_cost: 0, inputs_per_turn: {}, outputs_per_turn: { food: 1 } },
      ...structuredClone(defaultRules.factoryRules)
    ]
  },
  countries: countryData.map((row) =>
    makeCountry(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8])
  ),
  settlements,
  factories,
  stockpiles,
  policies: [
    ...countryData.flatMap((row) =>
      policyRows(row[0], {
        ...(row[0] === "panguelle" ? { "Living Conditions": "Fully Privatised", "Judicial Rights": "Corrupt" } : {}),
        ...(row[0] === "elf" ? { Education: "Partially Privately Owned" } : {})
      })
    )
  ],
  diplomacy: relationSpecs.map(([relation_type, country_a_id, country_b_id]) => ({
    id: `relation-${relation_type.toLowerCase().replace(/\s+/g, "-")}-${country_a_id}-${country_b_id}`,
    relation_type,
    country_a_id,
    country_b_id,
    active: true,
    notes: ""
  })),
  puppets: [],
  trades,
  operations: [],
  diceRolls: [],
  turnLogs: [],
  overrides: [],
  graphPositions: Object.fromEntries(
    countryData.map((row, index) => [
      row[0],
      { x: 140 + (index % 3) * 260, y: 140 + Math.floor(index / 3) * 180 }
    ])
  )
});
