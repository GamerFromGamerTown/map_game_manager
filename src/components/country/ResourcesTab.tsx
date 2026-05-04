import { Country, GameState, OverrideLog, RESOURCE_TYPES, ResourceType, TurnPreview } from "../../types";
import { createId, stockpileForCountry } from "../../engine/calculations";
import { asNumber, formatSigned } from "../../ui/fields";

export function ResourcesTab({
  state,
  country,
  preview,
  patchState
}: {
  state: GameState;
  country: Country;
  preview?: TurnPreview["countries"][number];
  patchState: (updater: (current: GameState) => GameState) => void;
}) {
  const stockpile = stockpileForCountry(state, country.id);

  const setResourceAmount = (resource: ResourceType, amount: number) => {
    const before = stockpile[resource] ?? 0;
    const override: OverrideLog = {
      id: createId("override"),
      turn_number: state.turnNumber,
      entity_type: "ResourceStockpile",
      entity_id: country.id,
      field_name: resource,
      old_value: String(before),
      new_value: String(amount),
      reason: "Resource stockpile edit",
      timestamp: new Date().toISOString()
    };

    patchState((current) => {
      const exists = current.stockpiles.some((row) => row.country_id === country.id && row.resource_type === resource);
      const countryPatch: Partial<Country> = {};
      if (resource === "equipment") countryPatch.equipment = amount;
      if (resource === "high_quality_equipment") countryPatch.high_quality_equipment = amount;
      if (resource === "tanks") countryPatch.tanks = amount;
      if (resource === "supply") countryPatch.supply = amount;

      return {
        ...current,
        stockpiles: exists
          ? current.stockpiles.map((row) =>
              row.country_id === country.id && row.resource_type === resource ? { ...row, amount } : row
            )
          : [...current.stockpiles, { country_id: country.id, resource_type: resource, amount }],
        countries: current.countries.map((item) => (item.id === country.id ? { ...item, ...countryPatch } : item)),
        overrides: [override, ...current.overrides]
      };
    });
  };

  return (
    <div className="table-wrap">
      <table className="country-data-table dense-table resource-table sticky-first-column">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Current</th>
            <th>Produced</th>
            <th>Consumed</th>
            <th>Trade in</th>
            <th>Trade out</th>
            <th>Projected</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {RESOURCE_TYPES.map((resource) => {
            const delta = Number(preview?.resourceDelta[resource] ?? 0);
            const produced =
              Number(preview?.resourceProduction[resource] ?? 0) + Number(preview?.factoryOutputs[resource] ?? 0);
            const consumed =
              Number(preview?.factoryInputs[resource] ?? 0) + Number(preview?.settlementUpkeep[resource] ?? 0);
            return (
              <tr key={resource} id={`resource-row-${country.id}-${resource}`}>
                <td>{resource}</td>
                <td>
                  <input
                    id={`resource-${country.id}-${resource}`}
                    type="number"
                    defaultValue={stockpile[resource] ?? 0}
                    onBlur={(event) => setResourceAmount(resource, asNumber(event.target.value))}
                  />
                </td>
                <td className="numeric good">{produced ? formatSigned(produced) : "0"}</td>
                <td className="numeric bad">{consumed ? formatSigned(-consumed) : "0"}</td>
                <td className="numeric good">{Number(preview?.tradeIn[resource] ?? 0) || 0}</td>
                <td className="numeric bad">{Number(preview?.tradeOut[resource] ?? 0) || 0}</td>
                <td className="numeric">{Math.round(Number(preview?.resourcesAfter[resource] ?? stockpile[resource] ?? 0))}</td>
                <td className={delta < 0 ? "numeric bad" : delta > 0 ? "numeric good" : "numeric"}>{formatSigned(delta)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

