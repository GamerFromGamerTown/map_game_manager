import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Info, LocateFixed } from "lucide-react";
import { GameState } from "../types";
import { NormalizedWarning, sortWarnings, WarningSeverity } from "../ui/warningModel";

const severityLabels: Record<WarningSeverity, string> = {
  error: "Blocker",
  warning: "Warning",
  info: "Info"
};

export function WarningQueue({
  warnings,
  state,
  onOpenWarning,
  compact = false
}: {
  warnings: NormalizedWarning[];
  state: GameState;
  onOpenWarning: (warning: NormalizedWarning) => void;
  compact?: boolean;
}) {
  const [severity, setSeverity] = useState<"all" | WarningSeverity>("all");
  const [countryId, setCountryId] = useState("all");
  const [type, setType] = useState("all");
  const types = useMemo(() => Array.from(new Set(warnings.map((warning) => warning.entityType))).sort(), [warnings]);
  const filtered = sortWarnings(
    warnings.filter(
      (warning) =>
        (severity === "all" || warning.severity === severity) &&
        (countryId === "all" || warning.countryId === countryId) &&
        (type === "all" || warning.entityType === type)
    )
  );

  if (warnings.length === 0) return <p className="quiet">No active warnings.</p>;

  return (
    <div className={compact ? "warning-queue compact" : "warning-queue"}>
      {!compact && (
        <div className="warning-filters" aria-label="Warning filters">
          <label>
            <span>Severity</span>
            <select value={severity} onChange={(event) => setSeverity(event.target.value as "all" | WarningSeverity)}>
              <option value="all">All severities</option>
              <option value="error">Blockers</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label>
            <span>Country</span>
            <select value={countryId} onChange={(event) => setCountryId(event.target.value)}>
              <option value="all">All countries</option>
              {state.countries.map((country) => (
                <option value={country.id} key={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">All types</option>
              {types.map((warningType) => (
                <option value={warningType} key={warningType}>
                  {warningType}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <ul className="warning-list actionable-warning-list" aria-label="Actionable warnings">
        {filtered.map((warning) => (
          <li className={`severity-${warning.severity}`} key={warning.id}>
            <button className="warning-action" onClick={() => onOpenWarning(warning)}>
              <span className="warning-icon" aria-hidden="true">
                {warning.severity === "error" ? (
                  <AlertCircle size={17} />
                ) : warning.severity === "warning" ? (
                  <AlertTriangle size={17} />
                ) : (
                  <Info size={17} />
                )}
              </span>
              <span className="warning-copy">
                <span className="warning-meta">
                  <strong>{severityLabels[warning.severity]}</strong>
                  <span>{warning.countryName ?? "Global"}</span>
                  <span>{warning.entityType}</span>
                </span>
                <span className="warning-message">{warning.message}</span>
                <span className="warning-recommendation">{warning.recommendedAction}</span>
              </span>
              <span className="warning-target">
                <LocateFixed size={15} />
                {warning.target.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

