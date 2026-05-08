import { NormalizedWarning } from "../ui/warningModel";
import { formatSigned } from "../ui/fields";
import { TurnTransactionSummary } from "../ui/turnTransaction";
import { WarningQueue } from "./WarningQueue";
import { GameState } from "../types";
import { resourceLabel } from "../utils/labels";

export function TurnPreviewDiff({
  summary,
  state,
  onOpenWarning
}: {
  summary: TurnTransactionSummary;
  state: GameState;
  onOpenWarning: (warning: NormalizedWarning) => void;
}) {
  const topResourceDeltas = summary.resourceDeltas
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 24);

  return (
    <div className="transaction-review">
      <div className="transaction-kpis">
        <div className="metric">
          <span>Reviewing</span>
          <strong>
            Turn {summary.turnNumber} {"->"} {summary.nextTurnNumber}
          </strong>
        </div>
        <div className="metric danger-metric">
          <span>Unresolved blockers</span>
          <strong>{summary.unresolvedBlockers.length}</strong>
        </div>
        <div className="metric">
          <span>Warnings introduced</span>
          <strong>{summary.warningsIntroduced.length}</strong>
        </div>
        <div className="metric">
          <span>Warnings resolved</span>
          <strong>{summary.warningsResolved.length}</strong>
        </div>
      </div>

      {summary.unresolvedBlockers.length > 0 && (
        <section className="validation-summary" role="alert">
          <h3>Commit blockers</h3>
          <p>{summary.commitBlockReason || "Severe warnings are present. Review each blocker before committing."}</p>
          <WarningQueue warnings={summary.unresolvedBlockers} state={state} onOpenWarning={onOpenWarning} compact />
        </section>
      )}

      <section className="review-section">
        <div className="section-heading">
          <h2>Country totals</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table transaction-table sticky-first-column">
            <thead>
              <tr>
                <th>Country</th>
                <th>Gold</th>
                <th>Stability</th>
                <th>Manpower</th>
              </tr>
            </thead>
            <tbody>
              {summary.countryDeltas.map((row) => (
                <tr key={row.countryId}>
                  <td className="name-cell" title={row.countryName}>
                    {row.countryName}
                  </td>
                  <td className={row.goldDelta < 0 ? "numeric bad" : "numeric good"}>
                    {Math.round(row.goldBefore)} {"->"} {Math.round(row.goldAfter)} ({formatSigned(row.goldDelta)})
                  </td>
                  <td className={row.stabilityDelta < 0 ? "numeric bad" : "numeric good"}>
                    {Math.round(row.stabilityBefore)} {"->"} {Math.round(row.stabilityAfter)} ({formatSigned(row.stabilityDelta)})
                  </td>
                  <td className={row.manpowerDelta < 0 ? "numeric bad" : "numeric good"}>
                    {Math.round(row.manpowerBefore)} {"->"} {Math.round(row.manpowerAfter)} ({formatSigned(row.manpowerDelta)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="review-section">
        <div className="section-heading">
          <h2>Resource totals</h2>
        </div>
        {topResourceDeltas.length === 0 ? (
          <p className="quiet">No resource stockpile changes.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table transaction-table sticky-first-column">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Resource</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {topResourceDeltas.map((row) => (
                  <tr key={`${row.countryId}-${row.resource}`}>
                    <td title={row.countryName}>{row.countryName}</td>
                    <td>{resourceLabel(row.resource)}</td>
                    <td className="numeric">{Math.round(row.before)}</td>
                    <td className="numeric">{Math.round(row.after)}</td>
                    <td className={row.delta < 0 ? "numeric bad" : "numeric good"}>{formatSigned(row.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="review-section">
        <div className="section-heading">
          <h2>Warning movement</h2>
        </div>
        <div className="warning-movement-grid">
          <div>
            <h3>Introduced or still unresolved</h3>
            <WarningQueue warnings={summary.warningsIntroduced} state={state} onOpenWarning={onOpenWarning} compact />
          </div>
          <div>
            <h3>Resolved since last commit</h3>
            {summary.warningsResolved.length === 0 ? (
              <p className="quiet">No prior warnings were resolved.</p>
            ) : (
              <ul className="resolved-warning-list">
                {summary.warningsResolved.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
