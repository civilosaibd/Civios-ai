import { describe, expect, it } from "vitest";
import type { CadEntity } from "./geometry";
import { fitOpeningToNearestWall, getWallVisibleSegments } from "./wall-openings";

const wall: CadEntity = {
  id: "wall-1", layerId: "layer-0", type: "wall",
  start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.2,
};

describe("door and window wall openings", () => {
  it("aligns an opening to the nearest wall centerline", () => {
    expect(fitOpeningToNearestWall({ x: 5, y: 0.15 }, 1, [wall], 0.1)).toEqual({
      at: { x: 5, y: 0 }, width: 1, rotation: 0, wallId: "wall-1",
    });
  });

  it("keeps the opening detached when outside the placement tolerance", () => {
    expect(fitOpeningToNearestWall({ x: 5, y: 2 }, 1, [wall], 0.1)).toBeNull();
  });

  it("caps an opening so it cannot exceed the host wall length", () => {
    expect(fitOpeningToNearestWall({ x: 5, y: 0 }, 20, [wall], 0.1)?.width).toBeCloseTo(9.98);
  });

  it("subtracts a door opening from the wall and preserves both jamb-side segments", () => {
    const door: CadEntity = {
      id: "door-1", layerId: "layer-0", type: "door",
      at: { x: 5, y: 0 }, width: 2, rotation: 0, swing: "left",
    };
    const segments = getWallVisibleSegments(wall as Extract<CadEntity, { type: "wall" }>, [wall, door]);
    expect(segments).toHaveLength(2);
    expect(segments[0].start).toEqual({ x: 0, y: 0 });
    expect(segments[0].end.x).toBeCloseTo(4);
    expect(segments[1].start.x).toBeCloseTo(6);
    expect(segments[1].end).toEqual({ x: 10, y: 0 });
  });

  it("merges overlapping openings and handles a window", () => {
    const openings: CadEntity[] = [
      { id: "d1", layerId: "layer-0", type: "door", at: { x: 4, y: 0 }, width: 2, rotation: 0, swing: "left" },
      { id: "w1", layerId: "layer-0", type: "window", at: { x: 5, y: 0 }, width: 2, rotation: 0 },
    ];
    const segments = getWallVisibleSegments(wall as Extract<CadEntity, { type: "wall" }>, [wall, ...openings]);
    expect(segments).toHaveLength(2);
    expect(segments[0].end.x).toBeCloseTo(3);
    expect(segments[1].start.x).toBeCloseTo(6);
  });

  it("does not cut a wall for a parallel but offset symbol", () => {
    const windowEntity: CadEntity = {
      id: "w2", layerId: "layer-0", type: "window",
      at: { x: 5, y: 2 }, width: 2, rotation: 0,
    };
    expect(getWallVisibleSegments(wall as Extract<CadEntity, { type: "wall" }>, [wall, windowEntity])).toHaveLength(1);
  });
});
