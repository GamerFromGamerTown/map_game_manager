import type { Factory, ResourceBag, ResourceType, SettlementTier, TradableType } from "../types";

export type StatSheetIssueSeverity = "warning" | "error";

export interface StatSheetIssue {
  severity: StatSheetIssueSeverity;
  message: string;
  suggestedFix: string;
  countryName?: string;
  threadId?: string;
  lineNumber?: number;
  sourceLine?: string;
}

export interface StatSheetReport {
  warnings: StatSheetIssue[];
  errors: StatSheetIssue[];
}

export interface ParsedStatSheetCountry {
  name: string;
  short_name?: string;
  aliases?: string[];
  ruling_party?: string;
  gold?: number;
  stability?: number;
  manpower?: number;
  manpower_cap?: number;
  reserve?: number;
  equipment?: number;
  high_quality_equipment?: number;
  tanks?: number;
  supply?: number;
}

export interface ParsedStatSheetSettlement {
  name: string;
  tier: SettlementTier;
  is_capital: boolean;
  biome_or_resource_type: string;
  upkeep_option?: "A" | "B";
  notes?: string;
}

export interface ParsedStatSheetFactory {
  type: string;
  active?: boolean;
  damaged?: boolean;
  bombed?: boolean;
  notes?: string;
}

export interface ParsedStatSheetPolicy {
  policy_category: string;
  selected_option: string;
}

export interface ParsedStatSheetRelation {
  relation_type: string;
  counterpart_name: string;
  lineNumber?: number;
  sourceLine?: string;
}

export interface ParsedStatSheetTrade {
  direction: "import" | "export";
  counterpart_name: string;
  resource_type: TradableType;
  amount_per_turn: number;
  notes?: string;
  lineNumber?: number;
  sourceLine?: string;
}

export interface ParsedStatSheet {
  country: ParsedStatSheetCountry;
  settlements: ParsedStatSheetSettlement[];
  factories: ParsedStatSheetFactory[];
  stockpiles: ResourceBag;
  policies: ParsedStatSheetPolicy[];
  diplomacy: ParsedStatSheetRelation[];
  trades: ParsedStatSheetTrade[];
  rawText: string;
  threadId?: string;
  messageId?: string;
}

export interface StatSheetBundleSource {
  generatedAt: string;
  threads: Array<{
    threadId: string;
    url?: string;
    messageCount?: number;
  }>;
}

export interface StatSheetCountryAlias {
  country_name: string;
  aliases: string[];
}

export interface StatSheetImportBundle {
  kind: "gm-stat-sheet-import";
  version: 1;
  source: StatSheetBundleSource;
  countryAliases?: StatSheetCountryAlias[];
  sheets: ParsedStatSheet[];
  report: StatSheetReport;
}

export interface StatSheetTextSource {
  content: string;
  threadId?: string;
  messageId?: string;
  threadName?: string;
  url?: string;
  messageCount?: number;
}

export interface StatSheetImportResult {
  applied: boolean;
  state: import("../types").GameState;
  report: StatSheetReport;
}

export const parsedResourceTypes = [
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
] satisfies ResourceType[];

export type ParsedFactorySeed = Pick<Factory, "type" | "active" | "damaged" | "bombed" | "notes">;
