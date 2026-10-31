import { polygonVertices, distance, type CadEntity, type Point2D, type CadDocument } from "@/lib/cad2d/geometry";

export type DetectedRoom = {
  id: string;
  name: string;
  boundaryType: "rectangle" | "closed-polyline" | "polygon" | "wall-network";
  area: number;
  perimeter: number;
  centroid: Point2D;
};

type Wall = Extract<CadEntity, { type: "wall" }>;
type Segment = { start: Point2D; end: Point2D; splits: number[] };
type GraphEdge = { a: string; b: string };

function polygonMetrics(points: Point2D[]) {
  if (points.length < 3 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
    perimeter += distance(a, b);
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= 1e-9 || perimeter <= 1e-9) return null;
  const signedArea = twiceArea / 2;
  return {
    area: Math.abs(signedArea),
    perimeter,
    centroid: { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) },
    signedArea,
  };
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function addSplit(segment: Segment, t: number) {
  if (t >= -1e-8 && t <= 1 + 1e-8) segment.splits.push(clamp01(t));
}

function splitAtIntersections(first: Segment, second: Segment, epsilon: number) {
  const px = first.start.x, py = first.start.y;
  const rx = first.end.x - px, ry = first.end.y - py;
  const qx = second.start.x, qy = second.start.y;
  const sx = second.end.x - qx, sy = second.end.y - qy;
  const denominator = cross(rx, ry, sx, sy);
  const qpx = qx - px, qpy = qy - py;

  if (Math.abs(denominator) > epsilon) {
    const t = cross(qpx, qpy, sx, sy) / denominator;
    const u = cross(qpx, qpy, rx, ry) / denominator;
    if (t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8) {
      addSplit(first, t);
      addSplit(second, u);
    }
    return;
  }

  // Collinear segments: split at each other's endpoints so duplicate/overlapping
  // wall runs become the same set of elementary graph edges.
  if (Math.abs(cross(qpx, qpy, rx, ry)) > epsilon) return;
  const r2 = rx * rx + ry * ry;
  const s2 = sx * sx + sy * sy;
  if (r2 <= epsilon * epsilon || s2 <= epsilon * epsilon) return;
  addSplit(first, ((qx - px) * rx + (qy - py) * ry) / r2);
  addSplit(first, ((second.end.x - px) * rx + (second.end.y - py) * ry) / r2);
  addSplit(second, ((px - qx) * sx + (py - qy) * sy) / s2);
  addSplit(second, ((first.end.x - qx) * sx + (first.end.y - qy) * sy) / s2);
}

function wallNetworkFaces(entities: CadEntity[]): Array<{ points: Point2D[]; metrics: NonNullable<ReturnType<typeof polygonMetrics>> }> {
  const walls = entities.filter((entity): entity is Wall =>
    entity.type === "wall" &&
    Number.isFinite(entity.start.x) && Number.isFinite(entity.start.y) &&
    Number.isFinite(entity.end.x) && Number.isFinite(entity.end.y) &&
    distance(entity.start, entity.end) > 1e-9,
  );
  // Keep graph construction bounded for unusually large imported drawings.
  if (walls.length < 3 || walls.length > 600) return [];

  const allPoints = walls.flatMap((wall) => [wall.start, wall.end]);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const scale = Math.max(maxX - minX, maxY - minY, 1);
  const epsilon = Math.max(scale * 1e-8, 1e-8);
  const segments: Segment[] = walls.map((wall) => ({ start: wall.start, end: wall.end, splits: [0, 1] }));

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      splitAtIntersections(segments[i], segments[j], epsilon * scale);
    }
  }

  const nodes = new Map<string, Point2D>();
  const edges = new Map<string, GraphEdge>();
  const nodeFor = (point: Point2D) => {
    const x = Math.round(point.x / epsilon);
    const y = Math.round(point.y / epsilon);
    const key = `${x},${y}`;
    if (!nodes.has(key)) nodes.set(key, { x: x * epsilon, y: y * epsilon });
    return key;
  };

  for (const segment of segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const sorted = [...segment.splits].sort((a, b) => a - b);
    const unique = sorted.filter((value, index) => index === 0 || Math.abs(value - sorted[index - 1]) > 1e-8);
    for (let i = 0; i < unique.length - 1; i += 1) {
      const t1 = unique[i], t2 = unique[i + 1];
      if (t2 - t1 <= 1e-8) continue;
      const a = nodeFor({ x: segment.start.x + dx * t1, y: segment.start.y + dy * t1 });
      const b = nodeFor({ x: segment.start.x + dx * t2, y: segment.start.y + dy * t2 });
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!edges.has(key)) edges.set(key, { a, b });
    }
  }

  const outgoing = new Map<string, string[]>();
  for (const edge of edges.values()) {
    outgoing.set(edge.a, [...(outgoing.get(edge.a) ?? []), edge.b]);
    outgoing.set(edge.b, [...(outgoing.get(edge.b) ?? []), edge.a]);
  }
  for (const [origin, neighbors] of outgoing) {
    const point = nodes.get(origin)!;
    neighbors.sort((a, b) => {
      const pa = nodes.get(a)!, pb = nodes.get(b)!;
      return Math.atan2(pa.y - point.y, pa.x - point.x) - Math.atan2(pb.y - point.y, pb.x - point.x);
    });
  }

  const directedKey = (a: string, b: string) => `${a}>${b}`;
  const visited = new Set<string>();
  const faces: Array<{ points: Point2D[]; metrics: NonNullable<ReturnType<typeof polygonMetrics>> }> = [];

  for (const edge of edges.values()) {
    for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]] as const) {
      if (visited.has(directedKey(from, to))) continue;
      let previous = from;
      let current = to;
      const cycle: string[] = [];
      let closed = false;

      for (let step = 0; step < edges.size * 2 + 2; step += 1) {
        const key = directedKey(previous, current);
        if (visited.has(key)) {
          closed = previous === from && current === to;
          break;
        }
        visited.add(key);
        cycle.push(previous);
        const neighbors = outgoing.get(current) ?? [];
        const reverseIndex = neighbors.indexOf(previous);
        if (reverseIndex < 0 || neighbors.length < 2) break;
        const next = neighbors[(reverseIndex - 1 + neighbors.length) % neighbors.length];
        previous = current;
        current = next;
        if (previous === from && current === to) {
          closed = true;
          break;
        }
      }

      if (!closed || cycle.length < 3) continue;
      const points = cycle.map((key) => nodes.get(key)!);
      const metrics = polygonMetrics(points);
      // In this traversal convention bounded faces are counter-clockwise;
      // the clockwise exterior face is intentionally discarded.
      if (!metrics || metrics.signedArea <= epsilon * epsilon) continue;
      faces.push({ points, metrics });
    }
  }
  return faces;
}

/** Detects explicit closed shapes plus bounded faces formed by connected wall centerlines. */
export function detectRooms(entities: CadEntity[]): DetectedRoom[] {
  const explicit = entities.flatMap((entity) => {
    if (entity.type === "rectangle") {
      return [{ entity, boundaryType: "rectangle" as const, points: [entity.min, { x: entity.max.x, y: entity.min.y }, entity.max, { x: entity.min.x, y: entity.max.y }] }];
    }
    if (entity.type === "polyline" && entity.closed) {
      return [{ entity, boundaryType: "closed-polyline" as const, points: entity.points }];
    }
    if (entity.type === "polygon") {
      return [{ entity, boundaryType: "polygon" as const, points: polygonVertices(entity) }];
    }
    return [];
  });

  const rooms: DetectedRoom[] = explicit.flatMap(({ entity, boundaryType, points }) => {
    const metrics = polygonMetrics(points);
    if (!metrics) return [];
    return [{ id: entity.id, name: "", boundaryType, area: metrics.area, perimeter: metrics.perimeter, centroid: metrics.centroid }];
  });

  const wallFaces = wallNetworkFaces(entities);
  for (let index = 0; index < wallFaces.length; index += 1) {
    const face = wallFaces[index];
    const duplicate = rooms.some((room) =>
      Math.abs(room.area - face.metrics.area) <= Math.max(1e-7, face.metrics.area * 1e-7) &&
      distance(room.centroid, face.metrics.centroid) <= 1e-6,
    );
    if (duplicate) continue;
    rooms.push({
      id: `wall-room-${index + 1}-${Math.round(face.metrics.centroid.x * 1e6)}-${Math.round(face.metrics.centroid.y * 1e6)}`,
      name: "",
      boundaryType: "wall-network",
      area: face.metrics.area,
      perimeter: face.metrics.perimeter,
      centroid: face.metrics.centroid,
    });
  }

  return rooms.map((room, index) => ({ ...room, name: `Room ${String(index + 1).padStart(2, "0")}` }));
}

export function formatRoomArea(area: number, units: CadDocument["units"]): string {
  const labels: Record<CadDocument["units"], string> = { mm: "mm²", cm: "cm²", m: "m²", in: "in²", ft: "ft²" };
  return `${area.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${labels[units]}`;
}
