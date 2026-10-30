import { describe, expect, it } from "vitest";
import { analyzeDxfEngineeringDrawing, compareArchitecturalStructuralDrawings } from "./dxfEngineeringAnalysis";

const dxf = (insUnits: number | null, entities: Array<string | number>) => [
  0, "SECTION", 2, "HEADER",
  ...(insUnits === null ? [] : [9, "$INSUNITS", 70, insUnits]),
  0, "ENDSEC", 0, "SECTION", 2, "ENTITIES", ...entities, 0, "ENDSEC", 0, "EOF",
].join("\n") + "\n";

const poly = (layer: string, points: Array<[number, number]>, closed = true) => [
  0, "LWPOLYLINE", 8, layer, 90, points.length, 70, closed ? 1 : 0,
  ...points.flatMap(([x, y]) => [10, x, 20, y]),
];
const line = (layer: string, x1: number, y1: number, x2: number, y2: number) =>
  [0, "LINE", 8, layer, 10, x1, 20, y1, 11, x2, 21, y2];
const circle = (layer: string, x: number, y: number, radius: number) =>
  [0, "CIRCLE", 8, layer, 10, x, 20, y, 40, radius];

describe("deterministic DXF engineering analysis", () => {
  const fixture = dxf(4, [
    ...poly("A-WALL-GF", [[0, 0], [5000, 0], [5000, 4000], [0, 4000]]),
    ...circle("S-COLUMN-GF", 500, 500, 150),
    ...line("S-BEAM-GF", 500, 500, 4500, 500),
    ...poly("S-SLAB-GF", [[0, 0], [5000, 0], [5000, 4000], [0, 4000]]),
    ...poly("FOUNDATION-FOOTING", [[100, 100], [500, 100], [500, 500], [100, 500]]),
    ...line("REBAR-F1", 0, 0, 1000, 0),
    0, "TEXT", 8, "A-ROOM-GF", 10, 2500, 20, 2000, 1, "LIVING ROOM",
  ]);

  it("extracts supported engineering elements and preserves explicit units", () => {
    const result = analyzeDxfEngineeringDrawing(fixture, { fileName: "house-architectural.dxf" });
    expect(result.entityCount).toBe(7);
    expect(result.units).toBe("mm");
    expect(result.geometryBasis).toBe("explicit-dxf-units");
    expect(result.elements.find((item) => item.kind === "wall")?.geometryLength).toBe(18000);
    expect(result.elements.find((item) => item.kind === "wall")?.closedArea).toBe(20_000_000);
    expect(result.elements.find((item) => item.kind === "column")?.cadObjectCount).toBe(1);
    expect(result.elements.find((item) => item.kind === "beam")?.geometryLength).toBe(4000);
    expect(result.elements.find((item) => item.kind === "slab")?.closedArea).toBe(20_000_000);
    expect(result.elements.find((item) => item.kind === "foundation")?.cadObjectCount).toBe(1);
    expect(result.elements.find((item) => item.kind === "reinforcement")?.geometryLength).toBe(1000);
    expect(result.floorLabels).toContain("Ground");
    expect(result.labels).toContain("LIVING ROOM");
  });

  it("never guesses units for a unitless drawing", () => {
    const result = analyzeDxfEngineeringDrawing(dxf(null, [...line("A-WALL", 0, 0, 1000, 0)]));
    expect(result.units).toBeNull();
    expect(result.geometryBasis).toBe("raw-cad-units");
    expect(result.warnings.join(" ")).toMatch(/no metric conversion or scale assumption/i);
  });

  it("handles legacy POLYLINE VERTEX sequences and closed area", () => {
    const legacy = dxf(6, [
      0, "POLYLINE", 8, "A-WALL-F1", 10, 0, 20, 0, 70, 1,
      0, "VERTEX", 10, 0, 20, 0,
      0, "VERTEX", 10, 10, 20, 0,
      0, "VERTEX", 10, 10, 20, 10,
      0, "VERTEX", 10, 0, 20, 10,
      0, "SEQEND",
    ]);
    const result = analyzeDxfEngineeringDrawing(legacy);
    expect(result.entityCount).toBe(1);
    expect(result.elements.find((item) => item.kind === "wall")?.closedArea).toBe(100);
    expect(result.floorLabels).toContain("Floor 1");
  });

  it("reports unsupported CAD entity types instead of silently counting them as quantities", () => {
    const result = analyzeDxfEngineeringDrawing(dxf(6, [
      0, "ELLIPSE", 8, "S-BEAM-GF", 10, 0, 20, 0,
      ...line("S-BEAM-GF", 0, 0, 10, 0),
    ]));
    expect(result.entityCount).toBe(1);
    expect(result.unsupportedEntityCounts.ELLIPSE).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/not yet interpreted/i);
  });

  it("rejects empty or malformed drawings without inventing geometry", () => {
    expect(() => analyzeDxfEngineeringDrawing("not a dxf")).toThrow(/No supported geometric/);
  });

  it("compares architectural and structural drawings only when units and coordinate frames align", () => {
    const architectural = analyzeDxfEngineeringDrawing(dxf(4, [
      ...poly("A-WALL-GF", [[0, 0], [5000, 0], [5000, 4000], [0, 4000]]),
      ...circle("A-COLUMN-GF", 500, 500, 150),
    ]));
    const structural = analyzeDxfEngineeringDrawing(dxf(4, [
      ...poly("S-SLAB-GF", [[0, 0], [5000, 0], [5000, 4000], [0, 4000]]),
      ...circle("S-COLUMN-GF", 500, 500, 150),
    ]));
    const matched = compareArchitecturalStructuralDrawings(architectural, structural);
    expect(matched.comparable).toBe(true);
    expect(matched.warnings).toEqual([]);

    const mismatch = analyzeDxfEngineeringDrawing(dxf(4, [
      ...poly("S-SLAB-GF", [[0, 0], [5000, 0], [5000, 4000], [0, 4000]]),
      ...circle("S-COLUMN-GF", 500, 500, 150),
      ...circle("S-COLUMN-GF", 4500, 3500, 150),
    ]));
    const discrepancy = compareArchitecturalStructuralDrawings(architectural, mismatch);
    expect(discrepancy.comparable).toBe(true);
    expect(discrepancy.warnings.join(" ")).toMatch(/column CAD-object counts differ/i);

    const unverified = analyzeDxfEngineeringDrawing(dxf(null, [...line("A-WALL", 0, 0, 10, 0)]));
    expect(compareArchitecturalStructuralDrawings(unverified, structural).comparable).toBe(false);
  });
});
