// Pure, immutable edit operations used by the verification screen. Every user edit flips the touched
// values to source="user" / basis="user" so reports can separate "detected" from "you confirmed".
import type { BuildingModel, Tracked } from "./types";
import { bounds, deriveFootprint, scaleModel } from "./model";

export type ElType = "wall" | "door" | "window" | "column" | "stair" | "balcony" | "room";
const KEY: Record<ElType, "walls" | "doors" | "windows" | "columns" | "stairs" | "balconies" | "rooms"> = { wall: "walls", door: "doors", window: "windows", column: "columns", stair: "stairs", balcony: "balconies", room: "rooms" };
const touch = <T extends Tracked>(x: T): T => ({ ...x, source: "user", basis: "user", confidence: Math.max(x.confidence, 0.9) });

export const setFloors = (m: BuildingModel, n: number): BuildingModel => {
  if (!Number.isInteger(n) || n < 1 || n > 40) throw new Error("Floor count must be a whole number between 1 and 40.");
  return { ...m, floors: n };
};
export const setFloorHeight = (m: BuildingModel, v: number): BuildingModel => {
  if (!(v >= 2 && v <= 6)) throw new Error("Floor height must be between 2 m and 6 m.");
  return { ...m, floorHeight: { value: v, basis: "user" } };
};
export const setWallThickness = (m: BuildingModel, exterior: boolean, t: number): BuildingModel => {
  if (!(t >= 0.05 && t <= 1)) throw new Error("Wall thickness must be between 5 cm and 100 cm.");
  return { ...m, walls: m.walls.map((w) => (w.exterior === exterior ? { ...touch(w), thickness: t } : w)) };
};
export const setColumnSize = (m: BuildingModel, s: number): BuildingModel => {
  if (!(s >= 0.15 && s <= 1.5)) throw new Error("Column size must be between 15 cm and 150 cm.");
  return { ...m, columns: m.columns.map((c) => ({ ...touch(c), size: s })) };
};
export const removeElement = (m: BuildingModel, type: ElType, id: string): BuildingModel => {
  const k = KEY[type];
  const next = { ...m, [k]: (m[k] as Tracked[]).filter((x) => x.id !== id) } as BuildingModel;
  if (type === "wall") next.footprint = { points: deriveFootprint(next), basis: "estimated" };
  return next;
};
export const renameRoom = (m: BuildingModel, id: string, name: string): BuildingModel => ({ ...m, rooms: m.rooms.map((r) => (r.id === id ? { ...touch(r), name: name.slice(0, 40) } : r)) });
export const setRoof = (m: BuildingModel, type: "flat" | "gable", parapet = m.roof.parapet): BuildingModel => ({ ...m, roof: { type, parapet, basis: "user" } });
export const setMaterials = (m: BuildingModel, p: Partial<BuildingModel["materials"]>): BuildingModel => ({ ...m, materials: { ...m.materials, ...p } });

/** Stretch the plan to a confirmed overall width / depth (metres). */
export function setOverallSize(m: BuildingModel, widthM: number, depthM: number): BuildingModel {
  const b = bounds(m.footprint.points.length ? m.footprint.points : deriveFootprint(m));
  if (!(b.w > 0 && b.d > 0)) throw new Error("Footprint is unknown.");
  if (!(widthM >= 2 && depthM >= 2 && widthM <= 300 && depthM <= 300)) throw new Error("Overall size must be between 2 m and 300 m.");
  const s = scaleModel(m, widthM / b.w, depthM / b.d);
  // wall thickness / opening sizes are NOT stretched with the plan
  return { ...s, walls: s.walls.map((w, i) => ({ ...w, thickness: m.walls[i].thickness })), scale: { ...s.scale, source: "manual" },
    assumptions: [...m.assumptions, `Overall size was set by you to ${widthM.toFixed(2)} × ${depthM.toFixed(2)} m.`] };
}

/** The user pressed "Confirm": every remaining element has been reviewed. */
export function confirmAll(m: BuildingModel): BuildingModel {
  const v = <T extends Tracked>(a: T[]) => a.map((x) => ({ ...x, verified: true }));
  return { ...m, walls: v(m.walls), doors: v(m.doors), windows: v(m.windows), columns: v(m.columns), stairs: v(m.stairs), balconies: v(m.balconies), rooms: v(m.rooms) };
}

export function listElements(m: BuildingModel, type: ElType): Tracked[] { return m[KEY[type]] as Tracked[]; }

/** Facts that came from the drawing vs. values the system assumed — for the "Explain this model" panel. */
export function explain(m: BuildingModel) {
  const all = [...m.walls, ...m.doors, ...m.windows, ...m.columns, ...m.stairs, ...m.balconies, ...m.rooms];
  const by = (s: string) => all.filter((x) => x.source === s).length;
  const facts: string[] = [];
  if (m.scale.source === "dxf") facts.push("Geometry and scale were read from your DXF file.");
  if (m.scale.source === "dimensions") facts.push("Scale was computed from dimensions printed on your drawing.");
  if (m.scale.source === "manual") facts.push("Scale was set from the dimension you entered.");
  if (by("vision")) facts.push(`${by("vision")} elements were traced from the image by AI (not CAD-exact).`);
  if (by("dxf")) facts.push(`${by("dxf")} elements come directly from CAD entities.`);
  if (by("user")) facts.push(`${by("user")} elements were edited/confirmed by you.`);
  facts.push(`${m.floors} floor(s), ${m.walls.length} walls, ${m.columns.length} columns, ${m.doors.length} doors, ${m.windows.length} windows.`);
  const assumed: string[] = [...m.assumptions];
  if (m.floorHeight.basis === "estimated" && !assumed.some((a) => /floor height/i.test(a))) assumed.push(`Floor height ${m.floorHeight.value} m is a default (estimated).`);
  if (m.footprint.basis === "estimated") assumed.push("Building footprint is derived from the wall outline (convex hull) — concave shapes such as L-plans are filled in.");
  assumed.push("Beams, footings, plinth, parapet and slab thicknesses are generic placeholders, not a structural design.");
  return { facts, assumed: Array.from(new Set(assumed)), warnings: m.warnings };
}
