import { describe, expect, it } from "vitest";
import { analyzePolygon, polygonToDxf, type PlotVertex } from "./landGeometry";

describe("analyzePolygon", () => {
  it("calculates a rectangular plot area, perimeter and centroid", () => {
    const points: PlotVertex[] = [{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:0,y:10}];
    const result = analyzePolygon(points);
    expect(result.valid).toBe(true);
    expect(result.area).toBe(200);
    expect(result.perimeter).toBe(60);
    expect(result.centroid?.x).toBeCloseTo(10);
    expect(result.centroid?.y).toBeCloseTo(5);
  });

  it("supports concave irregular polygons without forcing a convex hull", () => {
    const points: PlotVertex[] = [{x:0,y:0},{x:8,y:0},{x:8,y:3},{x:4,y:3},{x:4,y:7},{x:0,y:7}];
    const result = analyzePolygon(points);
    expect(result.valid).toBe(true);
    expect(result.area).toBe(44);
  });

  it("rejects self-intersecting boundaries", () => {
    const result = analyzePolygon([{x:0,y:0},{x:4,y:4},{x:0,y:4},{x:4,y:0}]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/cross or touch/);
  });

  it("rejects duplicate points and collinear polygons", () => {
    expect(analyzePolygon([{x:0,y:0},{x:2,y:0},{x:2,y:0},{x:0,y:2}]).valid).toBe(false);
    expect(analyzePolygon([{x:0,y:0},{x:1,y:1},{x:2,y:2}]).valid).toBe(false);
  });
});

describe("polygonToDxf", () => {
  it("exports a closed LWPOLYLINE boundary", () => {
    const dxf = polygonToDxf([{x:0,y:0},{x:5,y:0},{x:3,y:4}]);
    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf).toContain("\r\n70\r\n1");
    expect(dxf).toContain("\r\n90\r\n3");
    expect(dxf.endsWith("0\r\nEOF")).toBe(true);
  });

  it("refuses fewer than three vertices", () => {
    expect(() => polygonToDxf([{x:0,y:0},{x:1,y:1}])).toThrow();
  });
});
