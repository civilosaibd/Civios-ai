import { describe, expect, it } from "vitest";
import { snapPointToWallNetwork } from "./wall-network";
import type { CadEntity } from "./geometry";

const wall = (id: string, start: { x: number; y: number }, end: { x: number; y: number }): CadEntity => ({
  id, layerId: "layer-0", type: "wall", start, end, thickness: 0.5,
});

describe("architectural wall network snapping", () => {
  it("snaps to a nearby wall endpoint", () => {
    const entities = [wall("w1", { x: 0, y: 0 }, { x: 10, y: 0 })];
    expect(snapPointToWallNetwork({ x: 10.2, y: 0.1 }, entities, 0.5)).toEqual({ x: 10, y: 0 });
  });

  it("projects a nearby point onto a wall centerline for a T-junction", () => {
    const entities = [wall("w1", { x: 0, y: 0 }, { x: 10, y: 0 })];
    expect(snapPointToWallNetwork({ x: 5, y: 0.3 }, entities, 0.5)).toEqual({ x: 5, y: 0 });
  });

  it("snaps to the finite intersection of two existing walls", () => {
    const entities = [
      wall("w1", { x: 0, y: 5 }, { x: 10, y: 5 }),
      wall("w2", { x: 5, y: 0 }, { x: 5, y: 10 }),
    ];
    expect(snapPointToWallNetwork({ x: 5.2, y: 5.1 }, entities, 0.5)).toEqual({ x: 5, y: 5 });
  });

  it("does not snap to distant or non-wall geometry", () => {
    const entities: CadEntity[] = [
      wall("w1", { x: 0, y: 0 }, { x: 10, y: 0 }),
      { id: "l1", layerId: "layer-0", type: "line", start: { x: 20, y: 20 }, end: { x: 30, y: 20 } },
    ];
    expect(snapPointToWallNetwork({ x: 5, y: 2 }, entities, 0.5)).toBeNull();
    expect(snapPointToWallNetwork({ x: 25, y: 20 }, entities, 0.5)).toBeNull();
  });

  it("does not mutate the existing wall network", () => {
    const entities = [wall("w1", { x: 0, y: 0 }, { x: 10, y: 0 })];
    const before = structuredClone(entities);
    snapPointToWallNetwork({ x: 5, y: 0.2 }, entities, 0.5);
    expect(entities).toEqual(before);
  });
});
