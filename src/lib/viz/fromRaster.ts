import type { RasterAnalysis } from "../../../supabase/functions/viz-analyze/normalize";
import { DEFAULTS, type BuildingModel, type Opening, type Pt, type Wall } from "./types";
import { deriveFootprint, emptyModel, recenter, uid } from "./model";
import { scaleFromDimensions, parseDimensionText, dist } from "./units";

export interface ImageSize { width: number; height: number }

/** Dimension samples (px length ↔ metres) usable for automatic calibration. */
export function dimensionSamples(a: RasterAnalysis, img: ImageSize) {
  return a.dimensions.flatMap((d) => {
    const valueM = d.valueM ?? (d.text ? parseDimensionText(d.text, "ft") : null);
    const px = Math.hypot((d.b.x - d.a.x) * img.width, (d.b.y - d.a.y) * img.height);
    return valueM && px > 5 && d.confidence >= 0.5 ? [{ valueM, px }] : [];
  });
}

/** Automatic scale from printed dimensions. Returns null (→ user must calibrate) if none are reliable. */
export function autoScale(a: RasterAnalysis, img: ImageSize) {
  const s = scaleFromDimensions(dimensionSamples(a, img));
  return s && s.spreadPct <= 15 ? s : null;
}

/**
 * Convert a normalised raster analysis into a model draft, given metres-per-pixel.
 * Everything is "vision" sourced; geometry is only "reference" when the scale itself came from
 * printed dimensions / a user calibration (and even then plan line-work is an AI trace → verified=false).
 */
export function rasterToModel(a: RasterAnalysis, img: ImageSize, mpp: number, scaleSource: "dimensions" | "manual" | "area-assumed", opts: { name?: string; floors?: number } = {}): BuildingModel {
  const m = emptyModel(opts.name ?? "Plan import");
  const P = (p: { x: number; y: number }): Pt => ({ x: p.x * img.width * mpp, y: (1 - p.y) * img.height * mpp });
  const basis = scaleSource === "area-assumed" ? "estimated" as const : "reference" as const;
  const base = (confidence: number) => ({ confidence, source: "vision" as const, basis, verified: false });

  m.sourceType = "plan";
  m.scale = { source: scaleSource, metersPerPixel: mpp };
  m.floors = opts.floors ?? a.floors.value ?? 1;
  if (!opts.floors && a.floors.value === null) m.assumptions.push("Floor count could not be detected — set to 1. Please confirm.");

  m.walls = a.walls.map((w): Wall => ({
    ...base(w.confidence), id: uid("w"), a: P(w.a), b: P(w.b), exterior: w.exterior, floor: "all",
    thickness: w.thicknessRel ? Math.min(0.5, Math.max(0.08, w.thicknessRel * img.width * mpp)) : (w.exterior ? DEFAULTS.extWall : DEFAULTS.intWall),
  }));
  const mkOpen = (kind: "door" | "win") => (b: RasterAnalysis["doors"][number]): Opening => ({
    ...base(b.confidence), id: uid(kind === "door" ? "d" : "wi"), c: P(b.c), floor: "all",
    width: Math.min(3.5, Math.max(0.5, b.wRel * img.width * mpp)),
    height: kind === "door" ? DEFAULTS.doorH : DEFAULTS.winH, sill: kind === "door" ? 0 : DEFAULTS.winSill,
  });
  m.doors = a.doors.map(mkOpen("door")); m.windows = a.windows.map(mkOpen("win"));
  m.columns = a.columns.map((c) => ({ ...base(c.confidence), id: uid("c"), c: P(c.c), floor: "all" as const, size: Math.min(1, Math.max(0.2, c.wRel * img.width * mpp)) || DEFAULTS.column }));
  m.stairs = a.stairs.slice(0, 1).map((s) => ({ ...base(s.confidence), id: uid("s"), c: P(s.c), w: Math.max(0.9, s.wRel * img.width * mpp), d: Math.max(0.9, s.hRel * img.width * mpp), rotation: 0, floor: "all" as const }));
  m.balconies = a.balconies.map((s) => ({ ...base(s.confidence), id: uid("b"), c: P(s.c), w: Math.max(0.8, s.wRel * img.width * mpp), d: Math.max(0.8, s.hRel * img.width * mpp), rotation: 0, floor: "all" as const }));
  m.rooms = a.labels.map((l) => ({ ...base(l.confidence), id: uid("room"), name: l.text, c: P(l.at), floor: "all" as const }));

  m.assumptions.push(...a.assumptions);
  m.assumptions.push("Plan is assumed identical on every floor unless you upload separate floor drawings.");
  m.assumptions.push(`Floor height defaulted to ${DEFAULTS.floorHeight} m; door/window heights and sills are standard defaults.`);
  if (!a.walls.some((w) => w.thicknessRel)) m.assumptions.push(`Wall thickness defaulted (${DEFAULTS.extWall * 100} cm exterior / ${DEFAULTS.intWall * 100} cm interior).`);
  if (scaleSource === "area-assumed") m.assumptions.push("Scale was estimated from the approximate building area you entered — all dimensions are AI-estimated.");
  m.warnings.push(...a.warnings);

  const c = recenter(m);
  c.footprint = { points: deriveFootprint(c), basis: "estimated" };
  return c;
}

/** Scale such that the plan's footprint bounding box matches an approximate total area (last-resort, flagged "estimated"). */
export function mppFromArea(a: RasterAnalysis, img: ImageSize, areaM2: number): number | null {
  const pts = a.walls.flatMap((w) => [w.a, w.b]);
  if (pts.length < 3 || !(areaM2 > 0)) return null;
  const xs = pts.map((p) => p.x * img.width), ys = pts.map((p) => p.y * img.height);
  const pxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  return pxArea > 0 ? Math.sqrt(areaM2 / pxArea) : null;
}

/**
 * Render / elevation reference → CONCEPTUAL massing. A single perspective image cannot give hidden
 * dimensions, so width/depth come from the user (or the approximate area) and are labelled estimated.
 */
export function massingFromRender(a: RasterAnalysis | null, p: { widthM: number; depthM: number; floors: number; name?: string }): BuildingModel {
  const m = emptyModel(p.name ?? "Render reconstruction");
  m.sourceType = "render"; m.conceptual = true; m.floors = p.floors;
  m.scale = { source: "area-assumed" };
  const { widthM: W, depthM: D } = p;
  const mk = () => ({ confidence: 0.35, source: "inferred" as const, basis: "estimated" as const, verified: false });
  const corners: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }];
  corners.forEach((c, i) => m.walls.push({ ...mk(), id: uid("w"), a: c, b: corners[(i + 1) % 4], thickness: DEFAULTS.extWall, exterior: true, floor: "all" }));
  m.footprint = { points: corners, basis: "estimated" };
  for (const c of [{ x: 0.1, y: 0.1 }, { x: W - 0.1, y: 0.1 }, { x: W - 0.1, y: D - 0.1 }, { x: 0.1, y: D - 0.1 }]) m.columns.push({ ...mk(), id: uid("c"), c, size: DEFAULTS.column, floor: "all" });
  // facade windows: spread the detected count (or a plausible default) along the front wall of each floor
  const n = Math.max(1, Math.min(8, a?.render?.facadeWindowCount ? Math.ceil(a.render.facadeWindowCount / Math.max(1, p.floors)) : Math.floor(W / 3)));
  for (let i = 0; i < n; i++) m.windows.push({ ...mk(), id: uid("wi"), c: { x: ((i + 0.5) * W) / n, y: 0 }, width: DEFAULTS.winW, height: DEFAULTS.winH, sill: DEFAULTS.winSill, floor: "all" });
  m.doors.push({ ...mk(), id: uid("d"), c: { x: W / 2, y: 0 }, width: DEFAULTS.doorW, height: DEFAULTS.doorH, sill: 0, floor: 0 });
  m.roof = { type: a?.render?.roof === "gable" ? "gable" : "flat", parapet: DEFAULTS.parapet, basis: "estimated" };
  m.assumptions.push("CONCEPTUAL 3D RECONSTRUCTION: a single render cannot show hidden dimensions. Width, depth, structure and interior layout are AI-estimated placeholders.");
  m.assumptions.push("Structural elements (columns, beams, slabs) are generic assumptions — not engineering design.");
  if (a?.render) { m.assumptions.push(`Detected from the image: ${a.render.materials.join(", ") || "no materials"}; roof ${a.render.roof}.`); }
  m.warnings.push("Conceptual reconstruction — verify every dimension before relying on it.");
  return m;
}

export { dist };
