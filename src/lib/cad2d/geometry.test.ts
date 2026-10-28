import { describe, expect, it } from "vitest";
import {
  createEmptyDocument, deserializeCadDocument, distance, entityBounds,
  chamferLines, extendLineToBoundary, normalizeRect, offsetEntity, parseCadCommand, rotateEntity, serializeCadDocument, snapToGrid,
  translateEntity, trimLineAtPoint, type CadEntity,
} from "./geometry";

describe("2D CAD geometry foundation", () => {
  it("normalizes rectangle corners regardless of drag direction", () => {
    expect(normalizeRect({ x: 8, y: 2 }, { x: 1, y: 9 })).toEqual({
      min: { x: 1, y: 2 }, max: { x: 8, y: 9 },
    });
  });

  it("snaps coordinates to the configured grid", () => {
    expect(snapToGrid({ x: 2.4, y: -3.6 }, 1)).toEqual({ x: 2, y: -4 });
    expect(snapToGrid({ x: 2.4, y: -3.6 }, 0)).toEqual({ x: 2.4, y: -3.6 });
  });

  it("parses common drafting commands and validates inputs", () => {
    expect(parseCadCommand("LINE 0,0 10,5")).toEqual({
      name: "LINE", args: [{ x: 0, y: 0 }, { x: 10, y: 5 }],
    });
    expect(parseCadCommand("RECTANG 1,2 5,8").name).toBe("RECTANGLE");
    expect(parseCadCommand("CIRCLE 2,3 4").args[1]).toBe(4);
    expect(() => parseCadCommand("CIRCLE 2,3 -4")).toThrow(/positive/);
    expect(() => parseCadCommand("LINE nope 2,3")).toThrow(/Invalid point/);
  });

  it("translates and rotates entities without mutating the original", () => {
    const line: CadEntity = { id: "e1", layerId: "layer-0", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 0 } };
    const moved = translateEntity(line, 3, 4);
    expect(moved).toMatchObject({ start: { x: 3, y: 4 }, end: { x: 5, y: 4 } });
    expect(line).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 2, y: 0 } });
    const rotated = rotateEntity(line, Math.PI / 2);
    expect((rotated as Extract<CadEntity, { type: "line" }>).end.x).toBeCloseTo(0);
    expect((rotated as Extract<CadEntity, { type: "line" }>).end.y).toBeCloseTo(2);
  });

  it("calculates entity bounds and distances", () => {
    const circle: CadEntity = { id: "e2", layerId: "layer-0", type: "circle", center: { x: 5, y: 6 }, radius: 2 };
    expect(entityBounds(circle)).toEqual({ min: { x: 3, y: 4 }, max: { x: 7, y: 8 } });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("offsets lines without mutating the source and rejects invalid distances", () => {
    const line: CadEntity = { id: "o1", layerId: "layer-0", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    expect(offsetEntity(line, 2)).toMatchObject({ start: { x: 0, y: 2 }, end: { x: 10, y: 2 } });
    expect(line).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    expect(() => offsetEntity(line, 0)).toThrow(/non-zero/);
  });

  it("offsets circles and closed rectangles with radius and size validation", () => {
    const circle: CadEntity = { id: "o2", layerId: "layer-0", type: "circle", center: { x: 0, y: 0 }, radius: 5 };
    expect(offsetEntity(circle, 2)).toMatchObject({ radius: 7 });
    const rect: CadEntity = { id: "o3", layerId: "layer-0", type: "rectangle", min: { x: 0, y: 0 }, max: { x: 10, y: 8 } };
    expect(offsetEntity(rect, 1)).toMatchObject({ min: { x: 1, y: 1 }, max: { x: 9, y: 7 } });
    expect(() => offsetEntity(circle, -5)).toThrow(/radius/);
  });

  it("trims the nearest end of a line at an on-segment point", () => {
    const line = { id: "t1", layerId: "layer-0", type: "line" as const, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    expect(trimLineAtPoint(line, { x: 3, y: 0 })).toMatchObject({ start: { x: 3, y: 0 }, end: { x: 10, y: 0 } });
    expect(trimLineAtPoint(line, { x: 7, y: 0 })).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 7, y: 0 } });
    expect(() => trimLineAtPoint(line, { x: 3, y: 2 })).toThrow(/lie on the line/);
  });

  it("extends a line to a finite boundary only when intersection is beyond an endpoint", () => {
    const line = { id: "x1", layerId: "layer-0", type: "line" as const, start: { x: 0, y: 0 }, end: { x: 5, y: 0 } };
    const boundary = { id: "x2", layerId: "layer-0", type: "line" as const, start: { x: 8, y: -2 }, end: { x: 8, y: 2 } };
    expect(extendLineToBoundary(line, boundary)).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 8, y: 0 } });
    expect(() => extendLineToBoundary({ ...line, end: { x: 10, y: 0 } }, boundary)).toThrow(/No valid extension/);
  });

  it("chamfers intersecting finite line segments and rejects invalid distances", () => {
    const first = { id: "c1", layerId: "layer-0", type: "line" as const, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const second = { id: "c2", layerId: "layer-0", type: "line" as const, start: { x: 10, y: 0 }, end: { x: 10, y: 10 } };
    const result = chamferLines(first, second, 2);
    expect(result.first.end).toEqual({ x: 8, y: 0 });
    expect(result.second.start).toEqual({ x: 10, y: 2 });
    expect(result.connector.start).toEqual({ x: 8, y: 0 });
    expect(result.connector.end).toEqual({ x: 10, y: 2 });
    expect(first.end).toEqual({ x: 10, y: 0 });
    expect(() => chamferLines(first, second, 0)).toThrow(/positive finite/);
    expect(() => chamferLines(first, second, 11)).toThrow(/shorter/);
  });

  it("round-trips versioned documents", () => {
    const doc = createEmptyDocument("mm");
    expect(deserializeCadDocument(serializeCadDocument(doc))).toEqual(doc);
    expect(() => deserializeCadDocument("{}")).toThrow(/invalid CAD document format/i);
  });

  it("preserves locked state when rotating a rectangle into a polyline", () => {
    const lockedRectangle: CadEntity = {
      id: "locked-rect",
      layerId: "walls",
      type: "rectangle",
      min: { x: 0, y: 0 },
      max: { x: 4, y: 2 },
      locked: true,
    };
    const rotated = rotateEntity(lockedRectangle, Math.PI / 2);
    expect(rotated).toMatchObject({
      id: "locked-rect",
      layerId: "walls",
      type: "polyline",
      locked: true,
      closed: true,
    });
  });
});
