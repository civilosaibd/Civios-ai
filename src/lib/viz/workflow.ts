// Pure workflow logic: analysis (+ user calibration) → draft BuildingModel. No I/O, fully unit-tested.
import type { RasterAnalysis } from "../../../supabase/functions/viz-analyze/normalize";
import type { BuildingModel, LinearUnit, UnitSystem } from "./types";
import { autoScale, massingFromRender, mppFromArea, rasterToModel } from "./fromRaster";
import { calibrate, sqftToSqm } from "./units";
import { scaleModel } from "./model";
import { dist } from "./units";

export interface StoredAnalysis {
  model?: string; generated_at?: string; primary_file_id: string; warnings?: string[];
  files: { file_id: string; name: string; width: number | null; height: number | null; analysis: RasterAnalysis }[];
}

export interface Setup { name: string; buildingType: string; floors: number | null; approxAreaSqft: number | null; unitSystem: UnitSystem }
export interface Calibration { known: number; unit: LinearUnit; pixels: number }
export interface RenderDims { widthM: number; depthM: number }

export type Draft =
  | { status: "ready"; model: BuildingModel; mode: "plan" | "render"; scaleLabel: string }
  | { status: "needs_calibration"; reason: string; autoFailed: boolean }
  | { status: "needs_dimensions"; reason: string }
  | { status: "error"; reason: string };

export function primaryOf(a: StoredAnalysis) {
  return a.files.find((f) => f.file_id === a.primary_file_id) ?? a.files[0];
}

const isRender = (an: RasterAnalysis) => an.drawingType === "render" || an.drawingType === "elevation" || (an.drawingType !== "floor_plan" && an.walls.length < 4 && !!an.render);

function finish(m: BuildingModel, s: Setup): BuildingModel {
  return { ...m, name: s.name, buildingType: s.buildingType, unitSystem: s.unitSystem };
}

export function buildDraft(stored: StoredAnalysis, s: Setup, o: { calibration?: Calibration | null; renderDims?: RenderDims | null; forceMode?: "plan" | "render" | null } = {}): Draft {
  const p = primaryOf(stored);
  if (!p) return { status: "error", reason: "No analysed drawing found." };
  const an = p.analysis;
  const mode = o.forceMode ?? (isRender(an) ? "render" : "plan");

  if (mode === "render") {
    let dims = o.renderDims ?? null;
    let note: string | null = null;
    if (!dims && s.approxAreaSqft && s.approxAreaSqft > 0) {
      // area is total built area over all floors → footprint per floor, 4:3 assumed (flagged)
      const foot = sqftToSqm(s.approxAreaSqft) / Math.max(1, s.floors ?? an.render?.floors ?? 1);
      dims = { widthM: Math.sqrt(foot * (4 / 3)), depthM: Math.sqrt(foot * (3 / 4)) };
      note = `Width/depth (${dims.widthM.toFixed(1)} × ${dims.depthM.toFixed(1)} m) were derived from your approximate area assuming a 4:3 footprint — AI-estimated.`;
    }
    if (!dims) return { status: "needs_dimensions", reason: "A render shows only one side of the building. Enter the overall width and depth (or an approximate total area) to build a conceptual model." };
    if (!(dims.widthM >= 2 && dims.depthM >= 2 && dims.widthM <= 200 && dims.depthM <= 200)) return { status: "error", reason: "Width and depth must be between 2 m and 200 m." };
    const floors = s.floors ?? an.render?.floors ?? 1;
    const m = massingFromRender(an, { widthM: dims.widthM, depthM: dims.depthM, floors, name: s.name });
    if (note) m.assumptions.push(note);
    if (s.floors === null && an.render?.floors) m.assumptions.push(`Floor count (${floors}) was read from the image by AI — please confirm.`);
    return { status: "ready", model: finish(m, s), mode: "render", scaleLabel: "Conceptual — dimensions entered by you" };
  }

  if (!p.width || !p.height) return { status: "error", reason: "Image size is unknown. Re-upload the drawing." };
  const img = { width: p.width, height: p.height };
  const opts = { name: s.name, floors: s.floors ?? undefined };

  if (an.walls.length < 3) return { status: "error", reason: "Fewer than 3 walls were detected, so no floor plan can be built. Upload a clearer plan or a DXF." };

  // priority: user calibration > printed dimensions > approximate area
  if (o.calibration) {
    let mpp: number;
    try { mpp = calibrate(o.calibration.known, o.calibration.unit, o.calibration.pixels); } catch (e) { return { status: "error", reason: (e as Error).message }; }
    return { status: "ready", mode: "plan", model: finish(rasterToModel(an, img, mpp, "manual", opts), s), scaleLabel: `Manual calibration (${o.calibration.known} ${o.calibration.unit} = ${Math.round(o.calibration.pixels)} px)` };
  }
  const auto = autoScale(an, img);
  if (auto) {
    const m = rasterToModel(an, img, auto.metersPerPixel, "dimensions", opts);
    m.scale.spreadPct = auto.spreadPct;
    if (auto.spreadPct > 5) m.warnings.push(`Printed dimensions disagree by ${auto.spreadPct.toFixed(0)}% — check the scale.`);
    return { status: "ready", mode: "plan", model: finish(m, s), scaleLabel: `Auto from ${auto.used} printed dimension(s)` };
  }
  return { status: "needs_calibration", autoFailed: true, reason: "No reliable printed dimensions were found. Calibrate with one known dimension (recommended)." };
}

/** Last-resort scale from approximate area (explicitly "estimated"). */
export function areaFallbackDraft(stored: StoredAnalysis, s: Setup): Draft {
  const p = primaryOf(stored);
  if (!p?.width || !p.height) return { status: "error", reason: "Image size is unknown." };
  if (!s.approxAreaSqft) return { status: "error", reason: "Enter an approximate area first." };
  const perFloor = sqftToSqm(s.approxAreaSqft) / Math.max(1, s.floors ?? 1);
  const mpp = mppFromArea(p.analysis, { width: p.width, height: p.height }, perFloor);
  if (!mpp) return { status: "error", reason: "Area-based scaling needs at least 3 detected walls." };
  return { status: "ready", mode: "plan", model: finish(rasterToModel(p.analysis, { width: p.width, height: p.height }, mpp, "area-assumed", { name: s.name, floors: s.floors ?? undefined }), s), scaleLabel: "Estimated from approximate area (AI-inferred)" };
}

/** DXF with no unit information: user states the real length of a wall they pick. */
export function calibrateDxfByWall(m: BuildingModel, wallId: string, known: number, unit: LinearUnit): BuildingModel {
  const w = m.walls.find((x) => x.id === wallId);
  if (!w) throw new Error("Wall not found.");
  const len = dist(w.a, w.b);
  const factor = calibrate(known, unit, len); // metres per drawing unit
  const scaled = scaleModel(m, factor, factor);
  return { ...scaled, scale: { source: "manual", metersPerPixel: factor }, walls: scaled.walls.map((x) => ({ ...x, thickness: m.walls.find((y) => y.id === x.id)!.thickness })) };
}
