import { ResourceBag } from "../types";
import { resourceLabel } from "../utils/labels";

export function ResourceBagView({ bag, empty = "None" }: { bag?: ResourceBag | Record<string, number>; empty?: string }) {
  const entries = Object.entries(bag ?? {}).filter(([, value]) => Number(value) !== 0);
  if (entries.length === 0) return <span className="quiet">{empty}</span>;

  return (
    <div className="resource-chips">
      {entries.map(([resource, value]) => (
        <span className="resource-chip" key={resource}>
          {resourceLabel(resource)}: {Number(value)}
        </span>
      ))}
    </div>
  );
}
