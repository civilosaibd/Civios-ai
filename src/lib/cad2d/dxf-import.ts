import type { CadDocument, CadEntity, CadLayer, Point2D } from "./geometry";

type Pair = { code: number; value: string };
type RecordEntity = { type: string; pairs: Pair[] };

const finite = (value: string | undefined, fallback = NaN) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const first = (pairs: Pair[], code: number) => pairs.find((p) => p.code === code)?.value;
const all = (pairs: Pair[], code: number) => pairs.filter((p) => p.code === code).map((p) => p.value);
const point = (pairs: Pair[], xCode: number, yCode: number): Point2D => ({
  x: finite(first(pairs, xCode) ?? ""),
  y: finite(first(pairs, yCode) ?? ""),
});
const validPoint = (p: Point2D) => Number.isFinite(p.x) && Number.isFinite(p.y);

function readPairs(source: string): Pair[] {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (Number.isInteger(code)) pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

function readRecords(pairs: Pair[]): { records: RecordEntity[]; header: Pair[]; tableLayers: Map<string, string> } {
  const records: RecordEntity[] = [];
  const header: Pair[] = [];
  const tableLayers = new Map<string, string>();
  let section = "";
  let current: RecordEntity | null = null;
  let table = "";
  let pendingLayer = "";
  for (const pair of pairs) {
    if (pair.code === 0 && pair.value === "SECTION") { section = ""; current = null; continue; }
    if (pair.code === 2 && !section) { section = pair.value.toUpperCase(); continue; }
    if (pair.code === 0 && pair.value === "ENDSEC") { current = null; section = ""; continue; }
    if (section === "HEADER") header.push(pair);
    if (section === "TABLES") {
      if (pair.code === 0 && pair.value === "TABLE") { table = ""; continue; }
      if (pair.code === 2 && table === "") { table = pair.value.toUpperCase(); continue; }
      if (table === "LAYER" && pair.code === 0 && pair.value === "LAYER") { pendingLayer = ""; continue; }
      if (table === "LAYER" && pair.code === 2) pendingLayer = pair.value;
      if (table === "LAYER" && pair.code === 62 && pendingLayer) tableLayers.set(pendingLayer, pair.value);
      if (pair.code === 0 && pair.value === "ENDTAB") table = "";
    }
    if (section !== "ENTITIES") continue;
    if (pair.code === 0) {
      current = { type: pair.value.toUpperCase(), pairs: [] };
      records.push(current);
    } else if (current) current.pairs.push(pair);
  }
  return { records, header, tableLayers };
}

const unitFromInsunits = (value: number | undefined): CadDocument["units"] => {
  switch (value) {
    case 1: return "in";
    case 2: return "ft";
    case 4: return "mm";
    case 5: return "cm";
    case 6: return "m";
    default: return "mm";
  }
};

/** Imports common 2D ASCII DXF entities without silently accepting malformed geometry. */
export function importDxfDocument(source: string, fallbackUnits: CadDocument["units"] = "mm"): {
  document: CadDocument;
  notes: string[];
} {
  if (typeof source !== "string" || !source.trim()) throw new Error("The DXF file is empty.");
  if (source.length > 30_000_000) throw new Error("The DXF file is too large to import in the browser (30 MB limit).");
  const { records, header, tableLayers } = readRecords(readPairs(source));
  if (!records.length) throw new Error("No ENTITIES section was found. Please choose an ASCII DXF file.");
  let insunits: number | undefined;
  for (let i = 0; i < header.length - 1; i++) {
    if (header[i].code === 9 && header[i].value === "$INSUNITS") {
      insunits = finite(header[i + 1]?.value, undefined as unknown as number);
      break;
    }
  }
  const units = insunits === undefined ? fallbackUnits : unitFromInsunits(insunits);
  const layerMap = new Map<string, CadLayer>();
  const ensureLayer = (name: string): string => {
    const safeName = name.trim() || "0";
    const found = layerMap.get(safeName);
    if (found) return found.id;
    const colorIndex = Math.abs(finite(tableLayers.get(safeName), 7));
    const palette: Record<number, string> = { 1: "#ff0000", 2: "#ffff00", 3: "#00ff00", 4: "#00ffff", 5: "#0000ff", 6: "#ff00ff", 7: "#111827", 8: "#808080", 9: "#c0c0c0" };
    const layer: CadLayer = { id: `dxf-layer-${layerMap.size}`, name: safeName, visible: finite(tableLayers.get(safeName), 7) >= 0, color: palette[colorIndex] ?? "#111827", lineWeight: 1 };
    layerMap.set(safeName, layer);
    return layer.id;
  };
  ensureLayer("0");
  const entities: CadEntity[] = [];
  const notes: string[] = [];
  let id = 0;
  const push = (entity: Omit<CadEntity, "id" | "layerId"> & { type: CadEntity["type"] }, layerId: string) => {
    entities.push({ ...entity, id: `dxf-import-${id++}`, layerId } as CadEntity);
  };
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const p = record.pairs;
    const layerId = ensureLayer(first(p, 8) ?? "0");
    const name = record.type;
    if (name === "POLYLINE") {
      const points: Point2D[] = [];
      let j = i + 1;
      while (j < records.length && records[j].type === "VERTEX") {
        const v = point(records[j].pairs, 10, 20);
        if (validPoint(v)) points.push(v);
        j++;
      }
      const closed = (finite(first(p, 70), 0) & 1) === 1;
      if (points.length >= 2) push({ type: "polyline", points, closed }, layerId);
      else notes.push("POLYLINE (invalid or fewer than 2 vertices)");
      i = j - 1;
    } else if (name === "LINE") {
      const start = point(p, 10, 20), end = point(p, 11, 21);
      if (validPoint(start) && validPoint(end) && Math.hypot(end.x - start.x, end.y - start.y) > 1e-9) push({ type: "line", start, end }, layerId);
      else notes.push("LINE (invalid)");
    } else if (name === "LWPOLYLINE") {
      const xs = all(p, 10), ys = all(p, 20);
      const points = xs.map((x, index) => ({ x: finite(x), y: finite(ys[index] ?? "") })).filter(validPoint);
      if (points.length >= 2) push({ type: "polyline", points, closed: (finite(first(p, 70), 0) & 1) === 1 }, layerId);
      else notes.push("LWPOLYLINE (invalid)");
    } else if (name === "CIRCLE") {
      const center = point(p, 10, 20), radius = finite(first(p, 40) ?? "");
      if (validPoint(center) && radius > 0) push({ type: "circle", center, radius }, layerId);
      else notes.push("CIRCLE (invalid)");
    } else if (name === "ARC") {
      const center = point(p, 10, 20), radius = finite(first(p, 40) ?? "");
      const startAngle = finite(first(p, 50) ?? "") * Math.PI / 180;
      const endAngle = finite(first(p, 51) ?? "") * Math.PI / 180;
      if (validPoint(center) && radius > 0 && Number.isFinite(startAngle) && Number.isFinite(endAngle)) push({ type: "arc", center, radius, startAngle, endAngle }, layerId);
      else notes.push("ARC (invalid)");
    } else if (name === "ELLIPSE") {
      const center = point(p, 10, 20), major = point(p, 11, 21);
      const ratio = finite(first(p, 40) ?? "");
      const rx = Math.hypot(major.x, major.y), ry = rx * ratio;
      if (validPoint(center) && rx > 0 && ry > 0 && Math.abs(major.y) < 1e-8) push({ type: "ellipse", center, rx, ry }, layerId);
      else notes.push("ELLIPSE (rotated ellipse not yet supported)");
    } else if (name === "TEXT" || name === "MTEXT") {
      const at = point(p, 10, 20);
      const height = finite(first(p, name === "MTEXT" ? 40 : 40) ?? "", 1);
      const value = name === "MTEXT" ? [...all(p, 3), ...all(p, 1)].join("") : first(p, 1) ?? "";
      if (validPoint(at) && value) push({ type: "text", at, text: value.replace(/\\P/g, "\n"), height: Math.max(height, 0.01), rotation: finite(first(p, 50), 0) * Math.PI / 180 }, layerId);
      else notes.push(`${name} (empty or invalid)`);
    } else if (name === "POINT") {
      const at = point(p, 10, 20);
      if (validPoint(at)) push({ type: "circle", center: at, radius: 0.05 }, layerId);
      else notes.push("POINT (invalid)");
    } else if (name === "SEQEND" || name === "VERTEX") {
      continue;
    } else {
      notes.push(name);
    }
  }
  const document: CadDocument = { version: 2, units, entities, layers: [...layerMap.values()] };
  if (!entities.length) throw new Error("No supported 2D entities were found in this DXF file.");
  return { document, notes: [...new Set(notes)] };
}
