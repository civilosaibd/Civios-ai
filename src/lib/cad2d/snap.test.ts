import { describe, expect, it } from "vitest";
import type { CadEntity } from "./geometry";
import { snapPoint } from "./snap";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity =>
  ({ id, layerId: "layer-0", type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 } });

describe("object snap", () => {
  const modes = ["endpoint", "midpoint", "intersection", "center", "perpendicular"] as const;

  it("snaps to an endpoint inside tolerance and ignores points outside it", () => {
    const entities = [line("a", 0, 0, 10, 0)];
    expect(snapPoint({ x: 10.2, y: 0 }, entities, [...modes], 0.5)?.point).toEqual({ x: 10, y: 0 });
    expect(snapPoint({ x: 10.2, y: 0 }, entities, [...modes], 0.1)).toBeNull();
  });

  it("prefers an intersection over a farther endpoint", () => {
    const entities = [line("h", 0, 0, 8, 0), line("v", 6, -3, 6, 1)];
    const hit = snapPoint({ x: 6.15, y: 0.1 }, entities, [...modes], 0.4);
    expect(hit?.mode).toBe("intersection");
    expect(hit?.point.x).toBeCloseTo(6);
    expect(hit?.point.y).toBeCloseTo(0);
  });
});
