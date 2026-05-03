import { Country, GameState, OverrideLog, RESOURCE_TYPES, ResourceType } from "../../types";
import { createId, stockpileForCountry } from "../../engine/calculations";
import { asNumber } from "../../ui/fields";

export function ResourcesTab({
  state,
  country,
  patchState
}: {
  state: GameState;
  country: Country;
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
    <div className="resource-grid">
      {RESOURCE_TYPES.map((resource) => (
        <label key={resource}>
          <span>{resource}</span>
          <input
            type="number"
            defaultValue={stockpile[resource] ?? 0}
            onBlur={(event) => setResourceAmount(resource, asNumber(event.target.value))}
          />
        </label>
      ))}
    </div>
  );
}
