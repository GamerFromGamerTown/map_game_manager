import { EyeOff, LocateFixed, Network, Plus, RotateCcw } from "lucide-react";
import { PointerEvent, useMemo, useRef, useState } from "react";
import { createId } from "../engine/calculations";
import { Country, DiplomaticRelation, GameState, RESOURCE_TYPES, ResourceType, TradableType } from "../types";
import { CheckboxField, SelectField, TextField } from "../ui/fields";
import { resourceLabel } from "../utils/labels";

const pairKey = (a: string, b: string) => [a, b].sort().join("::");
const graphWidth = 900;
const graphHeight = 560;
const customRelationType = "Custom Relation";
const allMaterials = "all";

type GraphCustomLineType = NonNullable<DiplomaticRelation["graph_custom"]>["line_type"];
type NodeSizeMetric = "fixed" | "manpower" | "gold" | "supplies" | ResourceType;

export interface RelationsGraphEdge {
  id: string;
  sourceCountryId: string;
  targetCountryId: string;
  kind: "relation" | "trade" | "custom";
  label: string;
  hoverText: string;
  directed: boolean;
  stroke: string;
  strokeWidth: number;
  dashArray?: string;
  relation?: DiplomaticRelation;
}

export interface RelationsGraphEdgeOptions {
  hiddenRelationTypes: Set<string>;
  visibleTradeMaterials: Set<string>;
}

const relationAbbreviation = (type: string) =>
  type
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();

const materialAbbreviation = (type: TradableType) => {
  if (type === "gold") return "GOLD";
  const parts = type.split("_").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]).join("").slice(0, 4).toUpperCase();
};

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

const relationStroke = (type: string) => {
  if (type === "War") return "var(--red)";
  if (type === "Embargo") return "var(--gold)";
  if (type === "Non-Aggression Pact") return "var(--green)";
  return "var(--blue)";
};

const relationDashArray = (type: string): string | undefined => {
  if (type === "Military Alliance" || type === "Defensive Pact") return "7 5";
  if (type === "Embargo") return "3 4";
  return undefined;
};

const customDashArray = (type: GraphCustomLineType): string | undefined => {
  if (type === "dashed") return "8 6";
  if (type === "dotted") return "2 6";
  return undefined;
};

const numberText = (value: number) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

const countryName = (state: GameState, countryId: string) =>
  state.countries.find((country) => country.id === countryId)?.name ?? countryId;

export const buildRelationsGraphEdges = (
  state: GameState,
  options: RelationsGraphEdgeOptions
): RelationsGraphEdge[] => {
  const showAllTrades = options.visibleTradeMaterials.has(allMaterials);
  const relationEdges = state.diplomacy
    .filter((relation) => relation.active && !options.hiddenRelationTypes.has(relation.relation_type))
    .map((relation): RelationsGraphEdge => {
      const custom = relation.graph_custom?.enabled ? relation.graph_custom : undefined;
      return {
        id: relation.id,
        sourceCountryId: relation.country_a_id,
        targetCountryId: relation.country_b_id,
        kind: custom ? "custom" : "relation",
        label: relationAbbreviation(relation.relation_type),
        hoverText: custom?.hover_text.trim() || relation.notes.trim() || relation.relation_type,
        directed: relation.relation_type === "Non-Aggression Pact" || Boolean(custom?.directed),
        stroke: custom?.color || relationStroke(relation.relation_type),
        strokeWidth: relation.relation_type === "War" ? 3 : 2.4,
        dashArray: custom ? customDashArray(custom.line_type) : relationDashArray(relation.relation_type),
        relation
      };
    });

  const tradeEdges = state.trades
    .filter((trade) => trade.active && (showAllTrades || options.visibleTradeMaterials.has(trade.resource_type)))
    .map((trade): RelationsGraphEdge => {
      const amount = Math.max(0, Number(trade.amount_per_turn) || 0);
      const payment = Math.max(0, Number(trade.payment_gold_per_turn) || 0);
      const value = trade.resource_type === "gold" ? amount + payment : amount + payment;
      const strokeWidth = 2 + Math.min(8, Math.sqrt(value) / 1.8);
      const paymentText = payment ? `, ${numberText(payment)} gold payment` : "";
      const status = trade.route_valid && !trade.blocked_by_embargo ? "" : " (blocked or invalid)";
      return {
        id: trade.id,
        sourceCountryId: trade.sender_country_id,
        targetCountryId: trade.receiver_country_id,
        kind: "trade",
        label: materialAbbreviation(trade.resource_type),
        hoverText: `${countryName(state, trade.sender_country_id)} -> ${countryName(state, trade.receiver_country_id)}: ${numberText(amount)} ${resourceLabel(trade.resource_type)}${paymentText}${status}${trade.notes ? ` - ${trade.notes}` : ""}`,
        directed: true,
        stroke: "var(--violet)",
        strokeWidth,
        dashArray: trade.recurring ? undefined : "10 5"
      };
    });

  return [...relationEdges, ...tradeEdges];
};

const metricValueForCountry = (state: GameState, country: Country, metric: NodeSizeMetric): number => {
  if (metric === "fixed") return 0;
  if (metric === "manpower") return Math.max(0, country.manpower);
  if (metric === "gold") return Math.max(0, country.gold);
  if (metric === "supplies") return Math.max(0, country.supply);
  return Math.max(
    0,
    state.stockpiles.find((stockpile) => stockpile.country_id === country.id && stockpile.resource_type === metric)?.amount ?? 0
  );
};

export const countryNodeRadius = (state: GameState, country: Country, metric: NodeSizeMetric): number => {
  if (metric === "fixed") return 28;
  const max = Math.max(...state.countries.map((item) => metricValueForCountry(state, item, metric)), 0);
  if (max <= 0) return 28;
  return Math.round(20 + Math.sqrt(metricValueForCountry(state, country, metric) / max) * 32);
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
  const [panningFrom, setPanningFrom] = useState<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
  const [hiddenRelationTypes, setHiddenRelationTypes] = useState<Set<string>>(() => new Set(["Guarantee"]));
  const [visibleTradeMaterials, setVisibleTradeMaterials] = useState<Set<string>>(() => new Set([allMaterials]));
  const [nodeSizeMetric, setNodeSizeMetric] = useState<NodeSizeMetric>("fixed");
  const [showCustomRelation, setShowCustomRelation] = useState(false);
  const [customCountryIds, setCustomCountryIds] = useState<string[]>([]);
  const [customLineType, setCustomLineType] = useState<GraphCustomLineType>("solid");
  const [customColor, setCustomColor] = useState("#7c3aed");
  const [customHoverText, setCustomHoverText] = useState("");
  const [customDirected, setCustomDirected] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const relation = state.diplomacy.find((item) => item.id === selectedRelation);
  const graphEdges = useMemo(
    () => buildRelationsGraphEdges(state, { hiddenRelationTypes, visibleTradeMaterials }),
    [hiddenRelationTypes, state, visibleTradeMaterials]
  );
  const relationTypeOptions = Array.from(new Set([...state.rules.diplomacyRelationTypes, ...state.diplomacy.map((item) => item.relation_type)]))
    .filter((type) => state.diplomacy.some((item) => item.relation_type === type));
  const tradeMaterialOptions = [allMaterials, "gold", ...state.rules.resources] as string[];
  const nodeSizeOptions = ["fixed", "manpower", "gold", "supplies", ...RESOURCE_TYPES] as string[];
  const relationIndexes = useMemo(() => {
    const groups = new Map<string, string[]>();
    graphEdges.forEach((edge) => {
      const key = pairKey(edge.sourceCountryId, edge.targetCountryId);
      groups.set(key, [...(groups.get(key) ?? []), edge.id]);
    });
    return new Map(
      Array.from(groups.values()).flatMap((ids) => ids.map((id, index) => [id, index - (ids.length - 1) / 2]))
    );
  }, [graphEdges]);

  const positionFor = (country: Country) => state.graphPositions[country.id] ?? { x: 160, y: 160 };
  const clientToViewBox = (event: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * graphWidth,
      y: ((event.clientY - rect.top) / rect.height) * graphHeight
    };
  };
  const pointerPosition = (event: PointerEvent<SVGSVGElement>) => {
    const point = clientToViewBox(event);
    return {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale
    };
  };

  const resetViewport = () => setViewport({ x: 0, y: 0, scale: 1 });
  const resetGraph = () => {
    resetViewport();
    patchState((current) => ({
      ...current,
      graphPositions: createDefaultGraphPositions(current)
    }));
  };

  const updateRelation = (patch: Partial<DiplomaticRelation>) => {
    if (!relation) return;
    patchState((current) => ({
      ...current,
      diplomacy: current.diplomacy.map((item) => (item.id === relation.id ? { ...item, ...patch } : item))
    }));
  };

  const updateSelectedCustom = (patch: Partial<NonNullable<DiplomaticRelation["graph_custom"]>>) => {
    if (!relation) return;
    updateRelation({
      graph_custom: {
        enabled: true,
        line_type: relation.graph_custom?.line_type ?? "solid",
        color: relation.graph_custom?.color ?? customColor,
        hover_text: relation.graph_custom?.hover_text ?? "",
        directed: relation.graph_custom?.directed ?? false,
        ...patch
      }
    });
  };

  const createCustomRelations = () => {
    if (customCountryIds.length < 2) return;
    const groupId = createId("custom-relation");
    const pairs = customCountryIds.flatMap((countryA, index) =>
      customCountryIds.slice(index + 1).map((countryB) => ({
        id: createId("relation"),
        relation_type: customRelationType,
        country_a_id: countryA,
        country_b_id: countryB,
        active: true,
        notes: "",
        graph_custom: {
          enabled: true,
          line_type: customLineType,
          color: customColor,
          hover_text: customHoverText,
          directed: customDirected,
          group_id: groupId
        }
      }))
    );
    patchState((current) => ({
      ...current,
      diplomacy: [...current.diplomacy, ...pairs]
    }));
    setSelectedRelation(pairs[0]?.id ?? null);
  };

  const toggleTradeMaterial = (material: string, visible: boolean) => {
    setVisibleTradeMaterials((current) => {
      const next = new Set(current);
      if (material === allMaterials) {
        return visible ? new Set([allMaterials]) : new Set();
      }
      next.delete(allMaterials);
      if (visible) next.add(material);
      else next.delete(material);
      return next;
    });
  };

  return (
    <section className="panel full graph-panel">
      <div className="graph-canvas-wrap">
        <div className="graph-toolbar">
          <button onClick={resetGraph}>
            <Network size={16} /> Auto layout
          </button>
          <span>{graphEdges.length} visible lines</span>
        </div>
        <div className="graph-stage">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${graphWidth} ${graphHeight}`}
            onPointerMove={(event) => {
              if (dragging) {
                const point = pointerPosition(event);
                patchState((current) => ({
                  ...current,
                  graphPositions: { ...current.graphPositions, [dragging]: point }
                }));
                return;
              }
              if (!panningFrom) return;
              const rect = svgRef.current?.getBoundingClientRect();
              if (!rect) return;
              const dx = ((event.clientX - panningFrom.clientX) / rect.width) * graphWidth;
              const dy = ((event.clientY - panningFrom.clientY) / rect.height) * graphHeight;
              setViewport({ x: panningFrom.x + dx, y: panningFrom.y + dy, scale: 1 });
            }}
            onPointerUp={() => {
              setDragging(null);
              setPanningFrom(null);
            }}
            onPointerLeave={() => {
              setDragging(null);
              setPanningFrom(null);
            }}
          >
            <defs>
              <marker id="relations-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 9 3 L 0 6 z" fill="context-stroke" />
              </marker>
            </defs>
            <rect
              className="graph-pan-surface"
              width={graphWidth}
              height={graphHeight}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setPanningFrom({ clientX: event.clientX, clientY: event.clientY, x: viewport.x, y: viewport.y });
              }}
            />
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
              {graphEdges.map((edge) => {
                const a = state.countries.find((country) => country.id === edge.sourceCountryId);
                const b = state.countries.find((country) => country.id === edge.targetCountryId);
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
                const sourceRadius = countryNodeRadius(state, a, nodeSizeMetric);
                const targetRadius = countryNodeRadius(state, b, nodeSizeMetric);
                const startX = pa.x + (dx / length) * sourceRadius;
                const startY = pa.y + (dy / length) * sourceRadius;
                const endX = pb.x - (dx / length) * (targetRadius + (edge.directed ? 8 : 0));
                const endY = pb.y - (dy / length) * (targetRadius + (edge.directed ? 8 : 0));
                const path = `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;
                const selected = selectedRelation === edge.id;

                return (
                  <g
                    key={edge.id}
                    onClick={() => setSelectedRelation(edge.relation?.id ?? null)}
                    className={`edge edge-${edge.kind} ${selected ? "selected" : ""} edge-${edge.label.toLowerCase()}`}
                  >
                    <path
                      d={path}
                      stroke={edge.stroke}
                      strokeWidth={edge.strokeWidth}
                      strokeDasharray={edge.dashArray}
                      markerEnd={edge.directed ? "url(#relations-arrow)" : undefined}
                    />
                    <g transform={`translate(${cx}, ${cy})`} className="edge-label">
                      <rect x="-31" y="-12" width="62" height="24" rx="6" />
                      <text>{edge.label}</text>
                      <title>{edge.hoverText}</title>
                    </g>
                  </g>
                );
              })}
              {state.countries.map((country) => {
                const point = positionFor(country);
                const radius = countryNodeRadius(state, country, nodeSizeMetric);
                return (
                  <g
                    key={country.id}
                    className="node"
                    transform={`translate(${point.x}, ${point.y})`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragging(country.id);
                    }}
                    onDoubleClick={() => openCountry(country.id)}
                  >
                    <circle r={radius} fill={country.color} />
                    <text y={radius + 20}>{country.name}</text>
                    <title>{country.name}</title>
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="graph-corner-controls">
            <button onClick={resetViewport}><LocateFixed size={16} /> Return to center</button>
            <button onClick={resetGraph}><RotateCcw size={16} /> Reset</button>
          </div>
        </div>
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
        <section className="graph-filter-panel">
          <h2>Trade materials</h2>
          <div className="graph-filter-list">
            {tradeMaterialOptions.map((material) => (
              <CheckboxField
                key={material}
                label={material === allMaterials ? "All trades" : resourceLabel(material)}
                checked={visibleTradeMaterials.has(material)}
                onChange={(visible) => toggleTradeMaterial(material, visible)}
              />
            ))}
          </div>
        </section>
        <section className="graph-filter-panel">
          <h2>Country dot size</h2>
          <SelectField
            label="Size by"
            value={nodeSizeMetric}
            options={nodeSizeOptions}
            optionLabel={(value) => {
              if (value === "fixed") return "Fixed";
              if (value === "manpower") return "Manpower";
              if (value === "supplies") return "Supplies";
              return resourceLabel(value);
            }}
            onChange={(value) => setNodeSizeMetric(value as NodeSizeMetric)}
          />
        </section>
        <section className="graph-filter-panel">
          <CheckboxField label="Custom relation" checked={showCustomRelation} onChange={setShowCustomRelation} />
          {showCustomRelation && (
            <div className="graph-custom-form">
              <div className="graph-filter-list country-check-list">
                {state.countries.map((country) => (
                  <CheckboxField
                    key={country.id}
                    label={country.name}
                    checked={customCountryIds.includes(country.id)}
                    onChange={(checked) =>
                      setCustomCountryIds((current) =>
                        checked ? [...current, country.id] : current.filter((id) => id !== country.id)
                      )
                    }
                  />
                ))}
              </div>
              <SelectField
                label="Line type"
                value={customLineType}
                options={["solid", "dashed", "dotted"]}
                onChange={(value) => setCustomLineType(value as GraphCustomLineType)}
              />
              <label>
                <span>Line color</span>
                <input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} />
              </label>
              <TextField label="Hover text" value={customHoverText} onChange={setCustomHoverText} />
              <CheckboxField label="Directed" checked={customDirected} onChange={setCustomDirected} />
              <button className="primary" disabled={customCountryIds.length < 2} onClick={createCustomRelations}>
                <Plus size={16} /> Add custom lines
              </button>
            </div>
          )}
        </section>
        {relation && (
          <section className="graph-filter-panel">
            <h2>Selected relation</h2>
            <SelectField
              label="Relation"
              value={relation.relation_type}
              options={Array.from(new Set([...state.rules.diplomacyRelationTypes, relation.relation_type, customRelationType]))}
              onChange={(relation_type) => updateRelation({ relation_type })}
            />
            <CheckboxField label="Active" checked={relation.active} onChange={(active) => updateRelation({ active })} />
            <TextField label="Notes" value={relation.notes} onChange={(notes) => updateRelation({ notes })} />
            <CheckboxField
              label="Custom relation styling"
              checked={Boolean(relation.graph_custom?.enabled)}
              onChange={(enabled) => updateRelation({ graph_custom: enabled ? { enabled, line_type: "solid", color: customColor, hover_text: relation.notes, directed: false } : undefined })}
            />
            {relation.graph_custom?.enabled && (
              <>
                <SelectField
                  label="Line type"
                  value={relation.graph_custom.line_type}
                  options={["solid", "dashed", "dotted"]}
                  onChange={(line_type) => updateSelectedCustom({ line_type: line_type as GraphCustomLineType })}
                />
                <label>
                  <span>Line color</span>
                  <input type="color" value={relation.graph_custom.color} onChange={(event) => updateSelectedCustom({ color: event.target.value })} />
                </label>
                <TextField
                  label="Hover text"
                  value={relation.graph_custom.hover_text}
                  onChange={(hover_text) => updateSelectedCustom({ hover_text })}
                />
                <CheckboxField
                  label="Directed"
                  checked={Boolean(relation.graph_custom.directed)}
                  onChange={(directed) => updateSelectedCustom({ directed })}
                />
              </>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
