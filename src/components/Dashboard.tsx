import { AlertTriangle } from "lucide-react";
import { GameState, TurnPreview } from "../types";
import { formatSigned } from "../ui/fields";

export function Dashboard({
  state,
  preview,
  onOpenCountry
}: {
  state: GameState;
  preview: TurnPreview;
  onOpenCountry: (id: string) => void;
}) {
  const previewById = new Map(preview.countries.map((item) => [item.countryId, item]));

  return (
    <div className="page-grid">
      <section className="panel full">
        <div className="panel-title">
          <h2>Countries</h2>
          <span>{state.countries.length} records</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Gold</th>
                <th>Projected Income</th>
                <th>Stability</th>
                <th>Projected Stability</th>
                <th>Manpower</th>
                <th>Cap</th>
                <th>Reserve</th>
                <th>Necessities</th>
                <th>Wars</th>
                <th>Puppet</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {state.countries.map((country) => {
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
                    <td>
                      <span className="swatch" style={{ background: country.color }} />
                      {country.name}
                    </td>
                    <td>{Math.round(country.gold)}</td>
                    <td className={item && item.goldDelta < 0 ? "bad" : "good"}>
                      {item ? formatSigned(item.goldDelta) : "0"}
                    </td>
                    <td>{Math.round(country.stability)}</td>
                    <td className={item && item.stabilityDelta < 0 ? "bad" : "good"}>
                      {item ? formatSigned(item.stabilityDelta) : "0"}
                    </td>
                    <td>{Math.round(country.manpower)}</td>
                    <td>{Math.round(item?.manpowerCapAfter ?? country.manpower_cap)}</td>
                    <td>
                      {Math.round(country.reserve)} / {Math.round(item?.reserveCap ?? country.manpower_cap * 2)}
                    </td>
                    <td>
                      {item?.necessitiesProduced ?? 0} / {item?.necessitiesRequired ?? 0}
                    </td>
                    <td>{wars}</td>
                    <td>
                      {puppet ? (puppet.master_country_id === country.id ? "Master" : "Puppet") : "None"}
                    </td>
                    <td>{item?.warnings.length ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Turn Preview</h2>
          <span>Next turn {preview.nextTurnNumber}</span>
        </div>
        {preview.countries.map((item) => (
          <details key={item.countryId} open={item.warnings.length > 0}>
            <summary>
              {item.countryName}: {formatSigned(item.goldDelta)} gold, {formatSigned(item.stabilityDelta)} stability
            </summary>
            <BreakdownList value={item.formulaBreakdown} />
          </details>
        ))}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Warnings</h2>
          <AlertTriangle size={18} />
        </div>
        <WarningList preview={preview} />
      </section>
    </div>
  );
}

function BreakdownList({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return <span>{String(value ?? "")}</span>;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <p className="quiet">No formula details.</p>;

  return (
    <dl className="breakdown-list">
      {entries.map(([key, entry]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            {entry && typeof entry === "object" ? (
              <BreakdownList value={entry} />
            ) : (
              <span>{String(entry ?? "")}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function WarningList({ preview }: { preview: TurnPreview }) {
  const warnings = [
    ...preview.globalWarnings.map((warning) => ({ key: `global-${warning}`, text: warning })),
    ...preview.countries.flatMap((country) =>
      country.warnings.map((warning) => ({
        key: `${country.countryId}-${warning}`,
        text: `${country.countryName}: ${warning}`
      }))
    )
  ];

  if (warnings.length === 0) return <p className="quiet">No warnings.</p>;

  return (
    <ul className="warning-list">
      {warnings.map((warning) => (
        <li key={warning.key}>{warning.text}</li>
      ))}
    </ul>
  );
}
