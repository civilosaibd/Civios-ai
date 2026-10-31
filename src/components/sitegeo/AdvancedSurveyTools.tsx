import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Leg = { id: number; bearing: number; distance: number };
type Station = { id: string; easting: number; northing: number; elevation: number; code: string };

const numberText = (n: number, digits = 3) => Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function escapeHtml(value: string) { const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }; return value.replace(/[&<>"']/g, (ch) => entities[ch] || ch); }
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if ((ch === "," || ch === "\t" || ch === ";") && !quoted) { out.push(value.trim()); value = ""; }
    else value += ch;
  }
  out.push(value.trim()); return out;
}


type XY = { x: number; y: number };
type TinTriangle = { a: number; b: number; c: number };
function convexHull(points: Station[]): number[] {
  const sorted = points.map((p, index) => ({ x: p.easting, y: p.northing, index })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted.map((p) => p.index);
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof sorted = [], upper: typeof sorted = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...sorted].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map((p) => p.index);
}
function triangulate(points: Station[]): TinTriangle[] {
  if (points.length < 3 || points.length > 250) return [];
  const raw = points.map((p) => ({ x: p.easting, y: p.northing }));
  const originX = Math.min(...raw.map((p) => p.x)), originY = Math.min(...raw.map((p) => p.y));
  const coords = raw.map((p) => ({ x: p.x - originX, y: p.y - originY }));
  const minX = Math.min(...coords.map((p) => p.x)), maxX = Math.max(...coords.map((p) => p.x));
  const minY = Math.min(...coords.map((p) => p.y)), maxY = Math.max(...coords.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY) || 1, midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  const all = [...coords, { x: midX - 20 * span, y: midY - span }, { x: midX, y: midY + 20 * span }, { x: midX + 20 * span, y: midY - span }];
  const superA = coords.length, superB = coords.length + 1, superC = coords.length + 2;
  let triangles: TinTriangle[] = [{ a: superA, b: superB, c: superC }];
  const circumcircle = (t: TinTriangle) => {
    const A = all[t.a], B = all[t.b], C = all[t.c];
    const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    if (Math.abs(d) < 1e-12) return null;
    const aa = A.x * A.x + A.y * A.y, bb = B.x * B.x + B.y * B.y, cc = C.x * C.x + C.y * C.y;
    const x = (aa * (B.y - C.y) + bb * (C.y - A.y) + cc * (A.y - B.y)) / d;
    const y = (aa * (C.x - B.x) + bb * (A.x - C.x) + cc * (B.x - A.x)) / d;
    return { x, y, r2: (x - A.x) ** 2 + (y - A.y) ** 2 };
  };
  for (let pi = 0; pi < coords.length; pi++) {
    const bad = triangles.filter((t) => { const circle = circumcircle(t); return circle && (all[pi].x - circle.x) ** 2 + (all[pi].y - circle.y) ** 2 <= circle.r2 + 1e-8; });
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
      const key = u < v ? u + ":" + v : v + ":" + u;
      if (edges.has(key)) edges.delete(key); else edges.set(key, [u, v]);
    }
    triangles = triangles.filter((t) => !bad.includes(t));
    for (const [u, v] of edges.values()) triangles.push({ a: u, b: v, c: pi });
  }
  return triangles.filter((t) => t.a < coords.length && t.b < coords.length && t.c < coords.length)
    .filter((t) => Math.abs((all[t.b].x - all[t.a].x) * (all[t.c].y - all[t.a].y) - (all[t.b].y - all[t.a].y) * (all[t.c].x - all[t.a].x)) > 1e-8);
}

export default function AdvancedSurveyTools({ T }: { T: (en: string, bn: string) => string }) {
  const [start, setStart] = useState({ easting: 500000, northing: 2600000 });
  const [legs, setLegs] = useState<Leg[]>([{ id: 1, bearing: 45, distance: 100 }, { id: 2, bearing: 135, distance: 100 }, { id: 3, bearing: 225, distance: 100 }, { id: 4, bearing: 315, distance: 100 }]);
  const [stations, setStations] = useState<Station[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ts, setTs] = useState({ azimuth: 45, slopeDistance: 50, verticalAngle: 5, instrumentRL: 10, instrumentHeight: 1.5, prismHeight: 1.5 });
  const [earth, setEarth] = useState({ designRL: 10, cellArea: 25 });

  const [boundary, setBoundary] = useState<number[]>([]);
  const [contourInterval, setContourInterval] = useState(0.5);
  const [crsCode, setCrsCode] = useState("EPSG:32646");
  const [coordinateUnit, setCoordinateUnit] = useState<"m" | "ft">("m");
  const [selectedPointId, setSelectedPointId] = useState("");
  const [breaklineStart, setBreaklineStart] = useState("");
  const [breaklineEnd, setBreaklineEnd] = useState("");
  const [breaklines, setBreaklines] = useState<Array<{ from: string; to: string }>>([]);
  const selectedPoint = stations.find((point) => point.id === selectedPointId) || null;
  const updateSurveyPoint = (id: string, key: "easting" | "northing" | "elevation" | "code", value: number | string) => {
    setStations((items) => items.map((point) => point.id === id ? { ...point, [key]: value } : point));
  };
  const addBreakline = () => {
    if (!breaklineStart || !breaklineEnd || breaklineStart === breaklineEnd) return toast.error(T("Choose two different survey points", "দুটি আলাদা সার্ভে পয়েন্ট নির্বাচন করুন"));
    if (breaklines.some((line) => (line.from === breaklineStart && line.to === breaklineEnd) || (line.from === breaklineEnd && line.to === breaklineStart))) return toast.error(T("This breakline already exists", "এই ব্রেকলাইন আগে থেকেই আছে"));
    setBreaklines((items) => [...items, { from: breaklineStart, to: breaklineEnd }]);
  };
  const [draftView, setDraftView] = useState<"points" | "tin" | "contours">("points");
  const [gridResolution, setGridResolution] = useState(20);
  useEffect(() => { setBoundary([]); }, [stations]);
  const hull = useMemo(() => stations.length >= 3 ? convexHull(stations) : [], [stations]);
  const tin = useMemo(() => triangulate(stations), [stations]);
  const tinStats = useMemo(() => {
    if (!tin.length) return null;
    let cut = 0, fill = 0, area = 0;
    for (const triangle of tin) {
      const a = stations[triangle.a], b = stations[triangle.b], c = stations[triangle.c];
      const triangleArea = Math.abs((b.easting-a.easting)*(c.northing-a.northing)-(b.northing-a.northing)*(c.easting-a.easting))/2;
      const depths = [a.elevation-earth.designRL,b.elevation-earth.designRL,c.elevation-earth.designRL];
      const mean = (depths[0]+depths[1]+depths[2])/3;
      if (mean > 0) cut += mean * triangleArea; else fill += -mean * triangleArea;
      area += triangleArea;
    }
    return { cut, fill, net: fill-cut, area, triangles: tin.length };
  }, [tin, stations, earth.designRL]);
  const exportDxf = () => {
    if (!stations.length) return toast.error(T("Import survey points first", "প্রথমে সার্ভে পয়েন্ট ইমপোর্ট করুন"));
    const lines = ["0","SECTION","2","ENTITIES"];
    stations.forEach((p) => {
      lines.push("0","POINT","8","SURVEY_POINTS","10",String(p.easting),"20",String(p.northing),"30",String(p.elevation));
      lines.push("0","TEXT","8","POINT_LABELS","10",String(p.easting),"20",String(p.northing),"30",String(p.elevation),"40","0.5","1",p.id);
    });
    if (boundary.length >= 3) {
      lines.push("0","POLYLINE","8","PLOT_BOUNDARY","66","1","70","1");
      boundary.forEach((index) => lines.push("0","VERTEX","8","PLOT_BOUNDARY","10",String(stations[index].easting),"20",String(stations[index].northing),"30",String(stations[index].elevation),"70","0"));
      lines.push("0","SEQEND","8","PLOT_BOUNDARY");
    }
    const edgeSet = new Set<string>();
    tin.forEach((triangle) => {
      for (const [u,v] of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]] as [number,number][]) {
        const key = u < v ? u + ":" + v : v + ":" + u;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        const a=stations[u], b=stations[v];
        lines.push("0","LINE","8","TIN_EDGES","10",String(a.easting),"20",String(a.northing),"30",String(a.elevation),"11",String(b.easting),"21",String(b.northing),"31",String(b.elevation));
      }
    });
    breaklines.forEach((line) => {
      const a = stations.find((point) => point.id === line.from), b = stations.find((point) => point.id === line.to);
      if (a && b) lines.push("0","LINE","8","BREAKLINES","10",String(a.easting),"20",String(a.northing),"30",String(a.elevation),"11",String(b.easting),"21",String(b.northing),"31",String(b.elevation));
    });
    lines.push("0","ENDSEC","0","EOF");
    const blob=new Blob([lines.join("\r\n")],{type:"application/dxf"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="civilos-survey-drawing.dxf"; a.click(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    if (!stations.length) return toast.error(T("Import survey data before creating a report", "রিপোর্ট তৈরির আগে সার্ভে ডেটা ইমপোর্ট করুন"));
    const rows=stations.map((p)=>"<tr><td>"+escapeHtml(p.id)+"</td><td>"+p.easting.toFixed(3)+"</td><td>"+p.northing.toFixed(3)+"</td><td>"+p.elevation.toFixed(3)+"</td><td>"+escapeHtml(p.code)+"</td></tr>").join("");
    const minE=Math.min(...stations.map(p=>p.easting)),maxE=Math.max(...stations.map(p=>p.easting)),minN=Math.min(...stations.map(p=>p.northing)),maxN=Math.max(...stations.map(p=>p.northing));
    const spanE=maxE-minE||1,spanN=maxN-minN||1,scale=Math.min(760/spanE,430/spanN);
    const sheetXY=(p:Station)=>({x:40+(p.easting-minE)*scale+(760-spanE*scale)/2,y:470-(p.northing-minN)*scale-(430-spanN*scale)/2});
    const boundarySvg=boundary.length>=3?"<polygon points='"+boundary.map(i=>{const q=sheetXY(stations[i]);return q.x+","+q.y;}).join(" ")+"' fill='#f97316' fill-opacity='.08' stroke='#f97316' stroke-width='3'/>":"";
    const breaklineSvg=breaklines.map(line=>{const a=stations.find(p=>p.id===line.from),b=stations.find(p=>p.id===line.to);if(!a||!b)return "";const p=sheetXY(a),q=sheetXY(b);return "<line x1='"+p.x+"' y1='"+p.y+"' x2='"+q.x+"' y2='"+q.y+"' stroke='#dc2626' stroke-width='3' stroke-dasharray='8 5'/>";}).join("");
    const pointSvg=stations.slice(0,1000).map(p=>{const q=sheetXY(p);return "<circle cx='"+q.x+"' cy='"+q.y+"' r='4' fill='#2563eb'/><text x='"+(q.x+7)+"' y='"+(q.y-7)+"' font-size='11' fill='#172033'>"+escapeHtml(p.id)+"</text>";}).join("");
    const drawingSheet="<h2>Survey drawing sheet</h2><svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 840 520' style='width:100%;border:1px solid #ccd3df;background:#fff'><rect x='0' y='0' width='840' height='520' fill='#fff'/>"+boundarySvg+breaklineSvg+pointSvg+"<text x='24' y='24' font-size='12' fill='#64748b'>CRS "+escapeHtml(crsCode)+" · "+coordinateUnit+" · Not to scale</text></svg>";
    const report="<html><head><title>CivilOS Survey Report</title><style>body{font:12px Arial;padding:28px;color:#172033}h1{font-size:22px}@page{size:A4 landscape;margin:12mm}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #ccd3df;padding:6px;text-align:left}th{background:#edf2f7}.meta{display:flex;gap:24px;flex-wrap:wrap}.note{margin-top:18px;color:#526071;font-size:11px}@media print{button{display:none}}</style></head><body><h1>CivilOS AI — Survey Report</h1><p>Generated: "+new Date().toLocaleString()+"</p><div class='meta'><p>Survey points: "+stations.length+"</p><p>Boundary vertices: "+boundary.length+"</p><p>TIN triangles: "+tin.length+"</p><p>Design RL: "+earth.designRL.toFixed(3)+" m</p><p>CRS: "+escapeHtml(crsCode)+"</p><p>Coordinate units: "+coordinateUnit+"</p><p>Breaklines: "+breaklines.length+"</p></div><h2>Survey point register</h2><table><thead><tr><th>Point</th><th>Easting (m)</th><th>Northing (m)</th><th>RL (m)</th><th>Code</th></tr></thead><tbody>"+rows+"</tbody></table><p class='note'>Coordinate reference system and units are taken from the supplied field data and are not independently verified. TIN/grid quantities are preliminary estimates; verify the surface, boundary and field observations before engineering or payment use.</p><button onclick='window.print()'>Print / Save as PDF</button><script>window.onload=()=>window.print()</script></body></html>";
    const win=window.open("","_blank");
    if(!win) return toast.error(T("Allow pop-ups to create the PDF report", "PDF রিপোর্টের জন্য পপ-আপ অনুমতি দিন"));
    win.document.write(report); win.document.close();
  };


  const traverse = useMemo(() => {
    let e = start.easting, n = start.northing, sumDep = 0, sumLat = 0, perimeter = 0;
    const rows = legs.map((leg) => {
      const az = ((leg.bearing % 360) + 360) % 360;
      const dep = leg.distance * Math.sin(az * Math.PI / 180);
      const lat = leg.distance * Math.cos(az * Math.PI / 180);
      e += dep; n += lat; sumDep += dep; sumLat += lat; perimeter += leg.distance;
      return { ...leg, dep, lat, easting: e, northing: n };
    });
    const closure = Math.hypot(sumDep, sumLat);
    return { rows, sumDep, sumLat, perimeter, closure, precision: closure > 0 ? perimeter / closure : Infinity };
  }, [start, legs]);

  const elevationStats = useMemo(() => {
    if (!stations.length) return null;
    const values = stations.map((s) => s.elevation);
    const min = Math.min(...values), max = Math.max(...values);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const cutDepths = values.map((v) => Math.max(0, v - earth.designRL));
    const fillDepths = values.map((v) => Math.max(0, earth.designRL - v));
    const cut = cutDepths.reduce((a, b) => a + b, 0) * earth.cellArea;
    const fill = fillDepths.reduce((a, b) => a + b, 0) * earth.cellArea;
    const range = max - min || 1;
    const bands = Array.from({ length: 5 }, (_, i) => {
      const low = min + range * i / 5, high = i === 4 ? max : min + range * (i + 1) / 5;
      return { low, high, count: values.filter((v) => v >= low && (i === 4 ? v <= high : v < high)).length };
    });
    return { min, max, average, cut, fill, net: fill - cut, bands };
  }, [stations, earth]);


  const surface = useMemo(() => {
    if (stations.length < 3) return null;
    const minE = Math.min(...stations.map((s) => s.easting)), maxE = Math.max(...stations.map((s) => s.easting));
    const minN = Math.min(...stations.map((s) => s.northing)), maxN = Math.max(...stations.map((s) => s.northing));
    if (maxE === minE || maxN === minN) return null;
    const size = gridResolution;
    const grid = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => {
      const x = minE + (maxE - minE) * col / (size - 1);
      const y = maxN - (maxN - minN) * row / (size - 1);
      let weighted = 0, weights = 0;
      for (const point of stations) {
        const d2 = (point.easting - x) ** 2 + (point.northing - y) ** 2;
        if (d2 < 1e-8) return point.elevation;
        const w = 1 / d2; weighted += point.elevation * w; weights += w;
      }
      return weighted / weights;
    }));
    const min = Math.min(...stations.map((s) => s.elevation)), max = Math.max(...stations.map((s) => s.elevation));
    const interval = Math.max(0.01, contourInterval);
    const firstLevel = Math.ceil(min / interval) * interval;
    const levelCount = Math.min(40, Math.max(0, Math.floor((max - firstLevel) / interval) + 1));
    const levels = Array.from({ length: levelCount }, (_, i) => firstLevel + i * interval);
    const contours = levels.flatMap((level) => {
      const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      for (let row = 0; row < size - 1; row++) for (let col = 0; col < size - 1; col++) {
        const values = [grid[row][col], grid[row][col + 1], grid[row + 1][col + 1], grid[row + 1][col]];
        const corners = [{ x: col, y: row }, { x: col + 1, y: row }, { x: col + 1, y: row + 1 }, { x: col, y: row + 1 }];
        const intersections: Array<{ x: number; y: number }> = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4, a = values[edge], b = values[next];
          if ((a < level && b >= level) || (a >= level && b < level)) {
            const t = (level - a) / (b - a);
            intersections.push({ x: corners[edge].x + (corners[next].x - corners[edge].x) * t, y: corners[edge].y + (corners[next].y - corners[edge].y) * t });
          }
        }
        for (let i = 0; i + 1 < intersections.length; i += 2) {
          const a = intersections[i], b = intersections[i + 1];
          segments.push({ x1: a.x / (size - 1) * 320, y1: a.y / (size - 1) * 180, x2: b.x / (size - 1) * 320, y2: b.y / (size - 1) * 180, level });
        }
      }
      return segments;
    });
    return { grid, min, max, contours, size };
  }, [stations, gridResolution, contourInterval]);

  const gridStats = useMemo(() => {
    if (!surface || stations.length < 3) return null;
    const minE = Math.min(...stations.map((s)=>s.easting)), maxE = Math.max(...stations.map((s)=>s.easting));
    const minN = Math.min(...stations.map((s)=>s.northing)), maxN = Math.max(...stations.map((s)=>s.northing));
    const n = surface.size, cellArea = ((maxE-minE)*(maxN-minN))/((n-1)*(n-1));
    let cut=0, fill=0;
    for (let y=0;y<n-1;y++) for(let x=0;x<n-1;x++) {
      const ground=(surface.grid[y][x]+surface.grid[y][x+1]+surface.grid[y+1][x]+surface.grid[y+1][x+1])/4;
      const delta=ground-earth.designRL;
      if(delta>0) cut+=delta*cellArea; else fill+=-delta*cellArea;
    }
    return {cut,fill,net:fill-cut,cellArea};
  }, [surface,stations,earth.designRL]);

  const profile = useMemo(() => {
    if (stations.length < 2) return null;
    let chainage = 0;
    const rows = stations.map((point, index) => {
      if (index > 0) chainage += Math.hypot(point.easting - stations[index - 1].easting, point.northing - stations[index - 1].northing);
      return { chainage, elevation: point.elevation };
    });
    const maxChainage = rows[rows.length - 1].chainage || 1;
    const minRL = Math.min(...rows.map((r) => r.elevation)), maxRL = Math.max(...rows.map((r) => r.elevation));
    const range = maxRL - minRL || 1;
    return { rows, minRL, maxRL, points: rows.map((r) => (r.chainage / maxChainage * 320) + "," + (170 - (r.elevation - minRL) / range * 150)).join(" ") };
  }, [stations]);
  const updateLeg = (id: number, key: "bearing" | "distance", value: number) => setLegs((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  const importTotalStation = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(T("CSV must be 5 MB or smaller", "CSV ফাইল ৫ MB বা কম হতে হবে")); return; }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("CSV needs a header and at least one data row.");
      const header = parseCsvLine(lines[0]).map((v) => v.toLowerCase().replace(/[ _-]/g, ""));
      const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
      const idIndex = find("point", "pointid", "name", "id", "station");
      const eIndex = find("easting", "east", "x");
      const nIndex = find("northing", "north", "y");
      const zIndex = find("elevation", "elev", "rl", "z", "height");
      const codeIndex = find("code", "feature", "description");
      if (eIndex < 0 || nIndex < 0 || zIndex < 0) throw new Error("Required headers: Easting, Northing, Elevation. Optional: Point, Code.");
      const parsed = lines.slice(1).map((line, i) => {
        const cells = parseCsvLine(line);
        const easting = Number(cells[eIndex]), northing = Number(cells[nIndex]), elevation = Number(cells[zIndex]);
        if (![easting, northing, elevation].every(Number.isFinite)) throw new Error("Invalid numeric value at data row " + (i + 2));
        return { id: idIndex >= 0 && cells[idIndex] ? cells[idIndex] : "P" + (i + 1), easting, northing, elevation, code: codeIndex >= 0 ? cells[codeIndex] || "" : "" };
      });
      if (!parsed.length || parsed.length > 10000) throw new Error("Import between 1 and 10,000 survey rows.");
      setStations(parsed);
      toast.success(T(parsed.length + " total station points imported", parsed.length + "টি টোটাল স্টেশন পয়েন্ট ইমপোর্ট হয়েছে"));
    } catch (error) { toast.error(error instanceof Error ? error.message : T("Could not read CSV", "CSV পড়া যায়নি")); }
  };
  const exportTraverse = () => {
    const rows = [["Leg", "Bearing_deg", "Distance_m", "Departure_m", "Latitude_m", "Easting_m", "Northing_m"], ...traverse.rows.map((r, i) => [i + 1, r.bearing, r.distance, r.dep, r.lat, r.easting, r.northing])];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "civilos-traverse.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const exportStations = () => {
    const rows = [["Point", "Easting", "Northing", "Elevation", "Code"], ...stations.map((s) => [s.id, s.easting, s.northing, s.elevation, s.code])];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "civilos-total-station.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const horizontalDistance = ts.slopeDistance * Math.cos(ts.verticalAngle * Math.PI / 180);
  const verticalDifference = ts.slopeDistance * Math.sin(ts.verticalAngle * Math.PI / 180);
  const pointRL = ts.instrumentRL + ts.instrumentHeight + verticalDifference - ts.prismHeight;

  return <Card className="p-4 space-y-3">
    <div><p className="font-semibold text-sm">{T("Advanced land surveying", "অ্যাডভান্সড ল্যান্ড সার্ভেয়িং")}</p><p className="text-xs text-muted-foreground">{T("Traverse computation, theodolite observations, total-station CSV and elevation/earthwork analysis.", "ট্রাভার্স হিসাব, থিওডোলাইট পর্যবেক্ষণ, টোটাল স্টেশন CSV এবং উচ্চতা ও আর্থওয়ার্ক বিশ্লেষণ।")}</p></div>
    <Tabs defaultValue="traverse">
      <TabsList className="grid grid-cols-5 w-full">
        <TabsTrigger value="traverse" className="text-xs">{T("Traverse", "ট্রাভার্স")}</TabsTrigger>
        <TabsTrigger value="theodolite" className="text-xs">{T("Theodolite", "থিওডোলাইট")}</TabsTrigger>
        <TabsTrigger value="total" className="text-xs">{T("Total station", "টোটাল স্টেশন")}</TabsTrigger>
        <TabsTrigger value="earth" className="text-xs">{T("Elevation", "উচ্চতা")}</TabsTrigger>
        <TabsTrigger value="draft" className="text-xs">{T("CAD / DTM", "CAD / DTM")}</TabsTrigger>
      </TabsList>
      <TabsContent value="traverse" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Enter whole-circle bearings clockwise from north and horizontal distances in metres. Include the closing leg to check traverse closure.", "উত্তর দিক থেকে ঘড়ির কাঁটার দিকে Whole Circle Bearing এবং মিটারে অনুভূমিক দূরত্ব দিন। ক্লোজার যাচাই করতে শেষ বন্ধ লেগও যোগ করুন।")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">{T("Start Easting (m)", "শুরুর ইস্টিং (মি)")}</Label><Input type="number" value={start.easting} onChange={(e) => setStart({ ...start, easting: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">{T("Start Northing (m)", "শুরুর নর্থিং (মি)")}</Label><Input type="number" value={start.northing} onChange={(e) => setStart({ ...start, northing: Number(e.target.value) })} /></div>
        </div>
        <div className="space-y-2">{legs.map((leg, index) => <div key={leg.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div><Label className="text-xs">{T("Leg", "লেগ")} {index + 1} · {T("Bearing °", "বেয়ারিং °")}</Label><Input type="number" min="0" max="360" value={leg.bearing} onChange={(e) => updateLeg(leg.id, "bearing", Number(e.target.value))} /></div>
          <div><Label className="text-xs">{T("Distance (m)", "দূরত্ব (মি)")}</Label><Input type="number" min="0" value={leg.distance} onChange={(e) => updateLeg(leg.id, "distance", Number(e.target.value))} /></div>
          <Button size="sm" variant="outline" disabled={legs.length <= 1} onClick={() => setLegs((items) => items.filter((item) => item.id !== leg.id))}>{T("Remove", "বাদ")}</Button>
        </div>)}</div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setLegs((items) => [...items, { id: Math.max(0, ...items.map((x) => x.id)) + 1, bearing: 0, distance: 0 }])}>{T("Add traverse leg", "নতুন লেগ")}</Button><Button size="sm" onClick={exportTraverse}>{T("Export traverse CSV", "ট্রাভার্স CSV এক্সপোর্ট")}</Button></div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted p-2">{T("Perimeter", "মোট দৈর্ঘ্য")}: <b>{numberText(traverse.perimeter)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Linear misclosure", "ক্লোজার ত্রুটি")}: <b>{numberText(traverse.closure)} m</b></div>
          <div className="rounded-md bg-muted p-2">Σ Departure: <b>{numberText(traverse.sumDep)} m</b></div>
          <div className="rounded-md bg-muted p-2">Σ Latitude: <b>{numberText(traverse.sumLat)} m</b></div>
        </div>
        <p className="text-xs">{T("Relative precision", "আপেক্ষিক নির্ভুলতা")}: <b>{Number.isFinite(traverse.precision) ? "1 : " + Math.round(traverse.precision).toLocaleString() : "—"}</b></p>
        <div className="max-h-40 overflow-auto text-xs"><table className="w-full"><thead><tr className="text-left border-b"><th className="py-1">#</th><th>Easting</th><th>Northing</th></tr></thead><tbody>{traverse.rows.map((r, i) => <tr key={r.id} className="border-b"><td className="py-1">{i + 1}</td><td>{numberText(r.easting)}</td><td>{numberText(r.northing)}</td></tr>)}</tbody></table></div>
      </TabsContent>
      <TabsContent value="theodolite" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Single-shot reduction using station RL, instrument height, slope distance, vertical angle and prism height. Positive angle is an elevation angle.", "স্টেশন RL, যন্ত্রের উচ্চতা, স্লোপ দূরত্ব, উল্লম্ব কোণ ও প্রিজম উচ্চতা দিয়ে একক শটের হিসাব। ধনাত্মক কোণ উপরের দিকে।")}</p>
        <div className="grid grid-cols-2 gap-2">
          {([["azimuth","Horizontal circle / azimuth (°)"],["slopeDistance","Slope distance (m)"],["verticalAngle","Vertical angle (°)"],["instrumentRL","Station RL (m)"],["instrumentHeight","Instrument height / HI (m)"],["prismHeight","Prism height (m)"]] as const).map(([key,label]) => <div key={key}><Label className="text-xs">{T(label, label)}</Label><Input type="number" value={ts[key]} onChange={(e) => setTs({ ...ts, [key]: Number(e.target.value) })} /></div>)}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted p-2">{T("Horizontal distance", "অনুভূমিক দূরত্ব")}: <b>{numberText(horizontalDistance)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Vertical difference", "উল্লম্ব পার্থক্য")}: <b>{numberText(verticalDifference)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Reduced level", "রিডিউসড লেভেল")}: <b>{numberText(pointRL)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Azimuth", "আজিমুথ")}: <b>{numberText(((ts.azimuth % 360) + 360) % 360, 2)}°</b></div>
        </div>
        <p className="text-[11px] text-muted-foreground">{T("Assumes a vertical angle from the horizontal and a correctly entered prism height. Apply instrument-specific corrections and verify field observations.", "অনুভূমিক থেকে উল্লম্ব কোণ এবং সঠিক প্রিজম উচ্চতা ধরে হিসাব করা হয়েছে। যন্ত্রভিত্তিক সংশোধন প্রয়োগ করে মাঠের রিডিং যাচাই করুন।")}</p>
      </TabsContent>
      <TabsContent value="total" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Import a CSV with Easting, Northing and Elevation columns. Optional columns: Point and Code. Coordinates must use one projected coordinate system and metre units.", "Easting, Northing এবং Elevation কলামসহ CSV ইমপোর্ট করুন। ঐচ্ছিক: Point ও Code। সব স্থানাঙ্ক একই projected coordinate system এবং মিটার এককে হতে হবে।")}</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv,.txt,text/plain" className="hidden" onChange={importTotalStation} />
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => fileRef.current?.click()}>{T("Import total station CSV", "টোটাল স্টেশন CSV ইমপোর্ট")}</Button><Button size="sm" variant="outline" disabled={!stations.length} onClick={exportStations}>{T("Export CSV", "CSV এক্সপোর্ট")}</Button><Button size="sm" variant="outline" disabled={!stations.length} onClick={() => setStations([])}>{T("Clear data", "ডেটা মুছুন")}</Button></div>
        <p className="text-xs text-muted-foreground">{T("Rows loaded", "লোড করা রো")}: <b>{stations.length}</b></p>
        <div className="max-h-56 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-background"><tr className="border-b text-left"><th className="py-1">Point</th><th>Easting</th><th>Northing</th><th>RL</th><th>Code</th></tr></thead><tbody>{stations.slice(0, 500).map((s, i) => <tr key={s.id + i} className="border-b"><td className="py-1">{s.id}</td><td>{numberText(s.easting)}</td><td>{numberText(s.northing)}</td><td>{numberText(s.elevation)}</td><td>{s.code}</td></tr>)}</tbody></table></div>
        {stations.length > 500 && <p className="text-[11px] text-muted-foreground">{T("Showing first 500 rows in the preview; all rows remain available for calculations and export.", "প্রিভিউতে প্রথম ৫০০টি রো দেখানো হচ্ছে; হিসাব ও এক্সপোর্টে সব রো থাকবে।")}</p>}
      </TabsContent>
      <TabsContent value="earth" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Uses imported total-station elevations as representative cells. Enter the design level and ground area represented by each point.", "ইমপোর্ট করা টোটাল স্টেশন উচ্চতাকে প্রতিনিধি সেল হিসেবে ব্যবহার করে। ডিজাইন লেভেল ও প্রতিটি পয়েন্টের প্রতিনিধিত্ব করা ভূমির ক্ষেত্রফল দিন।")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">{T("Design RL", "ডিজাইন RL")} ({coordinateUnit})</Label><Input type="number" value={earth.designRL} onChange={(e) => setEarth({ ...earth, designRL: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">{T("Cell area per point (m²)", "প্রতি পয়েন্ট সেলের ক্ষেত্রফল (মি²)")}</Label><Input type="number" min="0" value={earth.cellArea} onChange={(e) => setEarth({ ...earth, cellArea: Math.max(0, Number(e.target.value)) })} /></div>
        </div>
        {!elevationStats ? <p className="text-xs text-muted-foreground">{T("Import total-station CSV data first.", "প্রথমে টোটাল স্টেশন CSV ডেটা ইমপোর্ট করুন।")}</p> : <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted p-2">Min / Max RL: <b>{numberText(elevationStats.min)} / {numberText(elevationStats.max)} m</b></div>
            <div className="rounded-md bg-muted p-2">Mean RL: <b>{numberText(elevationStats.average)} m</b></div>
            <div className="rounded-md bg-muted p-2">{T("Estimated cut", "আনুমানিক কাট")}: <b>{numberText(elevationStats.cut)} m³</b></div>
            <div className="rounded-md bg-muted p-2">{T("Estimated fill", "আনুমানিক ফিল")}: <b>{numberText(elevationStats.fill)} m³</b></div>
          </div>
          <p className="text-xs">{T("Net fill (+) / cut (−)", "নেট ফিল (+) / কাট (−)")}: <b>{numberText(elevationStats.net)} m³</b></p>
          <div className="space-y-1"><p className="text-xs font-medium">{T("Elevation bands (point classification)", "উচ্চতা ব্যান্ড (পয়েন্ট শ্রেণিবিন্যাস)")}</p>{elevationStats.bands.map((band, i) => <div key={i} className="flex justify-between rounded bg-muted/60 px-2 py-1 text-xs"><span>{numberText(band.low, 2)} – {numberText(band.high, 2)} m</span><b>{band.count} {T("points", "পয়েন্ট")}</b></div>)}</div>
          {surface && <div className="space-y-2"><p className="text-xs font-medium">{T("IDW interpolated contour preview", "IDW ইন্টারপোলেটেড কনট্যুর প্রিভিউ")}</p><svg viewBox="0 0 320 180" role="img" aria-label="Interpolated elevation contour preview" className="w-full rounded border bg-muted/20">
            {surface.grid.slice(0, -1).map((row, y) => row.slice(0, -1).map((value, x) => { const ratio = (value - surface.min) / (surface.max - surface.min || 1); return <rect key={y + "-" + x} x={x / (surface.size - 1) * 320} y={y / (surface.size - 1) * 180} width={320 / (surface.size - 1) + 1} height={180 / (surface.size - 1) + 1} fill={"hsl(" + (220 - ratio * 190) + " 65% 55%)"} opacity="0.28" />; }))}
            {surface.contours.map((line, i) => <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="currentColor" strokeWidth="1.1" opacity="0.8" />)}
          </svg><p className="text-[11px] text-muted-foreground">{T("Interpolated from imported XYZ points using inverse-distance weighting. Use as a visual preview only.", "ইমপোর্ট করা XYZ পয়েন্ট থেকে inverse-distance weighting পদ্ধতিতে ইন্টারপোলেট করা। শুধু ভিজ্যুয়াল প্রিভিউ হিসেবে ব্যবহার করুন।")}</p></div>}
          {profile && <div className="space-y-2"><p className="text-xs font-medium">{T("Elevation profile by point order", "পয়েন্টের ক্রম অনুযায়ী এলিভেশন প্রোফাইল")}</p><svg viewBox="0 0 320 180" role="img" aria-label="Elevation profile" className="w-full rounded border bg-muted/20"><line x1="0" y1="170" x2="320" y2="170" stroke="currentColor" opacity="0.35" /><polyline points={profile.points} fill="none" stroke="currentColor" strokeWidth="2" />{profile.rows.map((r, i) => <circle key={i} cx={r.chainage / (profile.rows[profile.rows.length - 1].chainage || 1) * 320} cy={170 - (r.elevation - profile.minRL) / (profile.maxRL - profile.minRL || 1) * 150} r="3" fill="currentColor" />)}</svg><p className="text-[11px] text-muted-foreground">{T("Chainage", "চেইনেজ")}: {numberText(profile.rows[profile.rows.length - 1].chainage)} m · RL: {numberText(profile.minRL)}–{numberText(profile.maxRL)} m</p></div>}
        </>}
        <p className="text-[11px] text-muted-foreground">{T("Preliminary estimate only: the cell-area method is not a TIN/grid volume model. The contour preview is IDW-based and is not a survey-grade terrain surface. For design, payment or construction, use a validated terrain model and a qualified surveyor/engineer.", "এটি প্রাথমিক হিসাব: cell-area পদ্ধতি TIN/grid volume model নয়। কনট্যুর প্রিভিউ IDW-ভিত্তিক, সার্ভে-গ্রেড terrain surface নয়। ডিজাইন, বিল বা নির্মাণের জন্য যাচাইকৃত terrain model ও যোগ্য সার্ভেয়ার/ইঞ্জিনিয়ার ব্যবহার করুন।")}</p>
      </TabsContent>

      <TabsContent value="draft" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-semibold">{T("Survey drafting & terrain model", "সার্ভে ড্রাফটিং ও টেরেইন মডেল")}</p><p className="text-xs text-muted-foreground">{T("Generate a plot boundary, inspect the TIN surface, calculate grid/TIN earthwork and export CAD/report files.", "প্লট বাউন্ডারি তৈরি, TIN সারফেস দেখা, গ্রিড/TIN আর্থওয়ার্ক হিসাব এবং CAD/রিপোর্ট এক্সপোর্ট করুন।")}</p></div>
          <span className="text-xs rounded bg-muted px-2 py-1">{stations.length} {T("points", "পয়েন্ট")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
          <div><Label className="text-xs">{T("Coordinate reference (metadata)", "কোঅর্ডিনেট রেফারেন্স (মেটাডেটা)")}</Label><Input value={crsCode} onChange={(e)=>setCrsCode(e.target.value.trim())} placeholder="EPSG:32646"/></div>
          <div><Label className="text-xs">{T("Coordinate unit", "কোঅর্ডিনেট একক")}</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={coordinateUnit} onChange={(e)=>setCoordinateUnit(e.target.value as "m"|"ft")}><option value="m">{T("Metres","মিটার")}</option><option value="ft">{T("Feet","ফুট")}</option></select></div>
          <p className="col-span-2 text-[11px] text-muted-foreground">{T("Metadata only: no coordinate reprojection or unit conversion is performed. Use one consistent CRS and unit throughout the imported file and all design inputs; reported area/volume units follow this selection.", "শুধু মেটাডেটা: স্থানাঙ্ক রি-প্রজেকশন বা একক রূপান্তর হয় না। পুরো ফাইল ও ডিজাইন ইনপুটে একই CRS ও একক ব্যবহার করুন; ক্ষেত্রফল/ভলিউমের একক এই নির্বাচনের সঙ্গে মিলবে।")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { if (hull.length < 3) return toast.error(T("At least three non-collinear points are required", "কমপক্ষে তিনটি একই সরলরেখায় নয় এমন পয়েন্ট লাগবে")); setBoundary(hull); toast.success(T("Automatic convex-hull boundary generated", "স্বয়ংক্রিয় কনভেক্স-হাল বাউন্ডারি তৈরি হয়েছে")); }} disabled={stations.length < 3}>{T("Auto plot boundary", "অটো প্লট বাউন্ডারি")}</Button>
          <Button size="sm" variant="outline" onClick={exportDxf} disabled={!stations.length}>DXF</Button>
          <Button size="sm" variant="outline" onClick={printReport} disabled={!stations.length}>{T("Survey PDF report", "সার্ভে PDF রিপোর্ট")}</Button>
          <Button size="sm" variant="outline" onClick={() => setBoundary([])} disabled={!boundary.length}>{T("Clear boundary", "বাউন্ডারি মুছুন")}</Button>
        </div>
        {stations.length < 3 ? <p className="text-xs text-muted-foreground">{T("Import at least three survey points to generate the drawing and terrain surface.", "ড্রয়িং ও টেরেইন সারফেস তৈরির জন্য কমপক্ষে তিনটি সার্ভে পয়েন্ট ইমপোর্ট করুন।")}</p> : <>
          <div className="flex flex-wrap gap-2">
            {(["points","tin","contours"] as const).map((view) => <Button key={view} size="sm" variant={draftView===view?"default":"outline"} onClick={()=>setDraftView(view)}>{view==="points"?T("Point plan","পয়েন্ট প্ল্যান"):view==="tin"?"TIN":T("Contours","কনট্যুর")}</Button>)}
          </div>
          <svg viewBox="0 0 640 380" role="img" aria-label="Survey CAD drawing preview" className="w-full rounded-md border bg-background">
            <defs><pattern id="survey-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" opacity=".09" strokeWidth=".7"/></pattern></defs>
            <rect width="640" height="380" fill="url(#survey-grid)"/>
            {(() => {
              const minE=Math.min(...stations.map(p=>p.easting)),maxE=Math.max(...stations.map(p=>p.easting)),minN=Math.min(...stations.map(p=>p.northing)),maxN=Math.max(...stations.map(p=>p.northing));
              const spanE=maxE-minE||1,spanN=maxN-minN||1,scale=Math.min(560/spanE,300/spanN);
              const xy=(p:Station)=>({x:40+(p.easting-minE)*scale+(560-spanE*scale)/2,y:340-(p.northing-minN)*scale-(300-spanN*scale)/2});
              return <>
                {draftView==="tin" && tin.map((t,i)=>{const a=xy(stations[t.a]),b=xy(stations[t.b]),c=xy(stations[t.c]);return <polygon key={i} points={a.x+","+a.y+" "+b.x+","+b.y+" "+c.x+","+c.y} fill="none" stroke="#0ea5e9" strokeWidth="1" opacity=".75"/>;})}
                {draftView==="contours" && surface?.contours.map((line,i)=><g key={i}><line x1={40+line.x1/320*560} y1={40+line.y1/180*300} x2={40+line.x2/320*560} y2={40+line.y2/180*300} stroke="#0d9488" strokeWidth="1.4" opacity=".75"/>{i%18===0&&<text x={40+(line.x1+line.x2)/2/320*560} y={40+(line.y1+line.y2)/2/180*300} fontSize="8" fill="#0d9488">{numberText(line.level,2)}</text>}</g>)}
                {breaklines.map((line,i)=>{const a=stations.find((p)=>p.id===line.from),b=stations.find((p)=>p.id===line.to);if(!a||!b)return null;const pa=xy(a),pb=xy(b);return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#dc2626" strokeWidth="2.5" strokeDasharray="5 3"/>;})}
                {boundary.length>=3 && <polygon points={boundary.map((i)=>{const p=xy(stations[i]);return p.x+","+p.y;}).join(" ")} fill="#f97316" fillOpacity=".08" stroke="#f97316" strokeWidth="2.5"/>}
                {stations.slice(0,1000).map((p,i)=>{const q=xy(p);return <g key={p.id+"-"+i}><circle cx={q.x} cy={q.y} r="3.2" fill="#2563eb"/><text x={q.x+5} y={q.y-5} fontSize="9" fill="currentColor">{p.id.slice(0,14)}</text></g>;})}
              </>;
            })()}
          </svg>
          <p className="text-[11px] text-muted-foreground">{T("Plan view is plotted from the imported projected Easting/Northing coordinates. Labels are limited to the first 1,000 points for readability.", "ইমপোর্ট করা projected Easting/Northing স্থানাঙ্ক থেকে প্ল্যান ভিউ তৈরি। পাঠযোগ্যতার জন্য প্রথম ১,০০০টি পয়েন্টের লেবেল দেখানো হয়।")}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-muted p-2">{T("Boundary vertices","বাউন্ডারি ভার্টেক্স")}: <b>{boundary.length}</b></div>
            <div className="rounded bg-muted p-2">TIN triangles: <b>{tin.length}</b>{stations.length>250?" · "+T("limited to 250 points","২৫০ পয়েন্ট পর্যন্ত"):""}</div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">{T("Survey point editor", "সার্ভে পয়েন্ট এডিটর")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{T("Select point", "পয়েন্ট নির্বাচন")}</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={selectedPointId} onChange={(e) => setSelectedPointId(e.target.value)}><option value="">{T("Choose point", "পয়েন্ট বাছাই")}</option>{stations.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}</select></div>
              <div className="flex items-end"><Button size="sm" variant="outline" disabled={!selectedPoint} onClick={() => { if (!selectedPoint) return; setStations((items) => items.filter((p) => p.id !== selectedPoint.id)); setSelectedPointId(""); }}>{T("Delete point", "পয়েন্ট মুছুন")}</Button></div>
            </div>
            {selectedPoint && <div className="grid grid-cols-2 gap-2">
              {(["easting","northing","elevation"] as const).map((key) => <div key={key}><Label className="text-xs">{key==="easting"?"Easting (X)":key==="northing"?"Northing (Y)":"Elevation (Z)"}</Label><Input type="number" value={selectedPoint[key]} onChange={(e) => updateSurveyPoint(selectedPoint.id,key,Number(e.target.value))}/></div>)}
              <div><Label className="text-xs">{T("Point code", "পয়েন্ট কোড")}</Label><Input value={selectedPoint.code} onChange={(e) => updateSurveyPoint(selectedPoint.id,"code",e.target.value)}/></div>
            </div>}
            <p className="text-[11px] text-muted-foreground">{T("Changes update the drawing and calculations. Editing a point clears the generated boundary; regenerate it after coordinate edits.", "পরিবর্তনে ড্রয়িং ও হিসাব আপডেট হয়। পয়েন্ট এডিট করলে তৈরি করা বাউন্ডারি মুছে যায়; পরে আবার তৈরি করুন।")}</p>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">{T("Breakline editor", "ব্রেকলাইন এডিটর")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{T("Start point", "শুরুর পয়েন্ট")}</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={breaklineStart} onChange={(e)=>setBreaklineStart(e.target.value)}><option value="">—</option>{stations.map((p)=><option key={p.id} value={p.id}>{p.id}</option>)}</select></div>
              <div><Label className="text-xs">{T("End point", "শেষ পয়েন্ট")}</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={breaklineEnd} onChange={(e)=>setBreaklineEnd(e.target.value)}><option value="">—</option>{stations.map((p)=><option key={p.id} value={p.id}>{p.id}</option>)}</select></div>
            </div>
            <Button size="sm" variant="outline" onClick={addBreakline} disabled={stations.length<2}>{T("Add breakline", "ব্রেকলাইন যোগ করুন")}</Button>
            {breaklines.map((line,index)=><div key={line.from+"-"+line.to} className="flex items-center justify-between rounded bg-muted px-2 py-1 text-xs"><span>{line.from} → {line.to}</span><Button size="sm" variant="ghost" onClick={()=>setBreaklines((items)=>items.filter((_,i)=>i!==index))}>{T("Remove","সরান")}</Button></div>)}
            <p className="text-[11px] text-muted-foreground">{T("Breaklines are visual 3D CAD constraints and export as CAD lines. They are not yet enforced in IDW/TIN interpolation or volume calculations.", "ব্রেকলাইন ভিজ্যুয়াল 3D CAD লাইন হিসেবে এক্সপোর্ট হয়; IDW/TIN ইন্টারপোলেশন বা ভলিউম হিসাবে এখনো প্রয়োগ হয় না।")}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{T("Grid & TIN earthwork", "গ্রিড ও TIN আর্থওয়ার্ক")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{T("Design RL (m)", "ডিজাইন RL (মি)")}</Label><Input type="number" value={earth.designRL} onChange={(e)=>setEarth({...earth,designRL:Number(e.target.value)})}/></div>
              <div><Label className="text-xs">{T("Contour interval", "কনট্যুর ইন্টারভ্যাল")} ({coordinateUnit})</Label><Input type="number" min="0.01" step="0.1" value={contourInterval} onChange={(e)=>setContourInterval(Math.max(0.01,Number(e.target.value)||0.01))}/></div><div><Label className="text-xs">{T("Grid resolution", "গ্রিড রেজোলিউশন")}</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={gridResolution} onChange={(e)=>setGridResolution(Number(e.target.value))}><option value={10}>10 × 10</option><option value={20}>20 × 20</option><option value={40}>40 × 40</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-muted p-2">Grid cut / fill ({coordinateUnit}³): <b>{gridStats?numberText(gridStats.cut)+" / "+numberText(gridStats.fill):"—"}</b></div>
              <div className="rounded bg-muted p-2">TIN cut / fill ({coordinateUnit}³): <b>{tinStats?numberText(tinStats.cut)+" / "+numberText(tinStats.fill):"—"}</b></div>
              <div className="rounded bg-muted p-2">TIN surface area ({coordinateUnit}²): <b>{tinStats?numberText(tinStats.area):"—"}</b></div>
              <div className="rounded bg-muted p-2">TIN net fill (+) / cut (−) ({coordinateUnit}³): <b>{tinStats?numberText(tinStats.net):"—"}</b></div>
            </div>
            <p className="text-[11px] text-muted-foreground">{T("Grid volume uses the existing IDW sample grid; TIN volume uses Delaunay triangles and average vertex depth. Both are preliminary estimates, do not model breaklines/voids or boundary clipping, and must be checked against a validated design surface.", "গ্রিড ভলিউম IDW স্যাম্পল গ্রিড এবং TIN ভলিউম Delaunay ট্রায়াঙ্গেল ও গড় ভার্টেক্স ডেপথ ব্যবহার করে। উভয়ই প্রাথমিক হিসাব; ব্রেকলাইন/ফাঁকা অংশ বা বাউন্ডারি ক্লিপিং বিবেচনা করে না। যাচাইকৃত ডিজাইন সারফেস দিয়ে পরীক্ষা করতে হবে।")}</p>
          </div>
        </>}
      </TabsContent>
    </Tabs>
  </Card>;
}
