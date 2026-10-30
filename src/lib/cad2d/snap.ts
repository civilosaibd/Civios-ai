import { distance, lineIntersection, polygonVertices, type CadEntity, type Point2D } from "./geometry";

export type SnapMode = "endpoint" | "midpoint" | "intersection" | "center" | "perpendicular";

export type SnapHit = { point: Point2D; mode: SnapMode };

const PRIORITY: SnapMode[] = ["endpoint", "midpoint", "intersection", "center", "perpendicular"];

function segmentPoints(entity: CadEntity): Point2D[][] {
  if (entity.type === "line" || entity.type === "wall") return [[entity.start, entity.end]];
  if (entity.type === "polyline") {
    const segs: Point2D[][] = [];
    for (let i = 0; i < entity.points.length - 1; i++) segs.push([entity.points[i], entity.points[i + 1]]);
    if (entity.closed && entity.points.length > 2) segs.push([entity.points[entity.points.length - 1], entity.points[0]]);
    return segs;
  }
  if (entity.type === "rectangle") {
    const a = entity.min, b = { x: entity.max.x, y: entity.min.y }, c = entity.max, d = { x: entity.min.x, y: entity.max.y };
    return [[a, b], [b, c], [c, d], [d, a]];
  }
  if (entity.type === "polygon") {
    const pts = polygonVertices(entity);
    return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  }
  return [];
}

function closestOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Object snap. Grid snap is applied by the caller only when this returns null. */
export function snapPoint(cursor: Point2D, entities: CadEntity[], modes: SnapMode[], tolerance: number): SnapHit | null {
  if (!Number.isFinite(tolerance) || tolerance < 0) return null;
  const enabled = new Set(modes);
  const hits: SnapHit[] = [];
  const consider = (point: Point2D, mode: SnapMode) => {
    if (!enabled.has(mode)) return;
    if (distance(cursor, point) <= tolerance) hits.push({ point: { ...point }, mode });
  };
  for (const entity of entities) {
    for (const [a, b] of segmentPoints(entity)) {
      consider(a, "endpoint");
      consider(b, "endpoint");
      consider({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "midpoint");
      consider(closestOnSegment(cursor, a, b), "perpendicular");
    }
    if (entity.type === "circle" || entity.type === "arc" || entity.type === "ellipse" || entity.type === "polygon") {
      consider(entity.center, "center");
    }
  }
  if (enabled.has("intersection")) {
    const segs = entities.flatMap(segmentPoints);
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const hit = lineIntersection(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
        if (hit && hit.t >= -1e-8 && hit.t <= 1 + 1e-8 && hit.u >= -1e-8 && hit.u <= 1 + 1e-8) consider(hit.point, "intersection");
      }
    }
  }
  for (const mode of PRIORITY) {
    const match = hits.find((hit) => hit.mode === mode);
    if (match) return match;
  }
  return null;
}
