/**
 * CivilOS AI 2D drafting core.
 *
 * Geometry is stored in drawing units (the UI owns unit conversion). This module
 * deliberately contains no canvas/UI dependencies so commands and geometry can
 * be tested independently before integration into PlanGeneratorPage.
 */
export type Point2D = { x: number; y: number };
export type CadLayer = { id: string; name: string; visible: boolean; color: string; lineWeight: number };
type BaseEntity = { id: string; layerId: string; locked?: boolean };
export type CadEntity =
  | (BaseEntity & { type: "line"; start: Point2D; end: Point2D })
  | (BaseEntity & { type: "polyline"; points: Point2D[]; closed: boolean })
  | (BaseEntity & { type: "rectangle"; min: Point2D; max: Point2D })
  | (BaseEntity & { type: "circle"; center: Point2D; radius: number })
  | (BaseEntity & { type: "ellipse"; center: Point2D; rx: number; ry: number })
  | (BaseEntity & { type: "arc"; center: Point2D; radius: number; startAngle: number; endAngle: number })
  | (BaseEntity & { type: "wall"; start: Point2D; end: Point2D; thickness: number });

export type CadDocument = {
  version: 1;
  units: "mm" | "cm" | "m" | "in" | "ft";
  entities: CadEntity[];
  layers: CadLayer[];
};

export type CadCommand =
  | { kind: "create"; entity: Omit<CadEntity, "id" | "layerId"> & { type: CadEntity["type"] } }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "delete"; ids: string[] }
  | { kind: "zoom-fit" };

export const DEFAULT_LAYER: CadLayer = {
  id: "layer-0", name: "0", visible: true, color: "#111827", lineWeight: 1,
};
export const createEmptyDocument = (units: CadDocument["units"] = "ft"): CadDocument => ({
  version: 1, units, entities: [], layers: [{ ...DEFAULT_LAYER }],
});

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
export function normalizeRect(a: Point2D, b: Point2D): { min: Point2D; max: Point2D } {
  return { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } };
}
export function snapToGrid(p: Point2D, gridSize: number): Point2D {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return { ...p };
  return { x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
}
export function nearestEndpoint(p: Point2D, entities: CadEntity[], tolerance: number): Point2D | null {
  let nearest: Point2D | null = null;
  let best = tolerance;
  const candidates: Point2D[] = [];
  for (const e of entities) {
    if (e.type === "line" || e.type === "wall") candidates.push(e.start, e.end);
    else if (e.type === "polyline") candidates.push(...e.points);
    else if (e.type === "rectangle") candidates.push(e.min, { x: e.max.x, y: e.min.y }, e.max, { x: e.min.x, y: e.max.y });
    else if (e.type === "circle") candidates.push({ x: e.center.x + e.radius, y: e.center.y });
  }
  for (const candidate of candidates) {
    const d = distance(p, candidate);
    if (d <= best) { best = d; nearest = { ...candidate }; }
  }
  return nearest;
}
export function translateEntity(entity: CadEntity, dx: number, dy: number): CadEntity {
  const move = (p: Point2D): Point2D => ({ x: p.x + dx, y: p.y + dy });
  switch (entity.type) {
    case "line": case "wall": return { ...entity, start: move(entity.start), end: move(entity.end) };
    case "polyline": return { ...entity, points: entity.points.map(move) };
    case "rectangle": return { ...entity, min: move(entity.min), max: move(entity.max) };
    case "circle": case "arc": case "ellipse": return { ...entity, center: move(entity.center) };
  }
}
export function rotateEntity(entity: CadEntity, angleRadians: number, origin: Point2D = { x: 0, y: 0 }): CadEntity {
  const rotate = (p: Point2D): Point2D => {
    const x = p.x - origin.x, y = p.y - origin.y;
    const c = Math.cos(angleRadians), s = Math.sin(angleRadians);
    return { x: origin.x + x * c - y * s, y: origin.y + x * s + y * c };
  };
  switch (entity.type) {
    case "line": case "wall": return { ...entity, start: rotate(entity.start), end: rotate(entity.end) };
    case "polyline": return { ...entity, points: entity.points.map(rotate) };
    case "rectangle": {
      // A rotated axis-aligned rectangle is represented as a closed polyline to preserve geometry.
      const pts = [entity.min, { x: entity.max.x, y: entity.min.y }, entity.max, { x: entity.min.x, y: entity.max.y }].map(rotate);
      return { id: entity.id, layerId: entity.layerId, type: "polyline", points: pts, closed: true };
    }
    case "circle": case "ellipse": return { ...entity, center: rotate(entity.center) };
    case "arc": return { ...entity, center: rotate(entity.center), startAngle: entity.startAngle + angleRadians, endAngle: entity.endAngle + angleRadians };
  }
}
export function entityBounds(entity: CadEntity): { min: Point2D; max: Point2D } {
  if (entity.type === "circle" || entity.type === "arc") {
    const r = entity.radius;
    return { min: { x: entity.center.x - r, y: entity.center.y - r }, max: { x: entity.center.x + r, y: entity.center.y + r } };
  }
  const points = entity.type === "line" || entity.type === "wall" ? [entity.start, entity.end]
    : entity.type === "rectangle" ? [entity.min, entity.max]
    : entity.points;
  return points.reduce((b, p) => ({
    min: { x: Math.min(b.min.x, p.x), y: Math.min(b.min.y, p.y) },
    max: { x: Math.max(b.max.x, p.x), y: Math.max(b.max.y, p.y) },
  }), { min: { ...points[0] }, max: { ...points[0] } });
}

export type ParsedCommand =
  | { name: "LINE"; args: [Point2D, Point2D] }
  | { name: "RECTANGLE"; args: [Point2D, Point2D] }
  | { name: "CIRCLE"; args: [Point2D, number] }
  | { name: "WALL"; args: [Point2D, Point2D, number] }
  | { name: "UNDO" | "REDO" | "ERASE" | "DELETE" | "ZOOMFIT"; args: [] };

function parsePoint(value: string): Point2D | null {
  const parts = value.trim().split(/\s*,\s*/);
  if (parts.length !== 2 || !parts.every((part) => part.length > 0)) return null;
  const [x, y] = parts.map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
/** Examples: LINE 0,0 10,0; RECTANG 0,0 20,15; CIRCLE 5,5 2; WALL 0,0 10,0 0.5 */
export function parseCadCommand(input: string): ParsedCommand {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw new Error("Enter a command. Try LINE, RECTANG, CIRCLE, WALL, UNDO, REDO, DELETE or ZOOM FIT.");
  const raw = parts[0].toUpperCase();
  const name = ({ RECTANG: "RECTANGLE", RECT: "RECTANGLE", ERASE: "ERASE", DEL: "DELETE", ZOOM: "ZOOMFIT" } as Record<string, string>)[raw] ?? raw;
  const point = (i: number) => {
    const p = parsePoint(parts[i] ?? "");
    if (!p) throw new Error(`Invalid point "${parts[i] ?? ""}". Use x,y (for example 10,5).`);
    return p;
  };
  if (name === "UNDO" || name === "REDO" || name === "ERASE" || name === "DELETE" || name === "ZOOMFIT") {
    if (name === "ZOOMFIT" && parts[1]?.toUpperCase() !== "FIT" && parts.length > 1) throw new Error("Use ZOOM FIT.");
    return { name: name as "UNDO" | "REDO" | "ERASE" | "DELETE" | "ZOOMFIT", args: [] };
  }
  if (name === "LINE" || name === "PLINE" || name === "POLYLINE") {
    if (parts.length !== 3) throw new Error("Usage: LINE x1,y1 x2,y2");
    return { name: "LINE", args: [point(1), point(2)] };
  }
  if (name === "RECTANGLE") {
    if (parts.length !== 3) throw new Error("Usage: RECTANG x1,y1 x2,y2");
    return { name: "RECTANGLE", args: [point(1), point(2)] };
  }
  if (name === "CIRCLE") {
    if (parts.length !== 3) throw new Error("Usage: CIRCLE centerX,centerY radius");
    const radius = Number(parts[2]);
    if (!Number.isFinite(radius) || radius <= 0) throw new Error("Circle radius must be a positive number.");
    return { name: "CIRCLE", args: [point(1), radius] };
  }
  if (name === "WALL") {
    if (parts.length !== 4) throw new Error("Usage: WALL x1,y1 x2,y2 thickness");
    const thickness = Number(parts[3]);
    if (!Number.isFinite(thickness) || thickness <= 0) throw new Error("Wall thickness must be a positive number.");
    return { name: "WALL", args: [point(1), point(2), thickness] };
  }
  throw new Error(`Unknown command "${raw}". Try LINE, RECTANG, CIRCLE, WALL, UNDO, REDO, DELETE or ZOOM FIT.`);
}

export function serializeCadDocument(document: CadDocument): string {
  return JSON.stringify(document);
}
export function deserializeCadDocument(serialized: string): CadDocument {
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== "object") throw new Error("Invalid CAD document.");
  const doc = value as CadDocument;
  if (doc.version !== 1 || !Array.isArray(doc.entities) || !Array.isArray(doc.layers)) throw new Error("Unsupported or invalid CAD document format.");
  return doc;
}
