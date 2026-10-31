import { distance, lineIntersection, type CadEntity, type Point2D } from "./geometry";

type Wall = Extract<CadEntity, { type: "wall" }>;

function projectToSegment(point: Point2D, wall: Wall): Point2D {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return { ...wall.start };
  const t = Math.max(0, Math.min(1,
    ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared,
  ));
  return { x: wall.start.x + t * dx, y: wall.start.y + t * dy };
}

/**
 * Finds a nearby point on the existing wall network.
 * Junctions/intersections take precedence over a nearby single-wall projection
 * so a snapped endpoint remains connected to the complete wall network.
 * It never mutates existing wall entities.
 */
export function snapPointToWallNetwork(
  point: Point2D,
  entities: CadEntity[],
  tolerance: number,
): Point2D | null {
  if (!Number.isFinite(tolerance) || tolerance < 0) return null;
  const walls = entities.filter((entity): entity is Wall =>
    entity.type === "wall" &&
    Number.isFinite(entity.thickness) && entity.thickness > 0 &&
    distance(entity.start, entity.end) > 1e-9,
  );
  if (!walls.length) return null;

  const junctionCandidates: Point2D[] = [];
  for (let i = 0; i < walls.length; i += 1) {
    for (let j = i + 1; j < walls.length; j += 1) {
      const first = walls[i], second = walls[j];
      const hit = lineIntersection(first.start, first.end, second.start, second.end);
      if (!hit || hit.t < -1e-8 || hit.t > 1 + 1e-8 || hit.u < -1e-8 || hit.u > 1 + 1e-8) continue;
      if (distance(point, hit.point) <= tolerance) junctionCandidates.push(hit.point);
    }
  }

  const candidates: Point2D[] = [];
  for (const wall of walls) {
    const projected = projectToSegment(point, wall);
    if (distance(point, projected) <= tolerance) candidates.push(projected);
    if (distance(point, wall.start) <= tolerance) candidates.push({ ...wall.start });
    if (distance(point, wall.end) <= tolerance) candidates.push({ ...wall.end });
  }

  // Prefer a nearby network junction to a closer projection onto only one wall.
  const preferredCandidates = junctionCandidates.length ? junctionCandidates : candidates;
  let nearest: Point2D | null = null;
  let bestDistance = tolerance + 1e-9;
  for (const candidate of preferredCandidates) {
    const candidateDistance = distance(point, candidate);
    if (candidateDistance < bestDistance) {
      nearest = candidate;
      bestDistance = candidateDistance;
    }
  }
  return nearest ? { ...nearest } : null;
}
