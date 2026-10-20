import { describe, expect, it } from "vitest";
import { calibrate, convert, dxfUnitFromInsUnits, parseDimensionText, scaleFromDimensions, sqmToSqft, toMeters } from "./units";
import { parseDxfToModel } from "./dxf";
import { convexHull, polygonArea, summarize, validateModel, scaleModel, emptyModel } from "./model";
import { buildScene, countByKind } from "./geometry";
import { autoScale, massingFromRender, mppFromArea, rasterToModel } from "./fromRaster";
import { fileKind, normalizeRasterAnalysis, sniffMatches } from "../../../supabase/functions/viz-analyze/normalize";
import { confidenceLabel } from "./types";
import { sampleDxf } from "./fixtures";

describe("units & calibration", () => {
  it("converts accurately between all supported units", () => {
    expect(toMeters(10, "ft")).toBeCloseTo(3.048, 6);
    expect(convert(1, "m", "mm")).toBe(1000);
    expect(convert(12, "in", "ft")).toBeCloseTo(1, 9);
    expect(convert(300, "cm", "m")).toBe(3);
    expect(sqmToSqft(100)).toBeCloseTo(1076.391, 2);
  });
  it("manual calibration: known 10 ft over 200 px", () => {
    expect(calibrate(10, "ft", 200)).toBeCloseTo(0.01524, 8); // metres per pixel
    expect(() => calibrate(0, "m", 100)).toThrow();
    expect(() => calibrate(5, "m", 0)).toThrow();
  });
  it("scale from several dimensions = median, and reports spread", () => {
    const r = scaleFromDimensions([{ valueM: 3, px: 100 }, { valueM: 6.1, px: 200 }, { valueM: 9, px: 300 }])!;
    expect(r.metersPerPixel).toBeCloseTo(0.03, 3);
    expect(r.spreadPct).toBeLessThan(2);
    const bad = scaleFromDimensions([{ valueM: 3, px: 100 }, { valueM: 3, px: 300 }])!;
    expect(bad.spreadPct).toBeGreaterThan(50);
    expect(scaleFromDimensions([])).toBeNull();
  });
  it("parses dimension strings and refuses garbage", () => {
    expect(parseDimensionText("10'-6\"")).toBeCloseTo(3.2004, 4);
    expect(parseDimensionText("3200")).toBeCloseTo(3.2, 6);
    expect(parseDimensionText("3.2 m")).toBe(3.2);
    expect(parseDimensionText("12 ft", "mm")).toBeCloseTo(3.6576, 4);
    expect(parseDimensionText("abc")).toBeNull();
  });
  it("maps DXF $INSUNITS", () => {
    expect(dxfUnitFromInsUnits(4)).toBe("mm"); expect(dxfUnitFromInsUnits(6)).toBe("m"); expect(dxfUnitFromInsUnits(0)).toBeNull();
  });
});

describe("DXF → model", () => {
  const r = parseDxfToModel(sampleDxf(), { floors: 3 });
  const m = r.model;
  it("reads walls, columns, openings, labels (noise layers & numeric text ignored)", () => {
    expect(m.walls.length).toBe(5);
    expect(m.columns.length).toBe(4);
    expect(m.doors.length).toBe(1); expect(m.windows.length).toBe(2);
    expect(m.rooms.map((x) => x.name).sort()).toEqual(["BEDROOM", "LIVING ROOM"]);
    expect(m.floors).toBe(3);
  });
  it("takes units from the file → reference scale; footprint is 10 × 8 m", () => {
    expect(r.unitsFromFile).toBe(true);
    expect(m.scale.source).toBe("dxf");
    const s = summarize(m);
    expect(s.widthM).toBeCloseTo(10, 1); expect(s.depthM).toBeCloseTo(8, 1);
    expect(s.footprintM2).toBeCloseTo(80, 0);
    expect(s.totalFloorAreaM2).toBeCloseTo(240, 0);
  });
  it("converts mm drawings correctly", () => {
    const mm = parseDxfToModel(sampleDxf(4, 1000)).model;
    expect(summarize(mm).widthM).toBeCloseTo(10, 1);
  });
  it("flags unitless DXF: no silent trust (scale source none, low confidence, note)", () => {
    const u = parseDxfToModel(sampleDxf(null, 1000));
    expect(u.unitsFromFile).toBe(false);
    expect(u.model.scale.source).toBe("none");
    expect(u.notes.join(" ")).toMatch(/no unit information/i);
    expect(validateModel(u.model).join(" ")).toMatch(/not calibrated/i);
    expect(u.model.walls[0].basis).toBe("estimated");
  });
  it("marks exterior walls & records assumptions", () => {
    expect(m.walls.filter((w) => w.exterior).length).toBe(4);
    expect(m.assumptions.length).toBeGreaterThan(2);
  });
  it("rejects non-DXF / binary input with a useful message", () => {
    expect(() => parseDxfToModel("hello")).toThrow(/valid ASCII DXF/);
  });
});

describe("model validation & maths", () => {
  it("hull / area", () => {
    const h = convexHull([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 2, y: 1 }]);
    expect(h.length).toBe(4); expect(polygonArea(h)).toBe(12);
  });
  it("valid DXF model passes; bad inputs produce explicit errors", () => {
    const m = parseDxfToModel(sampleDxf()).model;
    expect(validateModel(m)).toEqual([]);
    expect(validateModel({ ...m, floors: 0 })[0]).toMatch(/Floor count/);
    expect(validateModel({ ...m, floorHeight: { value: 12, basis: "user" } })[0]).toMatch(/Floor height/);
    expect(validateModel({ ...m, walls: [] }).join(" ")).toMatch(/3 walls/);
    expect(validateModel(scaleModel(m, 100, 100)).join(" ")).toMatch(/larger than 300 m/);
  });
  it("confidence labels", () => { expect(confidenceLabel(0.96)).toBe("high"); expect(confidenceLabel(0.7)).toBe("medium"); expect(confidenceLabel(0.3)).toBe("low"); });
});

describe("3D generation", () => {
  const m = parseDxfToModel(sampleDxf(), { floors: 3 }).model;
  const sc = buildScene(m);
  const k = countByKind(sc.root);
  it("builds a storey group per floor + roof level, aligned columns on every floor", () => {
    expect(sc.floorGroups.length).toBe(4);
    expect(k.column).toBe(4 * 3);
    expect(k.slab).toBe(3); expect(k.roof).toBe(1); expect(k.footing).toBe(4); expect(k.plinth).toBe(1);
  });
  it("cuts openings into walls and fills them with door/window panes", () => {
    expect(k.door).toBe(3); expect(k.window).toBe(6);
    expect(k.wall).toBeGreaterThan(5 * 3); // wall split around openings
  });
  it("derives beams between aligned columns and a parapet", () => {
    expect(k.beam).toBe(4 * 3); expect(k.parapet).toBe(4);
  });
  it("overall size matches the model (10 × 8 m, height ≈ 3 floors)", () => {
    expect(sc.size.w).toBeGreaterThan(10); expect(sc.size.w).toBeLessThan(11.5);
    expect(sc.size.d).toBeGreaterThan(8); expect(sc.size.d).toBeLessThan(9.5);
    expect(sc.size.h).toBeGreaterThan(3 * 3.05); 
  });
  it("labels come from rooms (ground floor only)", () => { expect(sc.labels.map((l) => l.text).sort()).toEqual(["BEDROOM", "LIVING ROOM"]); });
  it("gable roof adds a roof mesh", () => {
    const g = buildScene({ ...m, roof: { ...m.roof, type: "gable" } });
    expect(countByKind(g.root).roof).toBe(2);
  });
});

describe("raster analysis (AI output is untrusted)", () => {
  const raw = {
    drawing_type: "floor_plan", floors: { value: 2, confidence: 0.9 },
    walls: [
      { a: { x: 0.1, y: 0.1 }, b: { x: 0.9, y: 0.1 }, exterior: true, confidence: 0.95 },
      { a: { x: 0.9, y: 0.1 }, b: { x: 0.9, y: 0.7 }, exterior: true, confidence: 0.95 },
      { a: { x: 0.9, y: 0.7 }, b: { x: 0.1, y: 0.7 }, exterior: true, confidence: 0.9 },
      { a: { x: 0.1, y: 0.7 }, b: { x: 0.1, y: 0.1 }, exterior: true, confidence: 0.9 },
      { a: { x: 5, y: 5 }, b: { x: 0.2, y: 0.2 } }, // out of range → dropped
      { a: { x: 0.3, y: 0.3 }, b: { x: 0.3, y: 0.3 } }, // zero length → dropped
    ],
    doors: [{ c: { x: 0.3, y: 0.1 }, w_rel: 0.04, confidence: 0.8 }, { c: { x: 0.3, y: 0.1 }, w_rel: 5 }],
    windows: [{ c: { x: 0.6, y: 0.1 }, w_rel: 0.06, confidence: 0.7 }],
    labels: [{ text: "Bedroom", at: { x: 0.3, y: 0.4 }, confidence: 0.9 }, { text: "", at: { x: 0.5, y: 0.5 } }],
    dimensions: [
      { text: "10'-0\"", value_m: 3.048, a: { x: 0.1, y: 0.8 }, b: { x: 0.9, y: 0.8 }, confidence: 0.9 },
      { text: "?", value_m: null, a: { x: 0.1, y: 0.85 }, b: { x: 0.5, y: 0.85 }, confidence: 0.2 },
    ],
  };
  const a = normalizeRasterAnalysis(raw);
  it("drops invalid geometry and says so", () => {
    expect(a.walls.length).toBe(4); expect(a.doors.length).toBe(1); expect(a.labels.length).toBe(1);
    expect(a.dropped).toBeGreaterThanOrEqual(4);
    expect(a.warnings.join(" ")).toMatch(/ignored/);
  });
  it("garbage in → empty analysis, never throws", () => {
    for (const bad of [null, undefined, "x", 42, [], { walls: "no" }]) expect(() => normalizeRasterAnalysis(bad)).not.toThrow();
    expect(normalizeRasterAnalysis(null).walls).toEqual([]);
    expect(normalizeRasterAnalysis({ drawing_type: "floor_plan" }).warnings.join(" ")).toMatch(/Very few walls/);
  });
  const img = { width: 1000, height: 800 };
  it("auto-scale uses only reliable printed dimensions", () => {
    const s = autoScale(a, img)!;
    expect(s.used).toBe(1);
    expect(s.metersPerPixel).toBeCloseTo(3.048 / 800, 6);
  });
  it("no reliable dimension → null (user must calibrate; nothing invented)", () => {
    expect(autoScale(normalizeRasterAnalysis({ ...raw, dimensions: [] }), img)).toBeNull();
  });
  it("converts to a model in metres, y-up, with defaults flagged as assumptions", () => {
    const mpp = 3.048 / 800;
    const m = rasterToModel(a, img, mpp, "dimensions");
    expect(m.floors).toBe(2);
    const s = summarize(m);
    expect(s.widthM).toBeCloseTo(0.8 * 1000 * mpp, 2);
    expect(s.depthM).toBeCloseTo(0.6 * 800 * mpp, 2);
    expect(m.scale.source).toBe("dimensions");
    expect(m.walls.every((w) => !w.verified)).toBe(true); // AI trace must be verified by the user
    expect(m.assumptions.join(" ")).toMatch(/Wall thickness defaulted/);
    expect(m.walls[0].exterior && m.walls[0].thickness).toBeCloseTo(0.254, 3);
  });
  it("area-based scale is flagged as estimated", () => {
    const mpp = mppFromArea(a, img, 120)!;
    const m = rasterToModel(a, img, mpp, "area-assumed");
    expect(summarize(m).footprintM2).toBeCloseTo(120, 0);
    expect(m.walls[0].basis).toBe("estimated");
    expect(m.assumptions.join(" ")).toMatch(/AI-estimated/);
  });
});

describe("render mode is labelled conceptual", () => {
  it("massing model never claims exact geometry", () => {
    const m = massingFromRender(null, { widthM: 12, depthM: 9, floors: 4 });
    expect(m.conceptual).toBe(true); expect(m.sourceType).toBe("render");
    expect(m.assumptions[0]).toMatch(/CONCEPTUAL 3D RECONSTRUCTION/);
    expect(m.walls.every((w) => w.basis === "estimated" && w.source === "inferred")).toBe(true);
    expect(validateModel(m)).toEqual([]);
    expect(countByKind(buildScene(m).root).column).toBe(16);
  });
});

describe("upload validation", () => {
  it("accepts only supported extensions", () => {
    expect(fileKind("plan.PDF")).toBe("pdf"); expect(fileKind("a.dwg")).toBe("dwg"); expect(fileKind("virus.exe")).toBeNull(); expect(fileKind("noext")).toBeNull();
  });
  it("magic bytes must match the extension", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]);
    expect(sniffMatches("image", png)).toBe(true);
    expect(sniffMatches("pdf", png)).toBe(false);
    expect(sniffMatches("pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(sniffMatches("dxf", new TextEncoder().encode("  0\nSECTION\n  2\nHEADER\n"))).toBe(true);
    expect(sniffMatches("dxf", new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toBe(false);
    expect(sniffMatches("dwg", new TextEncoder().encode("AC1027"))).toBe(true);
  });
});
void emptyModel;
