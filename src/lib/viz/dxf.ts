import { DEFAULTS, type BuildingModel, type Pt, type Wall, type Opening, type Column } from "./types";
import { deriveFootprint, emptyModel, recenter, uid } from "./model";
import { TO_METERS, dxfUnitFromInsUnits } from "./units";

// Deterministic DXF → BuildingModel draft. No AI involved: everything read here is "reference" data
// *when the layer names are recognisable*; otherwise confidence stays low and the user must verify.

interface Ent { type: string; layer: string; pts: Pt[]; closed?: boolean; text?: string; r?: number; ins?: Pt; block?: string }
export interface DxfParseResult { model: BuildingModel; layers: Record<string, number>; unitsFromFile: boolean; entityCount: number; notes: string[] }

const rx = {
  wall: /(wall|wal\b|brick|partition|দেয়াল)/i, col: /(col|column)/i, door: /(door|\bdr\b)/i, win: /(win|wnd|window)/i,
  stair: /(stair|step)/i, bal: /(balcon|verand)/i, text: /(text|label|room|name|anno)/i,
  noise: /(dim|hatch|grid|axis|center|centre|furn|elec|plumb|hvac|pipe|ceil|defpoints|viewport|title|border|frame)/i,
};

function pairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isNaN(code)) out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

export function parseDxfToModel(text: string, opts: { name?: string; floors?: number } = {}): DxfParseResult {
  if (!/\bSECTION\b/.test(text) || !/\bENTITIES\b/.test(text)) throw new Error("This does not look like a valid ASCII DXF file (no ENTITIES section). Binary DXF and DWG are not supported — export as ASCII DXF.");
  const p = pairs(text);
  const notes: string[] = [];

  // header units
  let insUnits: number | undefined;
  for (let i = 0; i < p.length; i++) if (p[i][0] === 9 && p[i][1] === "$INSUNITS" && p[i + 1]) insUnits = parseInt(p[i + 1][1], 10);
  let unit = dxfUnitFromInsUnits(insUnits);

  // entities
  const start = p.findIndex(([c, v], i) => c === 2 && v === "ENTITIES" && p[i - 1]?.[1] === "SECTION");
  const ents: Ent[] = [];
  let cur: Ent | null = null, polyOpen = false;
  const push = () => { if (cur) ents.push(cur); cur = null; };
  for (let i = start + 1; i < p.length; i++) {
    const [c, v] = p[i];
    if (c === 0) {
      if (v === "ENDSEC") { push(); break; }
      if (v === "SEQEND") { push(); polyOpen = false; continue; }
      if (v === "VERTEX" && polyOpen && cur) { (cur as Ent).pts.push({ x: 0, y: 0 }); continue; }
      if (v === "VERTEX" && polyOpen) continue;
      push();
      if (["LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "TEXT", "MTEXT", "INSERT", "ARC"].includes(v)) { cur = { type: v, layer: "0", pts: [] }; polyOpen = v === "POLYLINE"; }
      continue;
    }
    if (!cur) continue;
    const e: Ent = cur;
    const n = parseFloat(v);
    if (c === 8) e.layer = v;
    else if (e.type === "LINE") { if (c === 10 || c === 11) e.pts.push({ x: n, y: 0 }); else if (c === 20 || c === 21) e.pts[e.pts.length - 1].y = n; }
    else if (e.type === "LWPOLYLINE") { if (c === 10) e.pts.push({ x: n, y: 0 }); else if (c === 20 && e.pts.length) e.pts[e.pts.length - 1].y = n; else if (c === 70) e.closed = (parseInt(v, 10) & 1) === 1; }
    else if (e.type === "POLYLINE") { if (c === 70) e.closed = (parseInt(v, 10) & 1) === 1; if (c === 10 && e.pts.length) e.pts[e.pts.length - 1].x = n; if (c === 20 && e.pts.length) e.pts[e.pts.length - 1].y = n; }
    else if (e.type === "CIRCLE" || e.type === "ARC") { if (c === 10) e.pts = [{ x: n, y: 0 }]; else if (c === 20 && e.pts[0]) e.pts[0].y = n; else if (c === 40) e.r = n; }
    else if (e.type === "TEXT" || e.type === "MTEXT") { if (c === 10) e.pts = [{ x: n, y: 0 }]; else if (c === 20 && e.pts[0]) e.pts[0].y = n; else if (c === 1 || c === 3) e.text = (e.text ?? "") + v; }
    else if (e.type === "INSERT") { if (c === 2) e.block = v; else if (c === 10) e.pts = [{ x: n, y: 0 }]; else if (c === 20 && e.pts[0]) e.pts[0].y = n; }
  }
  push();

  const layers: Record<string, number> = {};
  for (const e of ents) layers[e.layer] = (layers[e.layer] ?? 0) + 1;

  // If no header units, take a guess ONLY to pre-fill the calibration UI — never trust silently.
  const allPts = ents.flatMap((e) => e.pts);
  const xs = allPts.map((q) => q.x), ys = allPts.map((q) => q.y);
  const span = allPts.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
  const unitsFromFile = !!unit;
  if (!unit) {
    unit = span > 5000 ? "mm" : span > 500 ? "cm" : span > 100 ? "ft" : "m";
    notes.push(`The DXF has no unit information. Assuming ${unit} from the drawing size — please check the overall dimensions on the verify screen.`);
  }
  const k = TO_METERS[unit];
  const M = (q: Pt): Pt => ({ x: q.x * k, y: q.y * k });

  const m = emptyModel(opts.name ?? "DXF import");
  m.sourceType = "dxf"; m.floors = opts.floors ?? 1;
  m.scale = unitsFromFile ? { source: "dxf" } : { source: "none" };
  const basis = unitsFromFile ? "reference" as const : "estimated" as const;

  const mk = (layerMatched: boolean) => ({ id: "", confidence: layerMatched ? (unitsFromFile ? 0.92 : 0.7) : 0.4, source: "dxf" as const, basis, verified: false });

  for (const e of ents) {
    const cls = rx.noise.test(e.layer) && !rx.wall.test(e.layer) ? "noise" : rx.col.test(e.layer) ? "col" : rx.door.test(e.layer) ? "door" : rx.win.test(e.layer) ? "win" : rx.stair.test(e.layer) ? "stair" : rx.bal.test(e.layer) ? "bal" : rx.wall.test(e.layer) ? "wall" : rx.text.test(e.layer) || e.type === "TEXT" || e.type === "MTEXT" ? "text" : "other";
    if (cls === "noise") continue;
    if (e.type === "TEXT" || e.type === "MTEXT") {
      const label = (e.text ?? "").replace(/\\P/g, " ").replace(/\{[^}]*\}|\\[A-Za-z][^;]*;/g, "").trim();
      if (label && e.pts[0] && !/^[\d.\s'"-]+$/.test(label)) m.rooms.push({ id: uid("room"), name: label.slice(0, 40), c: M(e.pts[0]), floor: "all", confidence: 0.8, source: "dxf", basis: "reference", verified: false });
      continue;
    }
    if (cls === "wall") {
      const pts = e.pts.map(M);
      const segs: [Pt, Pt][] = [];
      for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
      if (e.closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
      for (const [a, b] of segs) if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.3)
        m.walls.push({ ...mk(true), id: uid("w"), a, b, thickness: DEFAULTS.intWall, exterior: false, floor: "all" } as Wall);
    } else if (cls === "col" && e.pts.length) {
      const pts = e.pts.map(M);
      const c0 = e.type === "CIRCLE" ? pts[0] : { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
      const xsC = pts.map((q) => q.x), ysC = pts.map((q) => q.y);
      const size = e.type === "CIRCLE" && e.r ? e.r * 2 * k : Math.max(Math.max(...xsC) - Math.min(...xsC), Math.max(...ysC) - Math.min(...ysC));
      m.columns.push({ ...mk(true), id: uid("c"), c: c0, size: size >= 0.15 && size <= 1.5 ? size : DEFAULTS.column, floor: "all" } as Column);
    } else if ((cls === "door" || cls === "win") && e.pts.length) {
      const pts = e.pts.map(M);
      const c0 = { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
      const xsO = pts.map((q) => q.x), ysO = pts.map((q) => q.y);
      const span2 = Math.max(Math.max(...xsO) - Math.min(...xsO), Math.max(...ysO) - Math.min(...ysO));
      const width = pts.length > 1 && span2 >= 0.4 && span2 <= 3.5 ? span2 : (cls === "door" ? DEFAULTS.doorW : DEFAULTS.winW);
      const o: Opening = { ...mk(true), id: uid(cls === "door" ? "d" : "wi"), c: c0, width, height: cls === "door" ? DEFAULTS.doorH : DEFAULTS.winH, sill: cls === "door" ? 0 : DEFAULTS.winSill, floor: "all" };
      (cls === "door" ? m.doors : m.windows).push(o);
    } else if (cls === "stair" && e.pts.length > 1) {
      const pts = e.pts.map(M), b = { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
      if (!m.stairs.length) m.stairs.push({ ...mk(true), id: uid("s"), c: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, w: Math.max(b.x1 - b.x0, 0.9), d: Math.max(b.y1 - b.y0, 0.9), rotation: 0, floor: "all" });
    }
  }

  if (!m.walls.length) notes.push("No wall layer was recognised (looked for layer names containing WALL). Rename layers or place walls manually on the verify screen.");
  if (!m.windows.length && !m.doors.length) notes.push("No door/window layers were recognised.");

  // exterior = wall with all other walls on one side is too fragile; use hull-edge proximity instead
  const hull = deriveFootprint(m);
  const near = (w: Wall) => hull.some((h, i) => { const n2 = hull[(i + 1) % hull.length]; return distPtSeg(w.a, h, n2) < 0.15 && distPtSeg(w.b, h, n2) < 0.15; });
  for (const w of m.walls) if (hull.length >= 3 && near(w)) { w.exterior = true; w.thickness = DEFAULTS.extWall; }

  m.assumptions.push(`Wall thickness defaulted to ${DEFAULTS.extWall * 100} cm (exterior) / ${DEFAULTS.intWall * 100} cm (interior) — DXF line-work does not carry thickness.`);
  m.assumptions.push(`Floor height defaulted to ${DEFAULTS.floorHeight} m.`);
  m.assumptions.push("Plan is assumed identical on every floor unless you upload separate floor drawings.");
  m.assumptions.push("Door/window heights and sills are standard defaults.");

  const centered = recenter(m);
  centered.footprint = { points: deriveFootprint(centered), basis: "estimated" };
  return { model: centered, layers, unitsFromFile, entityCount: ents.length, notes };
}

function distPtSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
