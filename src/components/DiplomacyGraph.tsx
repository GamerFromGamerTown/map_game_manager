import { PointerEvent, useMemo, useRef, useState } from "react";
import { Country, DiplomaticRelation, GameState } from "../types";
import { CheckboxField, SelectField, TextField } from "../ui/fields";

const pairKey = (a: string, b: string) => [a, b].sort().join("::");

const relationAbbreviation = (type: string) =>
  type
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();

export function DiplomacyGraph({
  state,
  patchState,
  openCountry
}: {
  state: GameState;
  patchState: (updater: (current: GameState) => GameState) => void;
  openCountry: (id: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const relation = state.diplomacy.find((item) => item.id === selectedRelation);
  const activeRelations = state.diplomacy.filter((edge) => edge.active);
  const relationIndexes = useMemo(() => {
    const groups = new Map<string, string[]>();
    activeRelations.forEach((edge) => {
      const key = pairKey(edge.country_a_id, edge.country_b_id);
      groups.set(key, [...(groups.get(key) ?? []), edge.id]);
    });
    return new Map(
      Array.from(groups.values()).flatMap((ids) => ids.map((id, index) => [id, index - (ids.length - 1) / 2]))
    );
  }, [activeRelations]);

  const positionFor = (country: Country) => state.graphPositions[country.id] ?? { x: 160, y: 160 };
  const pointerPosition = (event: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * 900,
      y: ((event.clientY - rect.top) / rect.height) * 560
    };
  };

  const updateRelation = (patch: Partial<DiplomaticRelation>) => {
    if (!relation) return;
    patchState((current) => ({
      ...current,
      diplomacy: current.diplomacy.map((item) => (item.id === relation.id ? { ...item, ...patch } : item))
    }));
  };

  return (
    <section className="panel full graph-panel">
      <svg
        ref={svgRef}
        viewBox="0 0 900 560"
        onPointerMove={(event) => {
          if (!dragging) return;
          const point = pointerPosition(event);
          patchState((current) => ({
            ...current,
            graphPositions: { ...current.graphPositions, [dragging]: point }
          }));
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {activeRelations.map((edge) => {
          const a = state.countries.find((country) => country.id === edge.country_a_id);
          const b = state.countries.find((country) => country.id === edge.country_b_id);
          if (!a || !b) return null;
          const pa = positionFor(a);
          const pb = positionFor(b);
          const index = relationIndexes.get(edge.id) ?? 0;
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const nx = -dy / length;
          const ny = dx / length;
          const offset = index * 36;
          const cx = (pa.x + pb.x) / 2 + nx * offset;
          const cy = (pa.y + pb.y) / 2 + ny * offset;
          const path = `M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`;
          const selected = selectedRelation === edge.id;

          return (
            <g
              key={edge.id}
              onClick={() => setSelectedRelation(edge.id)}
              className={`edge ${selected ? "selected" : ""} edge-${edge.relation_type.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <path d={path} />
              <g transform={`translate(${cx}, ${cy})`} className="edge-label">
                <rect x="-31" y="-12" width="62" height="24" rx="6" />
                <text>{relationAbbreviation(edge.relation_type)}</text>
                <title>{edge.relation_type}</title>
              </g>
            </g>
          );
        })}
        {state.countries.map((country) => {
          const point = positionFor(country);
          return (
            <g
              key={country.id}
              className="node"
              transform={`translate(${point.x}, ${point.y})`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(country.id);
              }}
              onDoubleClick={() => openCountry(country.id)}
            >
              <circle r="28" fill={country.color} />
              <text y="48">{country.name}</text>
            </g>
          );
        })}
      </svg>
      {relation && (
        <div className="graph-editor">
          <SelectField
            label="Relation"
            value={relation.relation_type}
            options={state.rules.diplomacyRelationTypes}
            onChange={(relation_type) => updateRelation({ relation_type })}
          />
          <CheckboxField label="Active" checked={relation.active} onChange={(active) => updateRelation({ active })} />
          <TextField label="Notes" value={relation.notes} onChange={(notes) => updateRelation({ notes })} />
        </div>
      )}
    </section>
  );
}
