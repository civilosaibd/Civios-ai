import { describe, expect, it } from "vitest";
import { detectRooms, formatRoomArea } from "./room-analysis";
import type { CadEntity } from "./geometry";

const base = { layerId: "layer-0" };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  ...base, id, type: "wall", start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.2,
});

describe("CAD room analysis", () => {
  it("detects rectangles and calculates area, perimeter, and centroid", () => {
    const rect: CadEntity = { ...base, id: "r1", type: "rectangle", min: { x: 0, y: 0 }, max: { x: 10, y: 5 } };
    expect(detectRooms([rect])[0]).toMatchObject({ area: 50, perimeter: 30, centroid: { x: 5, y: 2.5 }, name: "Room 01" });
  });

  it("detects closed polylines and polygons but ignores open polylines", () => {
    const closed: CadEntity = { ...base, id: "p1", type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] };
    const open: CadEntity = { ...base, id: "p2", type: "polyline", closed: false, points: closed.points };
    const polygon: CadEntity = { ...base, id: "p3", type: "polygon", center: { x: 0, y: 0 }, radius: 2, sides: 4, rotation: Math.PI / 4 };
    const rooms = detectRooms([open, closed, polygon]);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].area).toBe(12);
    expect(rooms[1].area).toBeCloseTo(8);
  });

  it("handles clockwise point order and rejects degenerate boundaries", () => {
    const clockwise: CadEntity = { ...base, id: "cw", type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 0 }] };
    const degenerate: CadEntity = { ...base, id: "bad", type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] };
    expect(detectRooms([clockwise, degenerate])).toHaveLength(1);
    expect(detectRooms([clockwise])[0].area).toBe(6);
  });

  it("detects a closed room made from four independent wall segments", () => {
    const rooms = detectRooms([
      wall("bottom", 0, 0, 10, 0), wall("right", 10, 0, 10, 5),
      wall("top", 10, 5, 0, 5), wall("left", 0, 5, 0, 0),
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ boundaryType: "wall-network", area: 50, perimeter: 30, centroid: { x: 5, y: 2.5 } });
  });

  it("detects two adjacent rooms sharing a wall", () => {
    const rooms = detectRooms([
      wall("bottom", 0, 0, 10, 0), wall("top", 10, 5, 0, 5),
      wall("left", 0, 5, 0, 0), wall("right", 10, 0, 10, 5),
      wall("partition", 5, 0, 5, 5),
    ]);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((room) => room.area).sort()).toEqual([25, 25]);
  });

  it("splits T-junctions and crossing walls into bounded faces", () => {
    const rooms = detectRooms([
      wall("bottom", 0, 0, 10, 0), wall("top", 10, 5, 0, 5),
      wall("left", 0, 5, 0, 0), wall("right", 10, 0, 10, 5),
      wall("middle", 5, 0, 5, 5),
      wall("crossing-extension", 5, -2, 5, 7),
    ]);
    expect(rooms).toHaveLength(2);
    expect(rooms.every((room) => room.area > 0)).toBe(true);
  });

  it("does not report open or disconnected wall fragments as rooms", () => {
    const rooms = detectRooms([
      wall("a", 0, 0, 5, 0), wall("b", 5, 0, 5, 5),
      wall("c", 20, 20, 25, 20), wall("d", 25, 20, 25, 25),
    ]);
    expect(rooms).toHaveLength(0);
  });

  it("deduplicates overlapping/collinear wall runs and explicit room boundaries", () => {
    const rect: CadEntity = { ...base, id: "rect", type: "rectangle", min: { x: 0, y: 0 }, max: { x: 10, y: 5 } };
    const rooms = detectRooms([
      rect, wall("bottom-a", 0, 0, 5, 0), wall("bottom-b", 5, 0, 10, 0),
      wall("right", 10, 0, 10, 5), wall("top", 10, 5, 0, 5), wall("left", 0, 5, 0, 0),
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].id).toBe("rect");
  });

  it("keeps a wall-network room closed when door/window symbols sit on the wall", () => {
    const openings: CadEntity[] = [
      { ...base, id: "door", type: "door", at: { x: 5, y: 0 }, width: 1, rotation: 0, swing: "left" },
      { ...base, id: "window", type: "window", at: { x: 5, y: 5 }, width: 1.5, rotation: Math.PI, },
    ];
    const rooms = detectRooms([
      wall("bottom", 0, 0, 10, 0), wall("right", 10, 0, 10, 5),
      wall("top", 10, 5, 0, 5), wall("left", 0, 5, 0, 0), ...openings,
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBe(50);
  });

  it("formats square units from the drawing unit setting", () => {
    expect(formatRoomArea(12.345, "m")).toBe("12.35 m²");
    expect(formatRoomArea(100, "ft")).toBe("100 ft²");
  });
});
