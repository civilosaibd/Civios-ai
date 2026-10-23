import type { AreaUnit, LinearUnit, Pt } from "./types";

export const TO_METERS: Record<LinearUnit, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
export const LINEAR_UNITS: LinearUnit[] = ["mm", "cm", "m", "in", "ft"];

export const toMeters = (v: number, u: LinearUnit) => v * TO_METERS[u];
export const fromMeters = (m: number, u: LinearUnit) => m / TO_METERS[u];
export const convert = (v: number, from: LinearUnit, to: LinearUnit) => fromMeters(toMeters(v, from), to);

export const SQFT_PER_SQM = 10.763910416709722;
export const sqmToSqft = (a: number) => a * SQFT_PER_SQM;
export const sqftToSqm = (a: number) => a / SQFT_PER_SQM;
export const fromSqm = (a: number, u: AreaUnit) => (u === "sqft" ? sqmToSqft(a) : a);

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Manual calibration: a known real dimension measured as `pixels` on the drawing → metres per pixel. */
export function calibrate(known: number, unit: LinearUnit, pixels: number): number {
  if (!Number.isFinite(known) || known <= 0) throw new Error("Known dimension must be a positive number.");
  if (!Number.isFinite(pixels) || pixels <= 0) throw new Error("Measured length on the drawing must be greater than zero.");
  return toMeters(known, unit) / pixels;
}

export interface DimensionSample { valueM: number; px: number }

/**
 * Combine several detected dimension annotations into one scale.
 * Uses the median and reports the spread so inconsistent drawings are flagged, not silently trusted.
 */
export function scaleFromDimensions(samples: DimensionSample[]): { metersPerPixel: number; spreadPct: number; used: number } | null {
  const ratios = samples.filter((s) => s.valueM > 0 && s.px > 0).map((s) => s.valueM / s.px).sort((a, b) => a - b);
  if (!ratios.length) return null;
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  const spreadPct = ratios.length > 1 ? ((ratios[ratios.length - 1] - ratios[0]) / median) * 100 : 0;
  return { metersPerPixel: median, spreadPct, used: ratios.length };
}

/** Parse "10'-6\"", "10 ft", "3200", "3.2m", "10ft 6in" … → metres, or null when it cannot be read reliably. */
export function parseDimensionText(text: string, defaultUnit: LinearUnit = "mm"): number | null {
  const s = text.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch(?:es)?)?)?$/);
  if (m) return toMeters(Number(m[1]), "ft") + (m[2] ? toMeters(Number(m[2]), "in") : 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|in|"|ft|')?$/);
  if (m) {
    const u = (m[2] === '"' ? "in" : m[2] === "'" ? "ft" : m[2]) as LinearUnit | undefined;
    return toMeters(Number(m[1]), u ?? defaultUnit);
  }
  return null;
}

export function formatLength(m: number, u: LinearUnit): string {
  const v = fromMeters(m, u);
  const digits = u === "mm" ? 0 : u === "cm" ? 1 : 2;
  return `${v.toFixed(digits)} ${u}`;
}
export function formatArea(sqm: number, u: AreaUnit): string {
  return u === "sqft" ? `${Math.round(sqmToSqft(sqm)).toLocaleString()} sq.ft` : `${sqm.toFixed(1)} sq.m`;
}

/** DXF $INSUNITS → linear unit (null when unitless / unsupported — the user must calibrate). */
export function dxfUnitFromInsUnits(code: number | undefined): LinearUnit | null {
  switch (code) { case 1: return "in"; case 2: return "ft"; case 4: return "mm"; case 5: return "cm"; case 6: return "m"; default: return null; }
}
