import { RESOURCE_TYPES, ResourceBag } from "../types";

export function ResourceBagView({ bag, empty = "None" }: { bag?: ResourceBag | Record<string, number>; empty?: string }) {
  const entries = Object.entries(bag ?? {}).filter(([, value]) => Number(value) !== 0);
  if (entries.length === 0) return <span className="quiet">{empty}</span>;

  return (
    <div className="resource-chips">
      {entries.map(([resource, value]) => (
        <span className="resource-chip" key={resource}>
          {resource}: {Number(value)}
        </span>
      ))}
    </div>
  );
}

export function ResourceBagEditor({
  bag,
  onChange,
  compact = false
}: {
  bag: ResourceBag;
  onChange: (bag: ResourceBag) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "resource-editor compact" : "resource-editor"}>
      {RESOURCE_TYPES.map((resource) => (
        <label key={resource}>
          <span>{resource}</span>
          <input
            type="number"
            value={Number(bag[resource] ?? 0)}
            onChange={(event) => onChange({ ...bag, [resource]: Number(event.target.value || 0) })}
          />
        </label>
      ))}
    </div>
  );
}
