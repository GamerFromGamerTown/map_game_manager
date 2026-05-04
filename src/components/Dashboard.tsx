import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { GameState, TurnPreview } from "../types";
import { formatSigned } from "../ui/fields";
import { NormalizedWarning } from "../ui/warningModel";
import { TurnTransactionSummary } from "../ui/turnTransaction";
import { WarningQueue } from "./WarningQueue";
import { TurnPreviewDiff } from "./TurnPreviewDiff";

export function Dashboard({
  state,
  preview,
  warnings,
  transactionSummary,
  onOpenWarning,
  onOpenCountry
}: {
  state: GameState;
  preview: TurnPreview;
  warnings: NormalizedWarning[];
  transactionSummary: TurnTransactionSummary;
  onOpenWarning: (warning: NormalizedWarning) => void;
  onOpenCountry: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<"name" | "gold" | "income" | "stability" | "warnings">("warnings");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const previewById = new Map(preview.countries.map((item) => [item.countryId, item]));
  const countriesAtRisk = preview.countries.filter(
    (country) => country.stabilityAfter < 30 || country.goldAfter < 0 || !country.necessitiesMet
  ).length;
  const totalProjectedGold = preview.countries.reduce((sum, country) => sum + country.goldAfter, 0);
  const totalProjectedManpower = preview.countries.reduce((sum, country) => sum + country.manpowerAfter, 0);
  const sortedCountries = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;
    return state.countries.slice().sort((a, b) => {
      const previewA = previewById.get(a.id);
      const previewB = previewById.get(b.id);
      const warningA = warnings.filter((warning) => warning.countryId === a.id).length;
      const warningB = warnings.filter((warning) => warning.countryId === b.id).length;
      if (sortKey === "name") return a.name.localeCompare(b.name) * direction;
      if (sortKey === "gold") return ((previewA?.goldAfter ?? a.gold) - (previewB?.goldAfter ?? b.gold)) * direction;
      if (sortKey === "income") return ((previewA?.goldDelta ?? 0) - (previewB?.goldDelta ?? 0)) * direction;
      if (sortKey === "stability") {
        return ((previewA?.stabilityAfter ?? a.stability) - (previewB?.stabilityAfter ?? b.stability)) * direction;
      }
      return (warningA - warningB) * direction || a.name.localeCompare(b.name);
    });
  }, [previewById, sortDir, sortKey, state.countries, warnings]);

  const sortBy = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  return (
    <div className="dashboard-workspace">
      <section className="kpi-strip" aria-label="Turn triage metrics">
        <MetricCard label="Current turn" value={String(state.turnNumber)} />
        <MetricCard label="Active warnings" value={String(warnings.length)} />
        <MetricCard label="Projected gold" value={String(Math.round(totalProjectedGold))} />
        <MetricCard label="Projected manpower" value={String(Math.round(totalProjectedManpower))} />
        <MetricCard label="Countries at risk" value={String(countriesAtRisk)} tone={countriesAtRisk > 0 ? "warn" : "good"} />
        <MetricCard
          label="Unresolved blockers"
          value={String(transactionSummary.unresolvedBlockers.length)}
          tone={transactionSummary.unresolvedBlockers.length > 0 ? "bad" : "good"}
        />
      </section>

      <section className="panel full warnings-panel">
        <div className="panel-title">
          <div>
            <h2 id="dashboard-warnings-title">Warnings action queue</h2>
            <p className="quiet">Click a warning to open the country tab, rule section, or row that can fix it.</p>
          </div>
          <AlertTriangle size={18} />
        </div>
        <WarningQueue warnings={warnings} state={state} onOpenWarning={onOpenWarning} />
      </section>

      <section className="panel full">
        <div className="panel-title">
          <h2>Country summary</h2>
          <span>{state.countries.length} records</span>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table data-table sticky-first-column">
            <thead>
              <tr>
                <th><button className="table-sort" onClick={() => sortBy("name")}>Name</button></th>
                <th><button className="table-sort" onClick={() => sortBy("gold")}>Gold</button></th>
                <th><button className="table-sort" onClick={() => sortBy("income")}>Income</button></th>
                <th>Stability</th>
                <th>Next stability</th>
                <th>Manpower</th>
                <th>Cap</th>
                <th>Reserve</th>
                <th>Necessities</th>
                <th>Wars</th>
                <th>Puppet</th>
                <th><button className="table-sort" onClick={() => sortBy("warnings")}>Warnings</button></th>
              </tr>
            </thead>
            <tbody>
              {sortedCountries.map((country) => {
                const item = previewById.get(country.id);
                const wars = state.diplomacy.filter(
                  (relation) =>
                    relation.active &&
                    relation.relation_type === "War" &&
                    (relation.country_a_id === country.id || relation.country_b_id === country.id)
                ).length;
                const puppet = state.puppets.find(
                  (relation) =>
                    relation.active &&
                    (relation.master_country_id === country.id || relation.puppet_country_id === country.id)
                );

                return (
                  <tr key={country.id} onClick={() => onOpenCountry(country.id)}>
                    <td className="name-cell" title={country.name}>
                      <span className="cell-with-swatch">
                        <span className="swatch" style={{ background: country.color }} />
                        <span className="truncate-label">{country.name}</span>
                      </span>
                    </td>
                    <td className="numeric">{Math.round(country.gold)}</td>
                    <td className={`numeric ${item && item.goldDelta < 0 ? "bad" : "good"}`}>
                      {item ? formatSigned(item.goldDelta) : "0"}
                    </td>
                    <td className="numeric">{Math.round(country.stability)}</td>
                    <td className={`numeric ${item && item.stabilityDelta < 0 ? "bad" : "good"}`}>
                      {item ? `${Math.round(item.stabilityAfter)} (${formatSigned(item.stabilityDelta)})` : "0"}
                    </td>
                    <td className="numeric">{Math.round(country.manpower)}</td>
                    <td className="numeric">{Math.round(item?.manpowerCapAfter ?? country.manpower_cap)}</td>
                    <td className="numeric nowrap">
                      {Math.round(country.reserve)} / {Math.round(item?.reserveCap ?? country.manpower_cap * 2)}
                    </td>
                    <td className={item?.necessitiesMet ? "numeric nowrap good" : "numeric nowrap bad"}>
                      {item?.necessitiesProduced ?? 0} / {item?.necessitiesRequired ?? 0}
                    </td>
                    <td className="numeric">{wars}</td>
                    <td>{puppet ? (puppet.master_country_id === country.id ? "Master" : "Puppet") : "None"}</td>
                    <td className="numeric">{warnings.filter((warning) => warning.countryId === country.id).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel full turn-preview-panel">
        <div className="panel-title">
          <div>
            <h2>Turn transaction preview</h2>
            <p className="quiet">Structured diff of the values that Commit Turn will persist.</p>
          </div>
          <span>Next turn {preview.nextTurnNumber}</span>
        </div>
        <TurnPreviewDiff summary={transactionSummary} state={state} onOpenWarning={onOpenWarning} />
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <div className={`metric kpi-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
