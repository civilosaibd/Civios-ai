import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildReportData, renderReportPdf, REPORT_DISCLAIMER } from "./report";
import { buildScene, countByKind, type Kind } from "./geometry";
import { visibleClone } from "./exportScene";
import { demoModel } from "./demo";
import { posToStage, stageVisible } from "./stages";

describe("report", () => {
  const m = demoModel(); const scene = buildScene(m); const counts = countByKind(scene.root) as Partial<Record<Kind, number>>;
  it("uses only model data and flags estimated values", () => {
    const d = buildReportData(m, counts, new Date("2026-10-22T00:00:00Z"));
    expect(d.generated).toBe("2026-10-22");
    expect(d.facts.find((f) => f[0] === "Floors")![1]).toBe(String(m.floors));
    expect(d.facts.find((f) => f[0] === "Floor height")![1]).toContain("estimated");
    expect(d.assumptions).toEqual(m.assumptions);
    expect(d.assumptions.some((a) => a.startsWith("DEMO"))).toBe(true);
    expect(d.disclaimer).toBe(REPORT_DISCLAIMER);
    expect(d.stageRows).toHaveLength(6);
    expect(d.stageRows.reduce((a, r) => a + r.count, 0)).toBe(Object.values(counts).reduce((a, b) => a + (b ?? 0), 0));
  });
  it("imperial models print feet / sq ft", () => {
    const d = buildReportData({ ...m, unitSystem: "imperial" }, counts);
    expect(d.facts.find((f) => f[0] === "Height incl. parapet")![1]).toMatch(/ft$/);
    expect(d.facts.find((f) => f[0] === "Total floor area")![1]).toMatch(/sq ft$/);
  });
  it("conceptual models are labelled and area-assumed scale is called an assumption", () => {
    const c = buildReportData({ ...m, conceptual: true, scale: { source: "area-assumed" } }, counts);
    expect(c.conceptual).toBe(true); expect(c.scale).toMatch(/ASSUMED/);
    const doc = renderReportPdf(c, null);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
  it("renders a valid multi-page PDF even with very long lists and non-Latin text", () => {
    const d = buildReportData(m, counts); d.assumptions = Array.from({ length: 120 }, (_, i) => `Assumption ${i} ডেডলাইন ${"x".repeat(60)}`);
    const doc = renderReportPdf(d, null);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const head = new TextDecoder().decode(new Uint8Array(doc.output("arraybuffer")).slice(0, 5));
    expect(head).toBe("%PDF-");
  });
  it("survives an unreadable image", () => { expect(() => renderReportPdf(buildReportData(m, counts), "data:image/png;base64,AAAA")).not.toThrow(); });
});

describe("visibleClone (export of what is shown)", () => {
  const count = (g: THREE.Object3D) => { let n = 0; g.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
  it("matches the number of visible meshes and keeps world positions", () => {
    const m = demoModel(); const s = buildScene(m);
    const all = count(s.root);
    expect(count(visibleClone(s.root))).toBe(all);
    s.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.kind === "wall") o.visible = false; });
    const noWalls = visibleClone(s.root); let walls = 0; noWalls.traverse((o) => { if (o.userData.kind === "wall") walls++; });
    expect(walls).toBe(0); expect(count(noWalls)).toBeLessThan(all);
    s.floorGroups[1].visible = false; s.floorGroups[1].position.y = 5; // isolation / explode
    const iso = visibleClone(s.root); iso.traverse((o) => { if (o.userData.floor === 1) throw new Error("hidden floor exported"); });
  });
  it("respects the construction stage", () => {
    const m = demoModel(); const s = buildScene(m); const sim = posToStage(2.5);
    s.root.traverse((o) => { const k = (o as THREE.Mesh).isMesh ? o.userData.kind : null; if (k) o.visible = stageVisible(k, o.userData.floor, m.floors, sim); });
    const c = visibleClone(s.root); const kinds = new Set<string>(); c.traverse((o) => { if (o.userData.kind) kinds.add(o.userData.kind); });
    expect([...kinds].sort()).toEqual(["column", "footing", "plinth"].sort());
  });
  it("applies parent transforms (exploded floors)", () => {
    const s = buildScene(demoModel()); const mesh = (() => { let r: THREE.Mesh | null = null; s.floorGroups[1].traverse((o) => { if (!r && (o as THREE.Mesh).isMesh) r = o as THREE.Mesh; }); return r!; })();
    const before = new THREE.Vector3(); mesh.getWorldPosition(before);
    s.floorGroups[1].position.y += 7; s.root.updateMatrixWorld(true);
    let found = false; visibleClone(s.root).traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.floor === 1 && Math.abs(o.position.y - (before.y + 7)) < 1e-6 && Math.abs(o.position.x - before.x) < 1e-6) found = true; });
    expect(found).toBe(true);
  });
});
