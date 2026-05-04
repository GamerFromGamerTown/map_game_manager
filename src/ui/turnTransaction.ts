import { GameState, RESOURCE_TYPES, ResourceType, TurnPreview } from "../types";
import { NormalizedWarning, normalizePreviewWarnings } from "./warningModel";

export interface CountryDeltaRow {
  countryId: string;
  countryName: string;
  goldBefore: number;
  goldAfter: number;
  goldDelta: number;
  stabilityBefore: number;
  stabilityAfter: number;
  stabilityDelta: number;
  manpowerBefore: number;
  manpowerAfter: number;
  manpowerDelta: number;
}

export interface ResourceDeltaRow {
  countryId: string;
  countryName: string;
  resource: ResourceType;
  before: number;
  after: number;
  delta: number;
}

export interface TurnTransactionSummary {
  turnNumber: number;
  nextTurnNumber: number;
  countryDeltas: CountryDeltaRow[];
  resourceDeltas: ResourceDeltaRow[];
  warnings: NormalizedWarning[];
  unresolvedBlockers: NormalizedWarning[];
  warningsIntroduced: NormalizedWarning[];
  warningsResolved: string[];
  canCommit: boolean;
  commitBlockReason: string;
  overrideReason: string;
}

const latestLoggedWarnings = (state: GameState): Set<string> => {
  const latestTurn = Math.max(0, ...state.turnLogs.map((log) => log.turn_number));
  const warnings = new Set<string>();
  state.turnLogs
    .filter((log) => log.turn_number === latestTurn)
    .forEach((log) => {
      try {
        const parsed = JSON.parse(log.warnings_json) as unknown;
        if (Array.isArray(parsed)) {
          parsed.forEach((warning) => {
            if (typeof warning === "string") warnings.add(warning);
          });
        }
      } catch {
        if (log.warnings_json.trim()) warnings.add(log.warnings_json);
      }
    });
  return warnings;
};

export const buildTurnTransactionSummary = (
  state: GameState,
  preview: TurnPreview,
  overrideReason: string
): TurnTransactionSummary => {
  const warnings = normalizePreviewWarnings(state, preview);
  const unresolvedBlockers = warnings.filter((warning) => warning.severity === "error");
  const previousWarnings = latestLoggedWarnings(state);
  const currentWarningSources = new Set(warnings.map((warning) => warning.sourceMessage));
  const warningsIntroduced = warnings.filter((warning) => !previousWarnings.has(warning.sourceMessage));
  const warningsResolved = Array.from(previousWarnings).filter((warning) => !currentWarningSources.has(warning));
  const trimmedOverrideReason = overrideReason.trim();

  const countryDeltas: CountryDeltaRow[] = preview.countries.map((country) => ({
    countryId: country.countryId,
    countryName: country.countryName,
    goldBefore: country.goldBefore,
    goldAfter: country.goldAfter,
    goldDelta: country.goldDelta,
    stabilityBefore: country.stabilityBefore,
    stabilityAfter: country.stabilityAfter,
    stabilityDelta: country.stabilityDelta,
    manpowerBefore: country.manpowerBefore,
    manpowerAfter: country.manpowerAfter,
    manpowerDelta: country.manpowerAfter - country.manpowerBefore
  }));

  const resourceDeltas: ResourceDeltaRow[] = preview.countries.flatMap((country) =>
    RESOURCE_TYPES.flatMap((resource) => {
      const delta = Number(country.resourceDelta[resource] ?? 0);
      if (delta === 0) return [];
      return [
        {
          countryId: country.countryId,
          countryName: country.countryName,
          resource,
          before: Number(country.resourcesBefore[resource] ?? 0),
          after: Number(country.resourcesAfter[resource] ?? 0),
          delta
        }
      ];
    })
  );

  const canCommit = unresolvedBlockers.length === 0 || trimmedOverrideReason.length > 0;

  return {
    turnNumber: preview.turnNumber,
    nextTurnNumber: preview.nextTurnNumber,
    countryDeltas,
    resourceDeltas,
    warnings,
    unresolvedBlockers,
    warningsIntroduced,
    warningsResolved,
    canCommit,
    commitBlockReason: canCommit ? "" : "Severe warnings require an override reason before commit.",
    overrideReason: trimmedOverrideReason
  };
};

