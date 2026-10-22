import { describe, expect, it } from "vitest";
import { STAGES, STAGE_COUNT, advance, firstStageOf, posOfStageEnd, posToStage, stageVisible, visibleCounts } from "./stages";
import { buildEnvironment, DEFAULT_CUSTOM, ENV_PRESETS } from "./environment";
import { buildScene } from "./geometry";
import { demoModel } from "./demo";
import { bounds } from "./model";
import type { Kind } from "./geometry";
import * as THREE from "three";

const ALL: Kind[] = ["footing", "plinth", "column", "beam", "slab", "wall", "door", "window", "stair", "balcony", "roof", "parapet"];

describe("construction stages", () => {
  it("has 8 stages in order and every kind appears in exactly one stage", () => {
    expect(STAGES.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const listed = STAGES.flatMap((s) => s.kinds).sort();
    expect(listed).toEqual([...ALL].sort());
    for (const s of STAGES) for (const k of s.kinds) expect(firstStageOf(k)).toBe(s.n);
  });
  it("maps position to stage and back", () => {
    expect(posToStage(0)).toEqual({ stage: 1, t: 0 });
    expect(posToStage(2.5)).toEqual({ stage: 3, t: 0.5 });
    expect(posToStage(8)).toEqual({ stage: 8, t: 1 });
    expect(posToStage(99).stage).toBe(8);
    expect(posToStage(-3).stage).toBe(1);
    for (let s = 1; s <= 8; s++) expect(posToStage(posOfStageEnd(s)).stage).toBe(s);
    expect(posToStage(posOfStageEnd(3)).t).toBeGreaterThan(0.999);
  });
  it("nothing is visible in stage 1 and everything in stage 8", () => {
    for (const k of ALL) {
      expect(stageVisible(k, 0, 3, posToStage(0))).toBe(false);
      expect(stageVisible(k, 0, 3, { stage: 8, t: 0 })).toBe(true);
    }
  });
  it("only earlier-stage elements are visible, later ones never early", () => {
    const sim = posToStage(posOfStageEnd(4)); // stage 4 fully built
    for (const k of ALL) expect(stageVisible(k, 1, 3, sim)).toBe(firstStageOf(k) <= 4);
  });
  it("walls rise floor by floor during stage 5", () => {
    const f = (t: number) => [0, 1, 2].map((fl) => stageVisible("wall", fl, 3, { stage: 5, t }));
    expect(f(0)).toEqual([false, false, false]);
    expect(f(0.2)).toEqual([true, false, false]);
    expect(f(0.5)).toEqual([true, true, false]);
    expect(f(1)).toEqual([true, true, true]);
  });
  it("slab 0 appears first, the roof-level items with the first tick of stage 7", () => {
    expect(stageVisible("slab", 0, 3, { stage: 4, t: 0.1 })).toBe(true);
    expect(stageVisible("slab", 2, 3, { stage: 4, t: 0.1 })).toBe(false);
    expect(stageVisible("parapet", 3, 3, { stage: 7, t: 0 })).toBe(false);
    expect(stageVisible("parapet", 3, 3, { stage: 7, t: 0.01 })).toBe(true);
  });
  it("visibility never decreases as the simulation advances", () => {
    const m = demoModel(); const built = buildScene(m); const items: { kind: Kind; floor: number }[] = [];
    built.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.kind) items.push({ kind: o.userData.kind, floor: o.userData.floor }); });
    let prev = -1;
    for (let p = 0; p <= 8.0001; p += 0.05) {
      const { shown, total } = visibleCounts(items, m.floors, posToStage(p));
      expect(shown).toBeGreaterThanOrEqual(prev); prev = shown;
      if (p >= 8) expect(shown).toBe(total);
    }
    expect(visibleCounts(items, m.floors, posToStage(0)).shown).toBe(0);
  });
  it("advance respects speed, clamps at the end and never goes backwards", () => {
    expect(advance(0, 2, 1).pos).toBeCloseTo(0.5);
    expect(advance(0, 2, 2).pos).toBeCloseTo(1);
    expect(advance(7.9, 100, 1)).toEqual({ pos: 8, done: true });
    expect(advance(3, 1, 0).pos).toBe(3);
    expect(advance(3, 1, -5).pos).toBe(3);
  });
});

describe("environment presets", () => {
  const b = bounds(demoModel().footprint.points);
  const overlap = (a: { x: number; z: number; w: number; d: number }) => {
    const cx = (b.minX + b.maxX) / 2, cz = -(b.minY + b.maxY) / 2, w = b.maxX - b.minX, d = b.maxY - b.minY;
    return Math.abs(a.x - cx) < (a.w + w) / 2 && Math.abs(a.z - cz) < (a.d + d) / 2;
  };
  it("lists the five presets", () => expect(ENV_PRESETS.map((p) => p.key)).toEqual(["minimal", "residential", "urban", "commercial", "custom"]));
  it("is deterministic", () => {
    for (const p of ENV_PRESETS) expect(buildEnvironment(p.key, b)).toEqual(buildEnvironment(p.key, b));
  });
  it("minimal has no items; others add context", () => {
    expect(buildEnvironment("minimal", b).items).toHaveLength(0);
    for (const p of ["residential", "urban", "commercial"] as const) expect(buildEnvironment(p, b).items.length).toBeGreaterThan(3);
  });
  it("nothing ever overlaps the building footprint, for several seeds and sizes", () => {
    for (const seed of [1, 7, 42, 99, 1234]) for (const p of ENV_PRESETS) {
      for (const it of buildEnvironment(p.key, b, DEFAULT_CUSTOM, seed).items) expect(overlap(it)).toBe(false);
    }
    const tiny = { minX: 0, maxX: 3, minY: 0, maxY: 3 };
    for (const it of buildEnvironment("urban", tiny).items) expect(it.x === 1.5 && it.z === -1.5).toBe(false);
  });
  it("urban/commercial neighbours are taller than residential ones", () => {
    const maxH = (p: "residential" | "urban" | "commercial") => Math.max(...buildEnvironment(p, b).items.filter((i) => i.type === "block").map((i) => i.h));
    expect(maxH("urban")).toBeGreaterThan(maxH("residential"));
  });
  it("custom is clamped and rejects a bad colour", () => {
    const e = buildEnvironment("custom", b, { trees: false, neighbours: 999, neighbourHeight: 9999, road: false, groundColor: "red;}" });
    expect(e.items.filter((i) => i.type === "block").length).toBeLessThanOrEqual(8);
    expect(e.items.some((i) => i.type === "tree" || i.type === "road")).toBe(false);
    expect(e.items.every((i) => i.h <= 60)).toBe(true);
    expect(e.ground).toBe(DEFAULT_CUSTOM.groundColor);
    expect(() => buildEnvironment("custom", b, { ...DEFAULT_CUSTOM, neighbours: NaN, neighbourHeight: NaN })).not.toThrow();
  });
});
