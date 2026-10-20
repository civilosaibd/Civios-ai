// Pure helpers shared by the viz-analyze edge function and the unit tests.
// NO Deno / Node globals in here. Everything coming back from the model is untrusted:
// it is clamped, type-checked and anything unusable is dropped (and reported) instead of guessed.

export interface NPt { x: number; y: number }            // 0..1 of image width / height, y down
export interface NWall { a: NPt; b: NPt; exterior: boolean; thicknessRel: number | null; confidence: number }
export interface NBox { c: NPt; wRel: number; hRel: number; rotation: number; confidence: number }
export interface NLabel { text: string; at: NPt; confidence: number }
export interface NDimension { text: string; valueM: number | null; a: NPt; b: NPt; confidence: number }
export interface RasterAnalysis {
  drawingType: "floor_plan" | "elevation" | "section" | "site_plan" | "render" | "other";
  floors: { value: number | null; confidence: number };
  labels: NLabel[]; walls: NWall[]; doors: NBox[]; windows: NBox[]; columns: NBox[]; stairs: NBox[]; balconies: NBox[];
  dimensions: NDimension[];
  scaleNote: string | null;
  render: { floors: number | null; roof: "flat" | "gable" | "unknown"; materials: string[]; colors: string[]; facadeWindowCount: number | null } | null;
  warnings: string[];
  assumptions: string[];
  dropped: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const c01 = (v: unknown, d = 0.5) => { const n = num(v); return n === null ? d : Math.min(1, Math.max(0, n)); };
const pt = (v: any): NPt | null => {
  const x = num(v?.x), y = num(v?.y);
  if (x === null || y === null || x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
};
const str = (v: unknown, max = 60) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

export function normalizeRasterAnalysis(raw: unknown): RasterAnalysis {
  const r: any = raw && typeof raw === "object" ? raw : {};
  let dropped = 0;
  const arr = (v: unknown, cap: number): any[] => (Array.isArray(v) ? v.slice(0, cap) : []);

  const walls: NWall[] = [];
  for (const w of arr(r.walls, 600)) {
    const a = pt(w?.a ?? { x: w?.x1, y: w?.y1 }), b = pt(w?.b ?? { x: w?.x2, y: w?.y2 });
    if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) < 0.01) { dropped++; continue; }
    const t = num(w?.thickness_rel);
    walls.push({ a, b, exterior: w?.exterior === true, thicknessRel: t !== null && t > 0 && t < 0.1 ? t : null, confidence: c01(w?.confidence) });
  }
  const box = (v: any): NBox | null => {
    const c = pt(v?.c ?? v); const w = num(v?.w_rel ?? v?.width_rel), h = num(v?.h_rel ?? v?.height_rel ?? v?.w_rel ?? v?.width_rel);
    if (!c || w === null || w <= 0 || w > 0.6 || h === null || h <= 0 || h > 0.6) return null;
    return { c, wRel: w, hRel: h, rotation: num(v?.rotation) ?? 0, confidence: c01(v?.confidence) };
  };
  const boxes = (v: unknown, cap: number) => arr(v, cap).flatMap((b) => { const x = box(b); if (!x) { dropped++; return []; } return [x]; });

  const labels: NLabel[] = [];
  for (const l of arr(r.labels, 200)) {
    const at = pt(l?.at ?? l), text = str(l?.text);
    if (!at || !text) { dropped++; continue; }
    labels.push({ text, at, confidence: c01(l?.confidence) });
  }
  const dimensions: NDimension[] = [];
  for (const d of arr(r.dimensions, 100)) {
    const a = pt(d?.a ?? { x: d?.x1, y: d?.y1 }), b = pt(d?.b ?? { x: d?.x2, y: d?.y2 });
    const v = num(d?.value_m);
    if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) < 0.02) { dropped++; continue; }
    dimensions.push({ text: str(d?.text, 30), valueM: v !== null && v > 0.1 && v < 200 ? v : null, a, b, confidence: c01(d?.confidence, 0.4) });
  }

  const types = ["floor_plan", "elevation", "section", "site_plan", "render", "other"] as const;
  const drawingType = (types as readonly string[]).includes(r.drawing_type) ? r.drawing_type : "other";
  const fl = num(r.floors?.value ?? r.floors_detected?.value);
  const floors = { value: fl !== null && Number.isInteger(fl) && fl >= 1 && fl <= 40 ? fl : null, confidence: c01(r.floors?.confidence ?? r.floors_detected?.confidence, 0.3) };
  const ri = r.render_info;
  const render = ri && typeof ri === "object" ? {
    floors: (() => { const f = num(ri.floors); return f !== null && Number.isInteger(f) && f >= 1 && f <= 40 ? f : null; })(),
    roof: ["flat", "gable"].includes(ri.roof) ? ri.roof : "unknown",
    materials: arr(ri.materials, 8).map((x) => str(x, 30)).filter(Boolean),
    colors: arr(ri.colors, 8).map((x) => str(x, 20)).filter(Boolean),
    facadeWindowCount: (() => { const n = num(ri.window_count); return n !== null && n >= 0 && n < 500 ? Math.round(n) : null; })(),
  } as RasterAnalysis["render"] : null;

  const warnings = arr(r.warnings, 20).map((x) => str(x, 200)).filter(Boolean);
  if (dropped) warnings.push(`${dropped} detected item(s) had invalid geometry and were ignored.`);
  if (drawingType === "floor_plan" && walls.length < 4) warnings.push("Very few walls were detected. The plan may be too small, blurry or hand-drawn — review carefully or trace walls manually.");

  return {
    drawingType: drawingType as RasterAnalysis["drawingType"], floors, labels, walls,
    doors: boxes(r.doors, 200), windows: boxes(r.windows, 300), columns: boxes(r.columns, 400), stairs: boxes(r.stairs, 10), balconies: boxes(r.balconies, 20),
    dimensions, scaleNote: str(r.scale_note, 40) || null, render, warnings,
    assumptions: arr(r.assumptions, 20).map((x) => str(x, 200)).filter(Boolean), dropped,
  };
}

export const RASTER_SYSTEM_PROMPT = `You analyse architectural drawings and renders for a civil-engineering visualisation tool (Bangladesh context).
Return ONLY a JSON object. All coordinates are NORMALISED to the image: x = 0..1 left→right, y = 0..1 top→bottom.
STRICT RULES: never invent geometry, labels or dimensions that are not visible. If unsure, omit the item or give a LOW confidence (0..1). Never output real-world dimensions unless a dimension text is printed on the drawing.
Schema:
{
 "drawing_type": "floor_plan"|"elevation"|"section"|"site_plan"|"render"|"other",
 "floors": {"value": integer|null, "confidence": 0..1},
 "labels": [{"text": string, "at": {"x":n,"y":n}, "confidence": n}],            // room names exactly as printed
 "walls": [{"a":{"x":n,"y":n},"b":{"x":n,"y":n},"exterior":bool,"thickness_rel":n|null,"confidence":n}],  // centre-lines
 "doors": [{"c":{"x":n,"y":n},"w_rel":n,"confidence":n}],
 "windows": [{"c":{"x":n,"y":n},"w_rel":n,"confidence":n}],
 "columns": [{"c":{"x":n,"y":n},"w_rel":n,"confidence":n}],
 "stairs": [{"c":{"x":n,"y":n},"w_rel":n,"h_rel":n,"confidence":n}],
 "balconies": [{"c":{"x":n,"y":n},"w_rel":n,"h_rel":n,"confidence":n}],
 "dimensions": [{"text": string, "value_m": number|null, "a":{"x":n,"y":n}, "b":{"x":n,"y":n}, "confidence": n}], // endpoints of each PRINTED dimension line; value_m only if you can read the text unambiguously
 "scale_note": string|null,                                                   // e.g. "1:100" if printed
 "render_info": {"floors": integer|null, "roof": "flat"|"gable"|"unknown", "materials": [string], "colors": [string], "window_count": integer|null} | null,   // only for renders / elevations
 "warnings": [string], "assumptions": [string]
}
w_rel / h_rel are relative to image WIDTH. Report every limitation (blur, cropped, missing dimensions) in "warnings".`;

// ---- upload validation (also used client-side) -----------------------------------------------
export type VizFileKind = "image" | "pdf" | "dxf" | "dwg";
export const ALLOWED_EXT: Record<string, VizFileKind> = { jpg: "image", jpeg: "image", png: "image", webp: "image", pdf: "pdf", dxf: "dxf", dwg: "dwg" };

export function fileKind(name: string): VizFileKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ALLOWED_EXT[ext] ?? null;
}

/** Magic-byte check so a renamed .exe can't pass as .png. `head` = first bytes of the file. */
export function sniffMatches(kind: VizFileKind, head: Uint8Array): boolean {
  const s = (a: number[]) => a.every((v, i) => head[i] === v);
  switch (kind) {
    case "image": return s([0xff, 0xd8, 0xff]) || s([0x89, 0x50, 0x4e, 0x47]) || (s([0x52, 0x49, 0x46, 0x46]) && head[8] === 0x57 && head[9] === 0x45);
    case "pdf": return s([0x25, 0x50, 0x44, 0x46]);
    case "dwg": return s([0x41, 0x43, 0x31, 0x30]); // "AC10…" (AC1015 etc.)
    case "dxf": { const t = new TextDecoder().decode(head.slice(0, 512)); return /\b(SECTION|HEADER|ENTITIES|0\s*\r?\n\s*SECTION)\b/.test(t) || /^\s*0\s*\r?\n/.test(t); }
  }
}
