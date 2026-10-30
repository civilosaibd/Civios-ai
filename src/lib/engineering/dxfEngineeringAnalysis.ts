import { dxfUnitFromInsUnits, TO_METERS, type LinearUnit } from "@/lib/viz/units";

export type EngineeringElementKind =
  | "wall" | "column" | "beam" | "slab" | "foundation"
  | "door" | "window" | "reinforcement" | "other";

export interface EngineeringElementStats {
  kind: EngineeringElementKind;
  cadObjectCount: number;
  geometryLength: number;
  closedArea: number;
  floors: Record<string, number>;
  sourceLayers: string[];
}

export interface DxfEngineeringAnalysis {
  fileName: string;
  entityCount: number;
  layerCount: number;
  units: LinearUnit | null;
  unitsVerifiedFromHeader: boolean;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  elements: EngineeringElementStats[];
  floorLabels: string[];
  labels: string[];
  warnings: string[];
  unsupportedEntityCounts: Record<string, number>;
  geometryBasis: "explicit-dxf-units" | "raw-cad-units";
}

interface Pair { code: number; value: string }
interface CadEntity {
  type: string;
  layer: string;
  floor: string;
  points: Array<{ x: number; y: number }>;
  closed: boolean;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  hasBulge: boolean;
}

const ELEMENT_RULES: Array<{ kind: EngineeringElementKind; pattern: RegExp }> = [
  { kind: "reinforcement", pattern: /(?:^|[-_ ])(?:rebar|reinforcement|reinforcing|steel[-_ ]?bar|bbs|bar[-_ ]?bending)(?:$|[-_ ])/i },
  { kind: "foundation", pattern: /(?:^|[-_ ])(?:foundation|footing|pile|raft|pilecap|pile[-_ ]?cap)(?:$|[-_ ])/i },
  { kind: "column", pattern: /(?:^|[-_ ])(?:column|columns|col|str[-_ ]?col|s[-_ ]?column)(?:$|[-_ ])/i },
  { kind: "beam", pattern: /(?:^|[-_ ])(?:beam|beams|girder|str[-_ ]?beam|s[-_ ]?beam)(?:$|[-_ ])/i },
  { kind: "slab", pattern: /(?:^|[-_ ])(?:slab|slabs|roof|deck)(?:$|[-_ ])/i },
  { kind: "door", pattern: /(?:^|[-_ ])(?:door|doors|dr)(?:$|[-_ ])/i },
  { kind: "window", pattern: /(?:^|[-_ ])(?:window|windows|win|wnd)(?:$|[-_ ])/i },
  { kind: "wall", pattern: /(?:^|[-_ ])(?:wall|walls|wal|brick|partition|a[-_ ]?wall|masonry)(?:$|[-_ ])/i },
];

function parsePairs(text: string): Pair[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (Number.isInteger(code) && code >= 0 && code <= 1071) {
      pairs.push({ code, value: lines[i + 1].trim() });
      if (pairs.length > 1_000_000) throw new Error("DXF contains too many group-code records for safe browser analysis. Simplify or split the drawing.");
    }
  }
  return pairs;
}

function numberValue(pairs: Pair[], code: number): number | undefined {
  const value = pairs.find((pair) => pair.code === code)?.value;
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function getFloorLabel(layer: string): string {
  const value = layer.toUpperCase().replace(/[._]/g, "-");
  if (/(?:^|[- ])(?:B2|BASEMENT[- ]?2|2ND[- ]?BASEMENT)(?:$|[- ])/i.test(value)) return "Basement 2";
  if (/(?:^|[- ])(?:B1|BASEMENT|LOWER[- ]?GROUND)(?:$|[- ])/i.test(value)) return "Basement 1";
  if (/(?:^|[- ])(?:GF|GROUND|GROUND[- ]?FLOOR|GFL)(?:$|[- ])/i.test(value)) return "Ground";
  const numbered = value.match(/(?:^|[- ])(?:FLOOR[- ]?|FL[- ]?|F|L)([1-9]\d?)(?:$|[- ])/i)
    ?? value.match(/(?:^|[- ])([1-9]\d?)(?:ST|ND|RD|TH)?[- ]?(?:F|FL|FLOOR)(?:$|[- ])/i);
  if (numbered) return `Floor ${Number(numbered[1])}`;
  return "Unassigned";
}

function classifyLayer(layer: string): EngineeringElementKind {
  const normalized = layer.trim().replace(/[^a-z0-9_-]+/gi, "-");
  for (const rule of ELEMENT_RULES) if (rule.pattern.test(normalized)) return rule.kind;
  return "other";
}

function entityFrom(type: string, values: Pair[]): CadEntity {
  const layer = values.find((pair) => pair.code === 8)?.value || "0";
  const floor = getFloorLabel(layer);
  const points: Array<{ x: number; y: number }> = [];
  if (type === "LINE") {
    const x1 = numberValue(values, 10), y1 = numberValue(values, 20);
    const x2 = numberValue(values, 11), y2 = numberValue(values, 21);
    if (x1 !== undefined && y1 !== undefined) points.push({ x: x1, y: y1 });
    if (x2 !== undefined && y2 !== undefined) points.push({ x: x2, y: y2 });
  } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
    let pendingX: number | undefined;
    for (const pair of values) {
      if (pair.code === 10) {
        pendingX = Number(pair.value);
      } else if (pair.code === 20 && pendingX !== undefined) {
        const y = Number(pair.value);
        if (Number.isFinite(pendingX) && Number.isFinite(y)) points.push({ x: pendingX, y });
        pendingX = undefined;
      }
    }
  } else if (type === "CIRCLE" || type === "ARC" || type === "POINT" || type === "TEXT" || type === "MTEXT") {
    const x = numberValue(values, 10), y = numberValue(values, 20);
    if (x !== undefined && y !== undefined) points.push({ x, y });
  }
  const flags = numberValue(values, 70) ?? 0;
  const text = values.filter((pair) => pair.code === 1 || pair.code === 3).map((pair) => pair.value).join(" ");
  return {
    type, layer, floor, points,
    closed: (type === "LWPOLYLINE" || type === "POLYLINE") && (flags & 1) === 1,
    radius: numberValue(values, 40),
    startAngle: numberValue(values, 50),
    endAngle: numberValue(values, 51),
    text,
    hasBulge: values.some((pair) => pair.code === 42 && Number(pair.value) !== 0),
  };
}

function isEntityGeometryValid(entity: CadEntity): boolean {
  if (entity.type === "LINE") return entity.points.length === 2;
  if (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") return entity.points.length >= 2;
  if (entity.type === "CIRCLE") return entity.points.length === 1 && Number.isFinite(entity.radius) && (entity.radius ?? 0) > 0;
  if (entity.type === "ARC") {
    return entity.points.length === 1
      && Number.isFinite(entity.radius) && (entity.radius ?? 0) > 0
      && entity.startAngle !== undefined && entity.endAngle !== undefined;
  }
  if (entity.type === "POINT" || entity.type === "TEXT" || entity.type === "MTEXT") return entity.points.length === 1;
  return false;
}

function extractEntities(pairs: Pair[]): { entities: CadEntity[]; unsupported: Record<string, number> } {
  const entities: CadEntity[] = [];
  const unsupported: Record<string, number> = {};
  let inEntities = false;
  let currentType: string | null = null;
  let currentValues: Pair[] = [];
  let polylineVertices: Pair[][] | null = null;

  const flush = () => {
    if (!currentType) return;
    if (currentType === "POLYLINE") {
      const parent = currentValues.filter((pair) => ![10, 20, 30].includes(pair.code));
      const vertices = polylineVertices ?? [];
      const flattened: Pair[] = [...parent];
      for (const vertex of vertices) {
        const x = vertex.find((p) => p.code === 10)?.value;
        const y = vertex.find((p) => p.code === 20)?.value;
        if (x !== undefined && y !== undefined) flattened.push({ code: 10, value: x }, { code: 20, value: y });
      }
      const entity = entityFrom(currentType, flattened);
      if (isEntityGeometryValid(entity)) entities.push(entity);
      else unsupported[`INVALID_${currentType}`] = (unsupported[`INVALID_${currentType}`] ?? 0) + 1;
    } else if (["LINE", "LWPOLYLINE", "CIRCLE", "ARC", "POINT", "TEXT", "MTEXT", "INSERT"].includes(currentType)) {
      if (currentType === "INSERT") unsupported.INSERT = (unsupported.INSERT ?? 0) + 1;
      else {
        const entity = entityFrom(currentType, currentValues);
        if (isEntityGeometryValid(entity)) entities.push(entity);
        else unsupported[`INVALID_${currentType}`] = (unsupported[`INVALID_${currentType}`] ?? 0) + 1;
      }
    } else if (currentType !== "SEQEND" && currentType !== "VERTEX") {
      unsupported[currentType] = (unsupported[currentType] ?? 0) + 1;
    }
    currentType = null;
    currentValues = [];
    polylineVertices = null;
  };

  for (const pair of pairs) {
    if (pair.code === 0) {
      const marker = pair.value.toUpperCase();
      if (marker === "SECTION") {
        flush();
        currentType = "SECTION";
        currentValues = [];
        continue;
      }
      if (marker === "ENDSEC") {
        flush();
        inEntities = false;
        continue;
      }
      if (!inEntities) {
        if (marker === "EOF") break;
        currentType = marker;
        currentValues = [];
        continue;
      }
      if (marker === "VERTEX" && currentType === "POLYLINE") {
        polylineVertices ??= [];
        polylineVertices.push([]);
        continue;
      }
      if (marker === "SEQEND" && currentType === "POLYLINE") continue;
      flush();
      if (marker === "SECTION") currentType = "SECTION";
      else {
        currentType = marker;
        currentValues = [];
      }
      continue;
    }
    if (currentType === "SECTION" && pair.code === 2) {
      inEntities = pair.value.toUpperCase() === "ENTITIES";
      currentType = null;
      continue;
    }
    if (!inEntities || !currentType) continue;
    if (currentType === "POLYLINE" && polylineVertices?.length) polylineVertices[polylineVertices.length - 1].push(pair);
    else currentValues.push(pair);
  }
  flush();
  return { entities, unsupported };
}

function polylineMetrics(points: Array<{ x: number; y: number }>, closed: boolean) {
  if (points.length < 2) return { length: 0, area: 0 };
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (closed && points.length > 2) {
    length += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
  }
  let twiceArea = 0;
  if (closed && points.length > 2) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      twiceArea += a.x * b.y - b.x * a.y;
    }
  }
  return { length, area: Math.abs(twiceArea) / 2 };
}

function entityMetrics(entity: CadEntity) {
  if (entity.type === "LINE" || entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") {
    return polylineMetrics(entity.points, entity.closed);
  }
  if (entity.type === "CIRCLE" && entity.radius && entity.radius > 0) {
    return { length: 2 * Math.PI * entity.radius, area: Math.PI * entity.radius ** 2 };
  }
  if (entity.type === "ARC" && entity.radius && entity.radius > 0
    && entity.startAngle !== undefined && entity.endAngle !== undefined) {
    let delta = (entity.endAngle - entity.startAngle) % 360;
    if (delta < 0) delta += 360;
    return { length: entity.radius * delta * Math.PI / 180, area: 0 };
  }
  return { length: 0, area: 0 };
}

function getBounds(entities: CadEntity[]) {
  const points = entities.flatMap((entity) => {
    if ((entity.type === "CIRCLE" || entity.type === "ARC") && entity.points[0] && entity.radius) {
      const c = entity.points[0], r = entity.radius;
      return [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }];
    }
    return entity.points;
  });
  if (!points.length) return null;
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

export function analyzeDxfEngineeringDrawing(
  text: string,
  options: { fileName?: string } = {},
): DxfEngineeringAnalysis {
  if (text.length > 20 * 1024 * 1024) throw new Error("DXF text exceeds the 20 MB analysis limit.");
  const pairs = parsePairs(text);
  const headerIndex = pairs.findIndex((pair) => pair.code === 9 && pair.value === "$INSUNITS");
  const insUnits = headerIndex >= 0 ? Number(pairs[headerIndex + 1]?.value) : undefined;
  const units = dxfUnitFromInsUnits(insUnits);
  const { entities, unsupportedEntityCounts } = extractEntities(pairs);
  if (!entities.length) throw new Error("No supported geometric or text entities were found in the DXF ENTITIES section.");

  const layers = new Set(entities.map((entity) => entity.layer));
  const bounds = getBounds(entities);
  const accum = new Map<EngineeringElementKind, EngineeringElementStats>();
  const labels: string[] = [];
  const floorSet = new Set<string>();
  const warnings: string[] = [];

  for (const entity of entities) {
    if (entity.floor !== "Unassigned") floorSet.add(entity.floor);
    if ((entity.type === "TEXT" || entity.type === "MTEXT") && entity.text.trim()) {
      const label = entity.text.replace(/\\P/g, " ").replace(/\s+/g, " ").trim();
      if (label && !labels.includes(label)) labels.push(label.slice(0, 80));
    }
    const kind = classifyLayer(entity.layer);
    if (kind === "other") continue;
    const metrics = entityMetrics(entity);
    const current = accum.get(kind) ?? {
      kind, cadObjectCount: 0, geometryLength: 0, closedArea: 0, floors: {}, sourceLayers: [],
    };
    current.cadObjectCount += 1;
    current.geometryLength += metrics.length;
    current.closedArea += metrics.area;
    current.floors[entity.floor] = (current.floors[entity.floor] ?? 0) + 1;
    if (!current.sourceLayers.includes(entity.layer)) current.sourceLayers.push(entity.layer);
    accum.set(kind, current);
  }

  if (!units) warnings.push("DXF $INSUNITS is missing or unsupported. Geometry is reported only in raw CAD units; no metric conversion or scale assumption is applied.");
  if (!entities.some((entity) => classifyLayer(entity.layer) !== "other")) warnings.push("No engineering element layers were recognised. Layer names must identify elements (for example A-WALL, S-COLUMN, S-BEAM, S-SLAB, FOUNDATION, REBAR).");
  if (entities.some((entity) => entity.hasBulge)) warnings.push("Bulge-based polyline arcs are not expanded in this version; curved lengths/areas may be incomplete.");
  if (Object.keys(unsupportedEntityCounts).length) warnings.push("Some CAD entity types are not yet interpreted. Their geometry is excluded from the engineering quantities.");
  if (entities.some((entity) => entity.floor === "Unassigned" && classifyLayer(entity.layer) !== "other")) warnings.push("Some engineering layers have no recognisable floor marker. Those objects are grouped under Unassigned and are not assumed to repeat on every floor.");
  if (!floorSet.size) warnings.push("No floor identifiers were found in layer names. Floor-wise assignment requires explicit floor-coded layers or a separate drawing per floor.");

  const elements = [...accum.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  return {
    fileName: options.fileName ?? "Drawing.dxf",
    entityCount: entities.length,
    layerCount: layers.size,
    units,
    unitsVerifiedFromHeader: units !== null,
    bounds,
    elements,
    floorLabels: [...floorSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    labels: labels.slice(0, 100),
    warnings,
    unsupportedEntityCounts,
    geometryBasis: units ? "explicit-dxf-units" : "raw-cad-units",
  };
}

export function compareArchitecturalStructuralDrawings(
  architectural: DxfEngineeringAnalysis,
  structural: DxfEngineeringAnalysis,
): { comparable: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!architectural.units || !structural.units) {
    return { comparable: false, warnings: ["Cross-drawing comparison is blocked because one or both drawings lack verified DXF units."] };
  }
  if (!architectural.bounds || !structural.bounds) {
    return { comparable: false, warnings: ["Cross-drawing comparison is blocked because one or both drawings have no usable coordinate bounds."] };
  }
  const aFactor = TO_METERS[architectural.units], sFactor = TO_METERS[structural.units];
  const a = architectural.bounds, s = structural.bounds;
  const aWidth = (a.maxX - a.minX) * aFactor, aHeight = (a.maxY - a.minY) * aFactor;
  const sWidth = (s.maxX - s.minX) * sFactor, sHeight = (s.maxY - s.minY) * sFactor;
  if (Math.min(aWidth, aHeight, sWidth, sHeight) < 0.01) {
    return { comparable: false, warnings: ["Cross-drawing comparison is blocked because one or both drawing extents are degenerate or incomplete."] };
  }
  const widthDelta = Math.abs(aWidth - sWidth) / Math.max(aWidth, sWidth, 0.001) * 100;
  const heightDelta = Math.abs(aHeight - sHeight) / Math.max(aHeight, sHeight, 0.001) * 100;
  if (widthDelta > 2 || heightDelta > 2) {
    warnings.push(`Drawing extents differ: width ${widthDelta.toFixed(1)}%, depth ${heightDelta.toFixed(1)}%. Confirm the same origin, view, scale and drawing revision before comparing elements.`);
  }
  const sameFrame = Math.abs(a.minX * aFactor - s.minX * sFactor) <= 0.05
    && Math.abs(a.minY * aFactor - s.minY * sFactor) <= 0.05
    && widthDelta <= 2 && heightDelta <= 2;
  if (!sameFrame) {
    warnings.push("Coordinate frames could not be confirmed. Element-by-element architectural/structural matching was skipped.");
    return { comparable: false, warnings };
  }
  const archColumns = architectural.elements.find((element) => element.kind === "column")?.cadObjectCount ?? 0;
  const structColumns = structural.elements.find((element) => element.kind === "column")?.cadObjectCount ?? 0;
  if (archColumns !== structColumns) {
    warnings.push(`Column CAD-object counts differ (architectural ${archColumns}, structural ${structColumns}). Review column grid and drawing revisions.`);
  }
  return { comparable: true, warnings };
}
