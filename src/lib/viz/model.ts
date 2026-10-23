import { DEFAULTS, confidenceLabel, type BuildingModel, type Column, type ConfidenceLabel, type FloorRef, type Pt, type Tracked } from "./types";

let seq = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyModel(name = "Untitled"): BuildingModel {
  return {
    version: 1, name, buildingType: "Residential", unitSystem: "metric", sourceType: "manual", conceptual: false,
    floors: 1, floorHeight: { value: DEFAULTS.floorHeight, basis: "estimated" }, slabThickness: DEFAULTS.slab,
    scale: { source: "none" }, footprint: { points: [], basis: "estimated" },
    walls: [], doors: [], windows: [], columns: [], stairs: [], balconies: [], rooms: [],
    roof: { type: "flat", parapet: DEFAULTS.parapet, basis: "estimated" },
    materials: { structure: "Reinforced concrete", exterior: "Paint" },
    assumptions: [], warnings: [],
  };
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: Pt[] = [];
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

export function bounds(pts: Pt[]) {
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, d: 0 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, d: maxY - minY };
}

/** Footprint = convex hull of exterior wall ends (all walls when none is flagged exterior). Marked "estimated". */
export function deriveFootprint(m: BuildingModel): Pt[] {
  const src = m.walls.filter((w) => w.exterior);
  const walls = src.length >= 3 ? src : m.walls;
  return convexHull(walls.flatMap((w) => [w.a, w.b]));
}

/** Move the model so its footprint min corner is at the origin (keeps numbers small for rendering). */
export function recenter(m: BuildingModel): BuildingModel {
  const pts = [...m.walls.flatMap((w) => [w.a, w.b]), ...m.columns.map((c) => c.c)];
  if (!pts.length) return m;
  const b = bounds(pts);
  const sh = (p: Pt): Pt => ({ x: p.x - b.minX, y: p.y - b.minY });
  return {
    ...m,
    walls: m.walls.map((w) => ({ ...w, a: sh(w.a), b: sh(w.b) })),
    doors: m.doors.map((o) => ({ ...o, c: sh(o.c) })), windows: m.windows.map((o) => ({ ...o, c: sh(o.c) })),
    columns: m.columns.map((c) => ({ ...c, c: sh(c.c) })), stairs: m.stairs.map((s) => ({ ...s, c: sh(s.c) })),
    balconies: m.balconies.map((s) => ({ ...s, c: sh(s.c) })), rooms: m.rooms.map((r) => ({ ...r, c: sh(r.c) })),
    footprint: { ...m.footprint, points: m.footprint.points.map(sh) },
  };
}

/** Uniformly rescale plan geometry (used by "set overall width/depth"). */
export function scaleModel(m: BuildingModel, fx: number, fy: number): BuildingModel {
  const s = (p: Pt): Pt => ({ x: p.x * fx, y: p.y * fy });
  const fm = Math.sqrt(fx * fy);
  return {
    ...m,
    walls: m.walls.map((w) => ({ ...w, a: s(w.a), b: s(w.b) })),
    doors: m.doors.map((o) => ({ ...o, c: s(o.c) })), windows: m.windows.map((o) => ({ ...o, c: s(o.c) })),
    columns: m.columns.map((c) => ({ ...c, c: s(c.c) })),
    stairs: m.stairs.map((x) => ({ ...x, c: s(x.c), w: x.w * fx, d: x.d * fy })),
    balconies: m.balconies.map((x) => ({ ...x, c: s(x.c), w: x.w * fx, d: x.d * fy })),
    rooms: m.rooms.map((r) => ({ ...r, c: s(r.c) })),
    footprint: { ...m.footprint, points: m.footprint.points.map(s) },
    scale: m.scale.metersPerPixel ? { ...m.scale, metersPerPixel: m.scale.metersPerPixel * fm, source: "manual" } : m.scale,
  };
}

/** Keep columns vertically aligned unless the source says otherwise: every column is "all" floors. */
export const alignColumns = (cols: Column[]): Column[] => cols.map((c) => ({ ...c, floor: "all" as FloorRef }));

const onFloor = (f: FloorRef, i: number) => f === "all" || f === i;

export interface ModelSummary {
  floors: number; rooms: number; walls: number; columns: number; doors: number; windows: number; stairs: number; balconies: number;
  footprintM2: number; totalFloorAreaM2: number; heightM: number; widthM: number; depthM: number;
  avgConfidence: Record<string, number>;
  lowConfidence: { type: string; id: string; confidence: number }[];
}

export function summarize(m: BuildingModel): ModelSummary {
  const fp = m.footprint.points.length ? m.footprint.points : deriveFootprint(m);
  const b = bounds(fp);
  const footprintM2 = polygonArea(fp);
  const per = (arr: Tracked[]) => (arr.length ? arr.reduce((s, x) => s + x.confidence, 0) / arr.length : 0);
  const low: ModelSummary["lowConfidence"] = [];
  const scan = (type: string, arr: Tracked[]) => arr.forEach((x) => { if (confidenceLabel(x.confidence) === "low" && !x.verified) low.push({ type, id: x.id, confidence: x.confidence }); });
  scan("wall", m.walls); scan("door", m.doors); scan("window", m.windows); scan("column", m.columns); scan("stair", m.stairs); scan("room", m.rooms);
  return {
    floors: m.floors, rooms: m.rooms.filter((r) => onFloor(r.floor, 0)).length, walls: m.walls.length,
    columns: m.columns.length, doors: m.doors.length, windows: m.windows.length, stairs: m.stairs.length, balconies: m.balconies.length,
    footprintM2, totalFloorAreaM2: footprintM2 * m.floors, heightM: m.floors * m.floorHeight.value + m.roof.parapet,
    widthM: b.w, depthM: b.d,
    avgConfidence: { walls: per(m.walls), doors: per(m.doors), windows: per(m.windows), columns: per(m.columns), stairs: per(m.stairs), rooms: per(m.rooms) },
    lowConfidence: low,
  };
}

export const labelOf = (c: number): ConfidenceLabel => confidenceLabel(c);

/** Light structural validation. Returns human-readable problems (empty = OK to generate). */
export function validateModel(m: BuildingModel): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(m.floors) || m.floors < 1 || m.floors > 40) errs.push("Floor count must be a whole number between 1 and 40.");
  if (!(m.floorHeight.value >= 2 && m.floorHeight.value <= 6)) errs.push("Floor height must be between 2 m and 6 m.");
  if (m.sourceType !== "render" && !m.conceptual && m.walls.length < 3) errs.push("At least 3 walls are needed to form a building. Add walls or upload a clearer plan.");
  if (m.sourceType !== "render" && m.scale.source === "none") errs.push("The drawing is not calibrated. Enter at least one known dimension.");
  if (m.footprint.points.length < 3) errs.push("The building footprint could not be determined.");
  for (const w of m.walls) if (!(w.thickness >= 0.05 && w.thickness <= 1)) { errs.push(`Wall ${w.id} has an invalid thickness.`); break; }
  const b = bounds(m.footprint.points);
  if (b.w > 300 || b.d > 300) errs.push("Footprint is larger than 300 m — the scale is probably wrong. Re-calibrate the drawing.");
  if (b.w > 0 && (b.w < 2 || b.d < 2)) errs.push("Footprint is smaller than 2 m — the scale is probably wrong. Re-calibrate the drawing.");
  return errs;
}
