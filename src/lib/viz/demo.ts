import { parseDxfToModel } from "./dxf";
import { sampleDxf } from "./fixtures";

/** Offline sample (a built-in 10×8 m, 3-floor DXF) so the viewer can be tried without uploading anything. */
export function demoModel() {
  const m = parseDxfToModel(sampleDxf(6, 1), { name: "Demo building", floors: 3 }).model;
  m.assumptions.push("DEMO: this is a built-in sample drawing, not your data.");
  return { ...m, walls: m.walls.map((w) => ({ ...w, verified: true })) };
}
