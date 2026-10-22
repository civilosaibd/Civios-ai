import { describe, expect, it } from "vitest";
import { normalizeRasterAnalysis } from "../../../supabase/functions/viz-analyze/normalize";
import { areaFallbackDraft, buildDraft, calibrateDxfByWall, type Setup, type StoredAnalysis } from "./workflow";
import { checkUpload, DEFAULT_LIMITS } from "./validate";
import { summarize, validateModel } from "./model";
import { parseDxfToModel } from "./dxf";
import { sampleDxf } from "./fixtures";

const wall = (a: number[], b: number[], ext = true) => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, exterior: ext, confidence: 0.9 });
const rect = [wall([0.1, 0.1], [0.9, 0.1]), wall([0.9, 0.1], [0.9, 0.9]), wall([0.9, 0.9], [0.1, 0.9]), wall([0.1, 0.9], [0.1, 0.1])];
const mk = (extra: object, type = "floor_plan"): StoredAnalysis => ({
  primary_file_id: "f1",
  files: [{ file_id: "f1", name: "plan.png", width: 1000, height: 1000, analysis: normalizeRasterAnalysis({ drawing_type: type, walls: rect, ...extra }) }],
});
const setup: Setup = { name: "House A", buildingType: "Residential", floors: 2, approxAreaSqft: null, unitSystem: "metric" };
const dim = [{ text: "20'-0\"", value_m: 6.096, a: { x: 0.1, y: 0.05 }, b: { x: 0.9, y: 0.05 }, confidence: 0.9 }];

describe("analysis → draft workflow", () => {
  it("printed dimension → ready, auto-scaled, unverified", () => {
    const d = buildDraft(mk({ dimensions: dim }), setup);
    expect(d.status).toBe("ready");
    if (d.status !== "ready") return;
    expect(d.model.scale.source).toBe("dimensions");
    expect(d.model.name).toBe("House A");
    expect(summarize(d.model).widthM).toBeCloseTo(6.096, 1);
    expect(validateModel(d.model)).toEqual([]);
  });
  it("no printed dimension → asks for calibration, never guesses", () => {
    const d = buildDraft(mk({}), setup);
    expect(d.status).toBe("needs_calibration");
  });
  it("manual calibration wins over everything; units honoured", () => {
    const d = buildDraft(mk({ dimensions: dim }), setup, { calibration: { known: 20, unit: "ft", pixels: 800 } });
    expect(d.status === "ready" && d.model.scale.source).toBe("manual");
    if (d.status === "ready") expect(summarize(d.model).widthM).toBeCloseTo(6.096, 2);
    expect(buildDraft(mk({}), setup, { calibration: { known: -1, unit: "m", pixels: 10 } }).status).toBe("error");
  });
  it("area fallback is labelled AI-inferred", () => {
    const d = areaFallbackDraft(mk({}), { ...setup, floors: 2, approxAreaSqft: 2400 });
    expect(d.status).toBe("ready");
    if (d.status === "ready") { expect(d.scaleLabel).toMatch(/AI-inferred/); expect(d.model.walls.every((w) => w.basis === "estimated")).toBe(true); }
    expect(areaFallbackDraft(mk({}), setup).status).toBe("error");
  });
  it("render → conceptual; needs real/entered width & depth", () => {
    const st = mk({ render_info: { floors: 3, roof: "flat", materials: ["brick"], colors: [], window_count: 6 } }, "render");
    expect(buildDraft(st, { ...setup, floors: null }).status).toBe("needs_dimensions");
    const d = buildDraft(st, { ...setup, floors: null }, { renderDims: { widthM: 12, depthM: 9 } });
    expect(d.status === "ready" && d.model.conceptual).toBe(true);
    if (d.status === "ready") { expect(d.model.floors).toBe(3); expect(d.model.assumptions.join(" ")).toMatch(/confirm/); }
    const viaArea = buildDraft(st, { ...setup, floors: 2, approxAreaSqft: 2000 });
    expect(viaArea.status === "ready" && viaArea.model.assumptions.join(" ")).toMatch(/4:3/);
    expect(buildDraft(st, setup, { renderDims: { widthM: 0.5, depthM: 9 } }).status).toBe("error");
  });
  it("too few walls is an explicit error", () => {
    const st = mk({}); st.files[0].analysis.walls = st.files[0].analysis.walls.slice(0, 2);
    expect(buildDraft(st, setup).status).toBe("error");
  });
});

describe("DXF without units: calibrate by a known wall", () => {
  it("rescales the model so the chosen wall has the stated length", () => {
    const m = parseDxfToModel(sampleDxf(null, 1)).model; // unitless
    expect(m.scale.source).toBe("none");
    const w = [...m.walls].sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y))[0];
    const before = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const c = calibrateDxfByWall(m, w.id, 30, "ft");
    const w2 = c.walls.find((x) => x.id === w.id)!;
    expect(Math.hypot(w2.b.x - w2.a.x, w2.b.y - w2.a.y)).toBeCloseTo(9.144, 3);
    expect(c.scale.source).toBe("manual");
    expect(before).not.toBeCloseTo(9.144, 1);
    expect(() => calibrateDxfByWall(m, "nope", 3, "m")).toThrow();
  });
});

describe("checkUpload", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  it("accepts, and rejects by type / size / count / content", () => {
    expect(checkUpload({ name: "a.png", size: 1000 }, png, DEFAULT_LIMITS, 0).ok).toBe(true);
    expect(checkUpload({ name: "a.exe", size: 1000 }, png, DEFAULT_LIMITS, 0).ok).toBe(false);
    expect(checkUpload({ name: "a.png", size: 26 * 1048576 }, png, DEFAULT_LIMITS, 0)).toMatchObject({ ok: false });
    expect(checkUpload({ name: "a.png", size: 5 * 1048576 }, png, { maxFileMb: 4, maxFiles: 10 }, 0).ok).toBe(false); // admin-configurable
    expect(checkUpload({ name: "a.png", size: 10 }, png, DEFAULT_LIMITS, 10).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: 10 }, png, DEFAULT_LIMITS, 0).ok).toBe(false);
    expect(checkUpload({ name: "a.png", size: 0 }, png, DEFAULT_LIMITS, 0).ok).toBe(false);
  });
});

import { confirmAll, explain, removeElement, renameRoom, setColumnSize, setFloorHeight, setFloors, setOverallSize, setWallThickness } from "./edit";
describe("verification edits", () => {
  const base = () => { const d = buildDraft(mk({ dimensions: dim, labels: [{ text: "Bed", at: { x: 0.5, y: 0.5 }, confidence: 0.9 }], columns: [{ c: { x: 0.1, y: 0.1 }, w_rel: 0.02, confidence: 0.4 }] }), setup); if (d.status !== "ready") throw new Error("x"); return d.model; };
  it("edits validate input and mark the values as user-provided", () => {
    const m = base();
    expect(setFloors(m, 4).floors).toBe(4);
    expect(() => setFloors(m, 0)).toThrow(); expect(() => setFloors(m, 2.5)).toThrow();
    expect(setFloorHeight(m, 3.2).floorHeight).toEqual({ value: 3.2, basis: "user" });
    expect(() => setFloorHeight(m, 9)).toThrow();
    const t = setWallThickness(m, true, 0.3);
    expect(t.walls.filter((w) => w.exterior).every((w) => w.thickness === 0.3 && w.source === "user")).toBe(true);
    expect(() => setWallThickness(m, true, 5)).toThrow();
    expect(setColumnSize(m, 0.4).columns[0].size).toBe(0.4); expect(() => setColumnSize(m, 0.01)).toThrow();
    expect(renameRoom(m, m.rooms[0].id, "Master Bed").rooms[0].name).toBe("Master Bed");
  });
  it("removing a wall updates the footprint; removing a false column works", () => {
    const m = base(); const n = removeElement(m, "column", m.columns[0].id);
    expect(n.columns.length).toBe(0);
    expect(removeElement(m, "wall", m.walls[0].id).walls.length).toBe(m.walls.length - 1);
  });
  it("overall size keeps wall thickness and records the assumption", () => {
    const m = base(); const s = setOverallSize(m, 12, 9);
    const sm = summarize(s); expect(sm.widthM).toBeCloseTo(12, 2); expect(sm.depthM).toBeCloseTo(9, 2);
    expect(s.walls[0].thickness).toBe(m.walls[0].thickness);
    expect(() => setOverallSize(m, 1, 9)).toThrow();
  });
  it("confirm marks everything verified; explain separates facts from assumptions", () => {
    const m = confirmAll(base());
    expect(m.walls.every((w) => w.verified)).toBe(true);
    const e = explain(m);
    expect(e.facts.join(" ")).toMatch(/printed on your drawing/); expect(e.assumed.join(" ")).toMatch(/placeholders/);
  });
});
