import { distance, type CadEntity, type Point2D } from "./geometry";

type Wall = Extract<CadEntity, { type: "wall" }>;
type Opening = Extract<CadEntity, { type: "door" | "window" }>;
export type WallOpeningPlacement = Pick<Opening, "at" | "width" | "rotation"> & { wallId: string };
export type WallSegment = { start: Point2D; end: Point2D };

function project(point: Point2D, start: Point2D, end: Point2D) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  )) : 0;
  return { point: { x: start.x + t * dx, y: start.y + t * dy }, t, length: Math.sqrt(lengthSquared) };
}

function isOpeningOnWall(wall: Wall, opening: Opening) {
  const wallLength = distance(wall.start, wall.end);
  const openingLength = distance(
    { x: opening.at.x - Math.cos(opening.rotation) * opening.width / 2, y: opening.at.y - Math.sin(opening.rotation) * opening.width / 2 },
    { x: opening.at.x + Math.cos(opening.rotation) * opening.width / 2, y: opening.at.y + Math.sin(opening.rotation) * opening.width / 2 },
  );
  if (wallLength <= 1e-9 || openingLength <= 1e-9) return null;
  const ux = (wall.end.x - wall.start.x) / wallLength;
  const uy = (wall.end.y - wall.start.y) / wallLength;
  const ox = Math.cos(opening.rotation), oy = Math.sin(opening.rotation);
  if (Math.abs(ux * oy - uy * ox) > 0.12) return null;
  const projected = project(opening.at, wall.start, wall.end);
  const perpendicularDistance = distance(opening.at, projected.point);
  if (perpendicularDistance > Math.max(wall.thickness / 2 + 0.05, 0.1)) return null;
  const half = opening.width / 2;
  const center = projected.t * wallLength;
  const from = Math.max(0, center - half), to = Math.min(wallLength, center + half);
  if (to - from <= 1e-6) return null;
  return { from, to, ux, uy, wallLength };
}

/** Aligns a newly drawn door/window to the nearest wall when placed close enough. */
export function fitOpeningToNearestWall(
  at: Point2D,
  width: number,
  walls: CadEntity[],
  tolerance: number,
): WallOpeningPlacement | null {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(tolerance) || tolerance < 0) return null;
  let best: WallOpeningPlacement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entity of walls) {
    if (entity.type !== "wall" || !Number.isFinite(entity.thickness) || entity.thickness <= 0) continue;
    const projected = project(at, entity.start, entity.end);
    if (projected.length <= 1e-9 || projected.t <= 0 || projected.t >= 1) continue;
    const gap = distance(at, projected.point);
    if (gap > tolerance + entity.thickness / 2 || gap >= bestDistance) continue;
    const fittedWidth = Math.min(width, Math.max(0, projected.length - 0.02));
    if (fittedWidth <= 0.02) continue;
    best = {
      at: projected.point,
      width: fittedWidth,
      rotation: Math.atan2(entity.end.y - entity.start.y, entity.end.x - entity.start.x),
      wallId: entity.id,
    };
    bestDistance = gap;
  }
  return best;
}

/** Returns wall centerline pieces after subtracting all aligned door/window openings. */
export function getWallVisibleSegments(wall: Wall, entities: CadEntity[]): WallSegment[] {
  const length = distance(wall.start, wall.end);
  if (length <= 1e-9) return [];
  const ux = (wall.end.x - wall.start.x) / length;
  const uy = (wall.end.y - wall.start.y) / length;
  const intervals = entities
    .filter((entity): entity is Opening => entity.type === "door" || entity.type === "window")
    .map((opening) => isOpeningOnWall(wall, opening))
    .filter((interval): interval is NonNullable<typeof interval> => interval !== null)
    .sort((a, b) => a.from - b.from);

  if (!intervals.length) return [{ start: { ...wall.start }, end: { ...wall.end } }];
  const merged: Array<{ from: number; to: number }> = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.from <= last.to + 1e-6) last.to = Math.max(last.to, interval.to);
    else merged.push({ from: interval.from, to: interval.to });
  }

  const segments: WallSegment[] = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.from - cursor > 1e-6) {
      segments.push({
        start: { x: wall.start.x + ux * cursor, y: wall.start.y + uy * cursor },
        end: { x: wall.start.x + ux * interval.from, y: wall.start.y + uy * interval.from },
      });
    }
    cursor = Math.max(cursor, interval.to);
  }
  if (length - cursor > 1e-6) {
    segments.push({
      start: { x: wall.start.x + ux * cursor, y: wall.start.y + uy * cursor },
      end: { ...wall.end },
    });
  }
  return segments;
}
