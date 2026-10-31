import { polygonVertices, type CadEntity, type Point2D, type CadDocument } from "@/lib/cad2d/geometry";

export type DetectedRoom = {
  id: string;
  name: string;
  boundaryType: "rectangle" | "closed-polyline" | "polygon";
  area: number;
  perimeter: number;
  centroid: Point2D;
};

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
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= 1e-9 || perimeter <= 1e-9) return null;
  const signedArea = twiceArea / 2;
  return {
    area: Math.abs(signedArea),
    perimeter,
    centroid: { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) },
  };
}

/** Detects only explicitly closed planar boundaries; it does not infer rooms from intersecting walls. */
export function detectRooms(entities: CadEntity[]): DetectedRoom[] {
  const candidates = entities.flatMap((entity) => {
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

  return candidates.flatMap(({ entity, boundaryType, points }, index) => {
    const metrics = polygonMetrics(points);
    if (!metrics) return [];
    return [{ id: entity.id, name: `Room ${String(index + 1).padStart(2, "0")}`, boundaryType, ...metrics }];
  });
}

export function formatRoomArea(area: number, units: CadDocument["units"]): string {
  const labels: Record<CadDocument["units"], string> = { mm: "mm²", cm: "cm²", m: "m²", in: "in²", ft: "ft²" };
  return `${area.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${labels[units]}`;
}
