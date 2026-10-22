// Procedural surroundings for the 3D viewer. GENERIC context only — it is not the real site, neighbours or road.
// Deterministic (seeded) so the same model + preset always gives the same scene, and nothing overlaps the building.

export type EnvPreset = "minimal" | "residential" | "urban" | "commercial" | "custom";
export const ENV_PRESETS: { key: EnvPreset; en: string; bn: string }[] = [
  { key: "minimal", en: "Minimal", bn: "মিনিমাল" }, { key: "residential", en: "Residential", bn: "আবাসিক" },
  { key: "urban", en: "Urban", bn: "শহুরে" }, { key: "commercial", en: "Commercial", bn: "বাণিজ্যিক" }, { key: "custom", en: "Custom", bn: "কাস্টম" },
];

export interface CustomEnv { trees: boolean; neighbours: number; neighbourHeight: number; road: boolean; groundColor: string }
export const DEFAULT_CUSTOM: CustomEnv = { trees: true, neighbours: 2, neighbourHeight: 9, road: true, groundColor: "#cfd8c4" };

export interface EnvItem { type: "tree" | "block" | "road" | "car"; x: number; z: number; w: number; d: number; h: number; color: string }
export interface Env { items: EnvItem[]; ground: string; clearance: number }
export interface Bounds2 { minX: number; maxX: number; minY: number; maxY: number }

// mulberry32
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

interface Spec { trees: number; blocks: number; blockH: [number, number]; road: boolean; ground: string; gap: number }
const SPECS: Record<Exclude<EnvPreset, "custom">, Spec> = {
  minimal: { trees: 0, blocks: 0, blockH: [0, 0], road: false, ground: "#d9dfd0", gap: 6 },
  residential: { trees: 10, blocks: 3, blockH: [6, 10], road: true, ground: "#c9d8b6", gap: 5 },
  urban: { trees: 4, blocks: 6, blockH: [12, 28], road: true, ground: "#b8bcc2", gap: 3 },
  commercial: { trees: 3, blocks: 5, blockH: [15, 36], road: true, ground: "#c4c7cc", gap: 4 },
};

const overlaps = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }, pad = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + pad;

/**
 * Build the surroundings around a footprint (model coords: x east, y north; three z = -y).
 * Everything stays at least `gap` metres away from the footprint's bounding box.
 */
export function buildEnvironment(preset: EnvPreset, b: Bounds2, custom: CustomEnv = DEFAULT_CUSTOM, seed = 7): Env {
  const spec: Spec = preset === "custom"
    ? { trees: custom.trees ? 8 : 0, blocks: clamp(Math.round(custom.neighbours), 0, 8), blockH: [clamp(custom.neighbourHeight, 3, 60) * 0.8, clamp(custom.neighbourHeight, 3, 60)], road: custom.road, ground: /^#[0-9a-f]{6}$/i.test(custom.groundColor) ? custom.groundColor : DEFAULT_CUSTOM.groundColor, gap: 5 }
    : SPECS[preset];
  const r = rng(seed);
  const cx = (b.minX + b.maxX) / 2, cz = -(b.minY + b.maxY) / 2;
  const w = b.maxX - b.minX, d = b.maxY - b.minY;
  const R = Math.max(w, d, 6);
  const keepOut = { x: cx, z: cz, w: w + spec.gap * 2, d: d + spec.gap * 2 };
  const items: EnvItem[] = [];
  const free = (it: { x: number; z: number; w: number; d: number }, pad = 0.5) => !overlaps(it, keepOut) && !items.some((o) => o.type !== "road" && overlaps(it, o, pad));
  // keep context items off the road strip too
  const roadZ = cz + d / 2 + spec.gap + 3.5; // in front (south = +z in three), 7 m wide strip
  if (spec.road) {
    const road = { x: cx, z: roadZ + 0, w: R * 6, d: 7 };
    if (!overlaps(road, keepOut)) items.push({ type: "road", ...road, h: 0.02, color: "#374151" });
  }
  const road = items.find((i) => i.type === "road");
  const notOnRoad = (it: { x: number; z: number; w: number; d: number }) => !road || !overlaps(it, road);

  for (let i = 0, tries = 0; i < spec.blocks && tries < 200; tries++) {
    const bw = 5 + r() * 7, bd = 5 + r() * 7, ang = r() * Math.PI * 2, rad = R * (0.9 + r() * 1.1) + spec.gap + 6;
    const it = { x: cx + Math.cos(ang) * rad, z: cz + Math.sin(ang) * rad, w: bw, d: bd };
    if (!free(it, 1.5) || !notOnRoad(it)) continue;
    const [lo, hi] = spec.blockH;
    items.push({ type: "block", ...it, h: lo + r() * (hi - lo), color: ["#cbd5e1", "#d6c7a1", "#e5e7eb", "#b8a99a"][Math.floor(r() * 4)] });
    i++;
  }
  for (let i = 0, tries = 0; i < spec.trees && tries < 300; tries++) {
    const ang = r() * Math.PI * 2, rad = R * (0.8 + r() * 1.2) + spec.gap + 2, s = 1.6 + r() * 1.8;
    const it = { x: cx + Math.cos(ang) * rad, z: cz + Math.sin(ang) * rad, w: s, d: s };
    if (!free(it, 0.5) || !notOnRoad(it)) continue;
    items.push({ type: "tree", ...it, h: 3 + r() * 3, color: "#3f7d3a" });
    i++;
  }
  if (road && preset !== "minimal") {
    const car = { x: cx - R * 0.5 + r() * R, z: road.z, w: 4, d: 1.8 };
    items.push({ type: "car", ...car, h: 1.4, color: ["#ef4444", "#3b82f6", "#f8fafc"][Math.floor(r() * 3)] });
  }
  return { items, ground: spec.ground, clearance: spec.gap };
}

export const ENV_NOTE = { en: "Surroundings are generic placeholders, not the real site.", bn: "পারিপার্শ্বিক সাধারণ নমুনা, প্রকৃত সাইট নয়।" };
