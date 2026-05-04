import { EyeOff, Network } from "lucide-react";
import { PointerEvent, useMemo, useRef, useState } from "react";
import { Country, DiplomaticRelation, GameState } from "../types";
import { CheckboxField, SelectField, TextField } from "../ui/fields";

const pairKey = (a: string, b: string) => [a, b].sort().join("::");
const graphWidth = 900;
const graphHeight = 560;

const relationAbbreviation = (type: string) =>
  type
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();

const relationWeight = (type: string): number => {
  if (type === "Military Alliance") return 7;
  if (type === "Defensive Pact" || type === "Economic Alliance") return 6;
  if (type === "Non-Aggression Pact") return 4;
  if (type === "Guarantee") return 3;
  if (type.includes("Access") || type.includes("Authorization")) return 2;
  if (type === "War") return -5;
  if (type === "Embargo") return -3;
  return 1;
};

const crossingCount = (order: string[], relations: DiplomaticRelation[]): number => {
  const index = new Map(order.map((id, orderIndex) => [id, orderIndex]));
  const edges = relations
    .map((relation) => [index.get(relation.country_a_id), index.get(relation.country_b_id)] as const)
    .filter(([a, b]) => a !== undefined && b !== undefined && a !== b)
    .map(([a, b]) => [Math.min(a as number, b as number), Math.max(a as number, b as number)] as const);

  let crossings = 0;
  edges.forEach(([a1, a2], firstIndex) => {
    edges.slice(firstIndex + 1).forEach(([b1, b2]) => {
      const sharedEndpoint = a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2;
      if (!sharedEndpoint && ((a1 < b1 && b1 < a2 && a2 < b2) || (b1 < a1 && a1 < b2 && b2 < a2))) {
        crossings += 1;
      }
    });
  });
  return crossings;
};

const optimizedCountryOrder = (countries: Country[], relations: DiplomaticRelation[]): string[] => {
  const active = relations.filter((relation) => relation.active);
  const countryIds = countries.map((country) => country.id);
  const strength = new Map<string, number>();
  const pairStrength = new Map<string, number>();

  active.forEach((relation) => {
    const weight = Math.max(0, relationWeight(relation.relation_type));
    if (weight === 0) return;
    const key = pairKey(relation.country_a_id, relation.country_b_id);
    pairStrength.set(key, (pairStrength.get(key) ?? 0) + weight);
    strength.set(relation.country_a_id, (strength.get(relation.country_a_id) ?? 0) + weight);
    strength.set(relation.country_b_id, (strength.get(relation.country_b_id) ?? 0) + weight);
  });

  const remaining = new Set(countryIds);
  const first = countryIds.slice().sort((a, b) => (strength.get(b) ?? 0) - (strength.get(a) ?? 0) || a.localeCompare(b))[0];
  const order: string[] = [];
  if (first) {
    order.push(first);
    remaining.delete(first);
  }

  while (remaining.size > 0) {
    const next = Array.from(remaining).sort((a, b) => {
      const aScore = order.reduce((sum, id) => sum + (pairStrength.get(pairKey(a, id)) ?? 0), 0);
      const bScore = order.reduce((sum, id) => sum + (pairStrength.get(pairKey(b, id)) ?? 0), 0);
      return bScore - aScore || (strength.get(b) ?? 0) - (strength.get(a) ?? 0) || a.localeCompare(b);
    })[0];
    order.push(next);
    remaining.delete(next);
  }

  let best = order;
  let bestCrossings = crossingCount(best, active);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const candidate = best.slice();
        [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
        const candidateCrossings = crossingCount(candidate, active);
        if (candidateCrossings < bestCrossings) {
          best = candidate;
          bestCrossings = candidateCrossings;
          improved = true;
        }
      }
    }
  }
  return best;
};

export const createDefaultGraphPositions = (state: GameState): GameState["graphPositions"] => {
  const order = optimizedCountryOrder(state.countries, state.diplomacy);
  const positions: GameState["graphPositions"] = {};
  const centerX = graphWidth / 2;
  const centerY = graphHeight / 2;
  const radiusX = 330;
  const radiusY = 205;
  order.forEach((countryId, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, order.length)) * Math.PI * 2;
    positions[countryId] = {
      x: Math.round(centerX + Math.cos(angle) * radiusX),
      y: Math.round(centerY + Math.sin(angle) * radiusY)
    };
  });
  return positions;
};

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
  const [hiddenRelationTypes, setHiddenRelationTypes] = useState<Set<string>>(() => new Set(["Guarantee"]));
  const svgRef = useRef<SVGSVGElement>(null);
  const relation = state.diplomacy.find((item) => item.id === selectedRelation);
  const activeRelations = state.diplomacy.filter((edge) => edge.active && !hiddenRelationTypes.has(edge.relation_type));
  const relationTypeOptions = state.rules.diplomacyRelationTypes.filter((type) =>
    state.diplomacy.some((relation) => relation.relation_type === type)
  );
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
      x: ((event.clientX - rect.left) / rect.width) * graphWidth,
      y: ((event.clientY - rect.top) / rect.height) * graphHeight
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
      <div className="graph-canvas-wrap">
        <div className="graph-toolbar">
          <button
            onClick={() =>
              patchState((current) => ({
                ...current,
                graphPositions: createDefaultGraphPositions(current)
              }))
            }
          >
            <Network size={16} /> Auto layout
          </button>
          <span>{activeRelations.length} visible lines</span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${graphWidth} ${graphHeight}`}
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
      </div>
      <div className="graph-editor">
        <section className="graph-filter-panel">
          <h2><EyeOff size={16} /> Visible line types</h2>
          <div className="graph-filter-list">
            {relationTypeOptions.map((type) => (
              <CheckboxField
                key={type}
                label={type}
                checked={!hiddenRelationTypes.has(type)}
                onChange={(visible) =>
                  setHiddenRelationTypes((current) => {
                    const next = new Set(current);
                    if (visible) next.delete(type);
                    else next.add(type);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </section>
        {relation && (
          <>
          <SelectField
            label="Relation"
            value={relation.relation_type}
            options={state.rules.diplomacyRelationTypes}
            onChange={(relation_type) => updateRelation({ relation_type })}
          />
          <CheckboxField label="Active" checked={relation.active} onChange={(active) => updateRelation({ active })} />
          <TextField label="Notes" value={relation.notes} onChange={(notes) => updateRelation({ notes })} />
          </>
        )}
      </div>
    </section>
  );
}
