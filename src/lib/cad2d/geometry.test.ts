import { describe, expect, it } from "vitest";
import {
  createEmptyDocument, deserializeCadDocument, distance, entityBounds,
  chamferLines, extendLineToBoundary, normalizeRect, offsetEntity, parseCadCommand, rotateEntity, serializeCadDocument, snapToGrid,
  translateEntity, trimLineAtPoint, nearestEndpoint, mirrorEntity, type CadEntity,
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

  it("rejects malformed imported geometry, duplicate IDs, and missing layers", () => {
    const valid = createEmptyDocument("mm");
    expect(() => deserializeCadDocument(JSON.stringify({ ...valid, units: "yards" }))).toThrow(/format/i);
    expect(() => deserializeCadDocument(JSON.stringify({ ...valid, layers: [] }))).toThrow(/at least one layer/i);
    const invalidGeometry = {
      ...valid,
      entities: [{ id: "bad", layerId: "layer-0", type: "circle", center: { x: 0, y: 0 }, radius: -2 }],
    };
    expect(() => deserializeCadDocument(JSON.stringify(invalidGeometry))).toThrow(/geometry/i);
    const duplicateLayers = {
      ...valid,
      layers: [...valid.layers, { ...valid.layers[0], id: "layer-1" }],
    };
    expect(() => deserializeCadDocument(JSON.stringify(duplicateLayers))).toThrow(/unique/i);
    const missingLayer = {
      ...valid,
      entities: [{ id: "line", layerId: "missing", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }],
    };
    expect(() => deserializeCadDocument(JSON.stringify(missingLayer))).toThrow(/ID\/layer/i);
  });

  it("round-trips versioned documents", () => {
    const doc = createEmptyDocument("mm");
    expect(deserializeCadDocument(serializeCadDocument(doc))).toEqual(doc);
    expect(() => deserializeCadDocument("{}")).toThrow(/invalid CAD document format/i);
  });

  it("preserves locked metadata and IDs across multi-object transforms", () => {
    const entities: CadEntity[] = [
      { id: "line", layerId: "0", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 1 }, locked: true },
      { id: "wall", layerId: "0", type: "wall", start: { x: 1, y: 1 }, end: { x: 4, y: 1 }, thickness: 0.2, locked: true },
      { id: "poly", layerId: "0", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], closed: false, locked: true },
      { id: "circle", layerId: "0", type: "circle", center: { x: 2, y: 2 }, radius: 1, locked: true },
      { id: "ellipse", layerId: "0", type: "ellipse", center: { x: 3, y: 3 }, rx: 2, ry: 1, locked: true },
      { id: "arc", layerId: "0", type: "arc", center: { x: 4, y: 4 }, radius: 1, startAngle: 0, endAngle: Math.PI / 2, locked: true },
      { id: "text", layerId: "0", type: "text", at: { x: 5, y: 5 }, text: "A", height: 1, rotation: 0, locked: true },
    ];
    const translated = entities.map((entity) => translateEntity(entity, 10, -3));
    const mirrored = entities.map((entity) => mirrorEntity(entity, 2));
    for (const [index, entity] of entities.entries()) {
      expect(translated[index]).toMatchObject({ id: entity.id, layerId: entity.layerId, locked: true });
      expect(mirrored[index]).toMatchObject({ id: entity.id, layerId: entity.layerId, locked: true });
    }
    expect(translated[0]).toMatchObject({ start: { x: 10, y: -3 }, end: { x: 12, y: -2 } });
    expect(mirrored[0]).toMatchObject({ start: { x: 4, y: 0 }, end: { x: 2, y: 1 } });
    expect(entities[0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 2, y: 1 } });
  });

  it("rejects malformed coordinates and entity-specific fields for imported entity types", () => {
    const valid = createEmptyDocument("mm");
    const invalidEntities: unknown[] = [
      { id: "line", layerId: "layer-0", type: "line", start: { x: 0, y: 0 }, end: { x: Infinity, y: 1 } },
      { id: "wall", layerId: "layer-0", type: "wall", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, thickness: 0 },
      { id: "poly", layerId: "layer-0", type: "polyline", points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], closed: true },
      { id: "rect", layerId: "layer-0", type: "rectangle", min: { x: 0, y: 0 }, max: { x: 1, y: 0 } },
      { id: "circle", layerId: "layer-0", type: "circle", center: { x: 0, y: 0 }, radius: 0 },
      { id: "ellipse", layerId: "layer-0", type: "ellipse", center: { x: 0, y: 0 }, rx: 1, ry: -1 },
      { id: "arc", layerId: "layer-0", type: "arc", center: { x: 0, y: 0 }, radius: 1, startAngle: 0, endAngle: 0 },
      { id: "text", layerId: "layer-0", type: "text", at: { x: 0, y: 0 }, text: "", height: 1, rotation: 0 },
      { id: "unknown", layerId: "layer-0", type: "spline", points: [] },
    ];
    for (const entity of invalidEntities) {
      expect(() => deserializeCadDocument(JSON.stringify({ ...valid, entities: [entity] }))).toThrow();
    }
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

  it("preserves the mirrored arc sweep and endpoints", () => {
    const arc: CadEntity = {
      id: "mirror-arc", layerId: "0", type: "arc",
      center: { x: 5, y: 5 }, radius: 2,
      startAngle: 0, endAngle: Math.PI / 2,
    };
    const mirrored = mirrorEntity(arc, 5);
    expect(mirrored).toMatchObject({
      type: "arc", center: { x: 5, y: 5 },
      startAngle: Math.PI / 2, endAngle: Math.PI,
    });
    if (mirrored.type !== "arc") throw new Error("Expected mirrored arc.");
    expect(mirrored.endAngle - mirrored.startAngle).toBeCloseTo(Math.PI / 2);
    expect(mirrored.center.x + mirrored.radius * Math.cos(mirrored.startAngle)).toBeCloseTo(5);
    expect(mirrored.center.y + mirrored.radius * Math.sin(mirrored.startAngle)).toBeCloseTo(7);
    expect(mirrored.center.x + mirrored.radius * Math.cos(mirrored.endAngle)).toBeCloseTo(3);
    expect(mirrored.center.y + mirrored.radius * Math.sin(mirrored.endAngle)).toBeCloseTo(5);
  });

  it("snaps to the four quadrant points of an ellipse", () => {
    const ellipse: CadEntity = {
      id: "ellipse-snap", layerId: "0", type: "ellipse",
      center: { x: 5, y: 5 }, rx: 3, ry: 2,
    };
    expect(nearestEndpoint({ x: 8.02, y: 5 }, [ellipse], 0.1)).toEqual({ x: 8, y: 5 });
    expect(nearestEndpoint({ x: 5, y: 7.02 }, [ellipse], 0.1)).toEqual({ x: 5, y: 7 });
    expect(nearestEndpoint({ x: 1.98, y: 5 }, [ellipse], 0.1)).toEqual({ x: 2, y: 5 });
    expect(nearestEndpoint({ x: 5, y: 2.02 }, [ellipse], 0.1)).toEqual({ x: 5, y: 3 });
  });

  it("snaps to both geometric endpoints of an arc, not an arbitrary circle point", () => {
    const arc: CadEntity = {
      id: "arc-snap", layerId: "0", type: "arc",
      center: { x: 5, y: 5 }, radius: 2,
      startAngle: 0, endAngle: Math.PI / 2,
    };
    expect(nearestEndpoint({ x: 7.02, y: 5 }, [arc], 0.1)).toEqual({ x: 7, y: 5 });
    expect(nearestEndpoint({ x: 5, y: 7.02 }, [arc], 0.1)).toEqual({ x: 5, y: 7 });
    expect(nearestEndpoint({ x: 7, y: 5 }, [{
      id: "circle", layerId: "0", type: "circle", center: { x: 5, y: 5 }, radius: 2,
    }], 0.1)).toBeNull();
  });
});
