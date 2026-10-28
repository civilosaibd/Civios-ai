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
  | (BaseEntity & { type: "wall"; start: Point2D; end: Point2D; thickness: number })
  | (BaseEntity & { type: "text"; at: Point2D; text: string; height: number; rotation: number });

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
    else if (e.type === "arc") {
      candidates.push(
        { x: e.center.x + e.radius * Math.cos(e.startAngle), y: e.center.y + e.radius * Math.sin(e.startAngle) },
        { x: e.center.x + e.radius * Math.cos(e.endAngle), y: e.center.y + e.radius * Math.sin(e.endAngle) },
      );
    }
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
    case "text": return { ...entity, at: move(entity.at) };
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
      // Preserve entity metadata (notably locked state) when the rectangle becomes a polyline.
      return { id: entity.id, layerId: entity.layerId, locked: entity.locked, type: "polyline", points: pts, closed: true };
    }
    case "circle": case "ellipse": return { ...entity, center: rotate(entity.center) };
    case "text": return { ...entity, at: rotate(entity.at), rotation: entity.rotation + angleRadians };
    case "arc": return { ...entity, center: rotate(entity.center), startAngle: entity.startAngle + angleRadians, endAngle: entity.endAngle + angleRadians };
  }
}
export function mirrorEntity(entity: CadEntity, axisX: number): CadEntity {
  const mirror = (p: Point2D): Point2D => ({ x: 2 * axisX - p.x, y: p.y });
  switch (entity.type) {
    case "line":
    case "wall":
      return { ...entity, start: mirror(entity.start), end: mirror(entity.end) };
    case "polyline":
      return { ...entity, points: entity.points.map(mirror) };
    case "rectangle": {
      const a = mirror(entity.min);
      const b = mirror(entity.max);
      return { ...entity, min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } };
    }
    case "circle":
    case "ellipse":
      return { ...entity, center: mirror(entity.center) };
    case "text":
      return { ...entity, at: mirror(entity.at), rotation: -entity.rotation };
    case "arc":
      return { ...entity, center: mirror(entity.center), startAngle: Math.PI - entity.startAngle, endAngle: Math.PI - entity.endAngle };
  }
}
/**
 * Offset supported 2D entities by a signed distance. Positive distance is to
 * the left of a line's direction; for circles/arcs it increases the radius.
 * Polyline vertices are computed from adjacent offset-line intersections.
 */
export function offsetEntity(entity: CadEntity, amount: number): CadEntity {
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Offset distance must be a finite non-zero number.");
  const offsetSegment = (a: Point2D, b: Point2D) => {
    const length = distance(a, b);
    if (length < 1e-9) throw new Error("Cannot offset a zero-length segment.");
    const n = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    return { a: { x: a.x + n.x * amount, y: a.y + n.y * amount }, b: { x: b.x + n.x * amount, y: b.y + n.y * amount } };
  };
  if (entity.type === "line" || entity.type === "wall") {
    const shifted = offsetSegment(entity.start, entity.end);
    return { ...entity, start: shifted.a, end: shifted.b };
  }
  if (entity.type === "circle" || entity.type === "arc") {
    const radius = entity.radius + amount;
    if (radius <= 0) throw new Error("Offset would create a zero or negative radius.");
    return { ...entity, radius };
  }
  if (entity.type === "text") {
    throw new Error("Text annotations cannot be offset. Change the text position or height instead.");
  }
  if (entity.type === "ellipse") {
    const rx = entity.rx + amount, ry = entity.ry + amount;
    if (rx <= 0 || ry <= 0) throw new Error("Offset would create a zero or negative ellipse radius.");
    return { ...entity, rx, ry };
  }
  if (entity.type === "rectangle") {
    const { min, max } = entity;
    const width = max.x - min.x, height = max.y - min.y;
    if (width <= 0 || height <= 0) throw new Error("Cannot offset a degenerate rectangle.");
    // Positive offsets inset the rectangle; negative offsets expand it outward.
    const nextMin = { x: min.x + amount, y: min.y + amount };
    const nextMax = { x: max.x - amount, y: max.y - amount };
    if (nextMin.x >= nextMax.x || nextMin.y >= nextMax.y) throw new Error("Offset is larger than the rectangle.");
    return { ...entity, min: nextMin, max: nextMax };
  }
  if (entity.points.length < 2) throw new Error("Polyline needs at least two vertices.");
  const points = entity.points;
  const segmentCount = entity.closed ? points.length : points.length - 1;
  const shiftedSegments = Array.from({ length: segmentCount }, (_, i) => offsetSegment(points[i], points[(i + 1) % points.length]));
  const intersect = (a: Point2D, b: Point2D, c: Point2D, d: Point2D): Point2D | null => {
    const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
    const cross = r.x * s.y - r.y * s.x;
    if (Math.abs(cross) < 1e-9) return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / cross;
    return { x: a.x + t * r.x, y: a.y + t * r.y };
  };
  const out = points.map((point, i) => {
    if (!entity.closed && i === 0) return shiftedSegments[0].a;
    if (!entity.closed && i === points.length - 1) return shiftedSegments[shiftedSegments.length - 1].b;
    const prev = shiftedSegments[(i - 1 + segmentCount) % segmentCount];
    const next = shiftedSegments[i % segmentCount];
    return intersect(prev.a, prev.b, next.a, next.b) ?? { ...next.a };
  });
  if (out.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error("Offset produced invalid geometry.");
  return { ...entity, points: out };
}

function lineIntersection(a: Point2D, b: Point2D, c: Point2D, d: Point2D): { point: Point2D; t: number; u: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / cross;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / cross;
  return { point: { x: a.x + t * r.x, y: a.y + t * r.y }, t, u };
}

/** Trim a straight segment at a point on its existing extent, removing the nearer end. */
export function trimLineAtPoint<T extends Extract<CadEntity, { type: "line" | "wall" }>>(entity: T, point: Point2D): T {
  const dx = entity.end.x - entity.start.x, dy = entity.end.y - entity.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) throw new Error("Cannot trim a zero-length line.");
  const t = ((point.x - entity.start.x) * dx + (point.y - entity.start.y) * dy) / lengthSquared;
  if (t <= 1e-6 || t >= 1 - 1e-6) throw new Error("Trim point must lie inside the line segment.");
  const projected = { x: entity.start.x + t * dx, y: entity.start.y + t * dy };
  if (distance(projected, point) > Math.sqrt(lengthSquared) * 1e-4 + 1e-6) throw new Error("Trim point must lie on the line.");
  return t < 0.5 ? { ...entity, start: projected } : { ...entity, end: projected };
}

/** Extend a line/wall to meet a finite straight boundary, only when the hit lies beyond an endpoint. */
export function extendLineToBoundary<T extends Extract<CadEntity, { type: "line" | "wall" }>>(entity: T, boundary: Extract<CadEntity, { type: "line" | "wall" }>): T {
  const hit = lineIntersection(entity.start, entity.end, boundary.start, boundary.end);
  if (!hit || hit.u < -1e-8 || hit.u > 1 + 1e-8 || (hit.t >= -1e-8 && hit.t <= 1 + 1e-8)) {
    throw new Error("No valid extension intersection with the boundary.");
  }
  return hit.t < 0 ? { ...entity, start: hit.point } : { ...entity, end: hit.point };
}

/** Create a straight chamfer between two finite line segments sharing an endpoint corner. */
export function chamferLines(
  first: Extract<CadEntity, { type: "line" }>,
  second: Extract<CadEntity, { type: "line" }>,
  distanceFromCorner: number,
): { first: typeof first; second: typeof second; connector: Extract<CadEntity, { type: "line" }> } {
  if (!Number.isFinite(distanceFromCorner) || distanceFromCorner <= 0) {
    throw new Error("Chamfer distance must be a positive finite number.");
  }
  const hit = lineIntersection(first.start, first.end, second.start, second.end);
  if (!hit || hit.t < -1e-8 || hit.t > 1 + 1e-8 || hit.u < -1e-8 || hit.u > 1 + 1e-8) {
    throw new Error("Chamfer requires two finite line segments that intersect.");
  }
  const pointAwayFromCorner = (line: typeof first, parameter: number) => {
    const atStart = distance(line.start, hit.point) < 1e-7;
    const atEnd = distance(line.end, hit.point) < 1e-7;
    if (atStart === atEnd) throw new Error("Chamfer currently requires the lines to share an endpoint corner.");
    const far = atStart ? line.end : line.start;
    const length = distance(far, hit.point);
    if (length < 1e-9) throw new Error("Cannot chamfer a zero-length line.");
    if (distanceFromCorner >= length - 1e-8) {
      throw new Error("Chamfer distance must be shorter than both line segments.");
    }
    return {
      point: {
        x: hit.point.x + ((far.x - hit.point.x) / length) * distanceFromCorner,
        y: hit.point.y + ((far.y - hit.point.y) / length) * distanceFromCorner,
      },
      trimStart: atStart,
    };
  };
  const a = pointAwayFromCorner(first, hit.t);
  const b = pointAwayFromCorner(second as typeof first, hit.u);
  const trim = (line: typeof first, point: Point2D, trimStart: boolean) =>
    trimStart ? { ...line, start: point } : { ...line, end: point };
  return {
    first: trim(first, a.point, a.trimStart),
    second: trim(second as typeof first, b.point, b.trimStart) as typeof second,
    connector: { id: "", layerId: first.layerId, type: "line", start: a.point, end: b.point },
  };
}

export function entityBounds(entity: CadEntity): { min: Point2D; max: Point2D } {
  if (entity.type === "circle" || entity.type === "arc") {
    const r = entity.radius;
    return { min: { x: entity.center.x - r, y: entity.center.y - r }, max: { x: entity.center.x + r, y: entity.center.y + r } };
  }
  if (entity.type === "ellipse") {
    return {
      min: { x: entity.center.x - entity.rx, y: entity.center.y - entity.ry },
      max: { x: entity.center.x + entity.rx, y: entity.center.y + entity.ry },
    };
  }
  if (entity.type === "text") {
    const width = Math.max(entity.height * 0.6, entity.text.length * entity.height * 0.6);
    const corners = [
      { x: 0, y: -entity.height },
      { x: width, y: -entity.height },
      { x: width, y: entity.height * 0.25 },
      { x: 0, y: entity.height * 0.25 },
    ].map((point) => ({
      x: entity.at.x + point.x * Math.cos(entity.rotation) - point.y * Math.sin(entity.rotation),
      y: entity.at.y + point.x * Math.sin(entity.rotation) + point.y * Math.cos(entity.rotation),
    }));
    return corners.reduce((bounds, point) => ({
      min: { x: Math.min(bounds.min.x, point.x), y: Math.min(bounds.min.y, point.y) },
      max: { x: Math.max(bounds.max.x, point.x), y: Math.max(bounds.max.y, point.y) },
    }), { min: { ...corners[0] }, max: { ...corners[0] } });
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
