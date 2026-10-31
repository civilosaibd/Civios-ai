import { describe, expect, it } from "vitest";
import { detectRooms, formatRoomArea } from "./room-analysis";
import type { CadEntity } from "./geometry";

const base = { layerId: "layer-0" };

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

  it("formats square units from the drawing unit setting", () => {
    expect(formatRoomArea(12.345, "m")).toBe("12.35 m²");
    expect(formatRoomArea(100, "ft")).toBe("100 ft²");
  });
});
