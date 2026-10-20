import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LINEAR_UNITS, toMeters } from "@/lib/viz/units";
import type { BuildingModel, LinearUnit } from "@/lib/viz/types";
import type { Calibration } from "@/lib/viz/workflow";
import type { RasterAnalysis } from "../../../supabase/functions/viz-analyze/normalize";
import { Warn, useL } from "./bits";

type P = { x: number; y: number };

/** Raster plan: user picks a detected wall OR clicks two points on the drawing, then states the real length. */
export function RasterCalibration({ imageUrl, width, height, analysis, defaultUnit, onApply, onAreaFallback, canUseArea, reason }: {
  imageUrl: string; width: number; height: number; analysis: RasterAnalysis; defaultUnit: LinearUnit;
  onApply: (c: Calibration) => void; onAreaFallback: () => void; canUseArea: boolean; reason?: string;
}) {
  const L = useL();
  const svg = useRef<SVGSVGElement>(null);
  const [pts, setPts] = useState<P[]>([]);
  const [known, setKnown] = useState("");
  const [unit, setUnit] = useState<LinearUnit>(defaultUnit);
  const [wallIdx, setWallIdx] = useState<number | null>(null);

  const walls = useMemo(() => analysis.walls.map((w, i) => ({ i, px: Math.hypot((w.b.x - w.a.x) * width, (w.b.y - w.a.y) * height), w })).sort((a, b) => b.px - a.px).slice(0, 8), [analysis, width, height]);
  const pickedPx = wallIdx !== null ? walls.find((x) => x.i === wallIdx)?.px ?? 0 : pts.length === 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0;
  const k = Number(known);
  const err = !(k > 0) ? L("Enter the real length (greater than 0).", "আসল দৈর্ঘ্য লিখুন (০-এর বেশি)।") : pickedPx <= 0 ? L("Select a detected wall or click two points on the drawing.", "একটি দেয়াল বাছুন বা ড্রয়িংয়ে দুটি বিন্দুতে ক্লিক করুন।") : null;

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
    setWallIdx(null); setPts((a) => (a.length >= 2 ? [p] : [...a, p]));
  };
  const sw = Math.max(2, width / 400);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4" data-testid="raster-calibration">
      <div className="rounded-lg border overflow-hidden bg-muted/30">
        <div className="relative">
          <img src={imageUrl} alt="drawing" className="w-full h-auto block select-none" draggable={false} />
          <svg ref={svg} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 w-full h-full cursor-crosshair" onClick={click}>
            {analysis.walls.map((w, i) => <line key={i} x1={w.a.x * width} y1={w.a.y * height} x2={w.b.x * width} y2={w.b.y * height} stroke={w.confidence < 0.6 ? "#ef4444" : "#2563eb"} strokeWidth={sw} opacity={0.55} />)}
            {wallIdx !== null && (() => { const w = analysis.walls[wallIdx]; return <line x1={w.a.x * width} y1={w.a.y * height} x2={w.b.x * width} y2={w.b.y * height} stroke="#f59e0b" strokeWidth={sw * 2.5} />; })()}
            {pts.length > 0 && pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sw * 3} fill="#f59e0b" />)}
            {pts.length === 2 && <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#f59e0b" strokeWidth={sw * 1.5} />}
          </svg>
        </div>
      </div>
      <div className="space-y-3">
        {reason && <Warn>{reason}</Warn>}
        <p className="text-sm text-muted-foreground">{L("Blue lines = walls the AI traced (red = low confidence). Click two points of a dimension you know, or pick a traced wall below.", "নীল রেখা = AI যে দেয়াল ট্রেস করেছে (লাল = কম কনফিডেন্স)। জানা কোনো মাপের দুই প্রান্তে ক্লিক করুন, বা নিচ থেকে একটি দেয়াল বাছুন।")}</p>
        <div><Label className="text-xs">{L("Use a traced wall", "ট্রেস করা দেয়াল")}</Label>
          <Select value={wallIdx === null ? "" : String(wallIdx)} onValueChange={(v) => { setWallIdx(Number(v)); setPts([]); }}>
            <SelectTrigger><SelectValue placeholder={L("Pick a wall…", "দেয়াল বাছুন…")} /></SelectTrigger>
            <SelectContent>{walls.map((x, n) => <SelectItem key={x.i} value={String(x.i)}>{L("Wall", "দেয়াল")} #{n + 1} — {Math.round(x.px)} px</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <div><Label className="text-xs">{L("Real length", "আসল দৈর্ঘ্য")}</Label><Input type="number" min={0} step="any" value={known} onChange={(e) => setKnown(e.target.value)} data-testid="calib-known" /></div>
          <div><Label className="text-xs">{L("Unit", "ইউনিট")}</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as LinearUnit)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LINEAR_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <p className="text-xs text-muted-foreground">{pickedPx > 0 ? `${L("Measured on drawing", "ড্রয়িংয়ে মাপ")}: ${Math.round(pickedPx)} px` : L("Nothing measured yet.", "এখনো কিছু মাপা হয়নি।")}{k > 0 && pickedPx > 0 ? ` → 1 px = ${(toMeters(k, unit) / pickedPx * 1000).toFixed(2)} mm` : ""}</p>
        {err && <p className="text-xs text-amber-600">{err}</p>}
        <Button className="w-full" disabled={!!err} onClick={() => onApply({ known: k, unit, pixels: pickedPx })} data-testid="calib-apply">{L("Apply calibration", "ক্যালিব্রেশন প্রয়োগ")}</Button>
        <Button variant="outline" className="w-full" disabled={!canUseArea} onClick={onAreaFallback}>{L("Estimate from approx. area instead", "আনুমানিক এরিয়া থেকে অনুমান করুন")}</Button>
        {!canUseArea && <p className="text-[11px] text-muted-foreground">{L("(Enter an approximate area in Project setup to enable. Results will be marked AI-estimated.)", "(এনাবল করতে Project setup-এ আনুমানিক এরিয়া দিন। ফলাফল AI-estimated চিহ্নিত হবে।)")}</p>}
      </div>
    </div>
  );
}

/** Render / elevation: hidden dimensions can't be read, so the user states overall width & depth. */
export function RenderDimensions({ defaultUnit, hasArea, onApply, reason }: { defaultUnit: LinearUnit; hasArea: boolean; onApply: (d: { widthM: number; depthM: number } | null) => void; reason?: string }) {
  const L = useL();
  const [w, setW] = useState(""), [d, setD] = useState(""); const [unit, setUnit] = useState<LinearUnit>(defaultUnit);
  const ok = Number(w) > 0 && Number(d) > 0;
  return (
    <div className="max-w-md space-y-3" data-testid="render-dims">
      <Warn><b>{L("Conceptual 3D Reconstruction.", "কনসেপ্টুয়াল ৩ডি পুনর্গঠন।")}</b> {reason ?? L("A render shows only the outside of one side. Overall size, structure and interior will be AI-estimated placeholders.", "রেন্ডারে শুধু বাইরের একপাশ দেখা যায়। মোট মাপ, স্ট্রাকচার ও ভেতরের অংশ AI-অনুমান হবে।")}</Warn>
      <div className="grid grid-cols-[1fr_1fr_90px] gap-2">
        <div><Label className="text-xs">{L("Overall width", "মোট প্রস্থ")}</Label><Input type="number" min={0} step="any" value={w} onChange={(e) => setW(e.target.value)} data-testid="render-w" /></div>
        <div><Label className="text-xs">{L("Overall depth", "মোট গভীরতা")}</Label><Input type="number" min={0} step="any" value={d} onChange={(e) => setD(e.target.value)} data-testid="render-d" /></div>
        <div><Label className="text-xs">{L("Unit", "ইউনিট")}</Label><Select value={unit} onValueChange={(v) => setUnit(v as LinearUnit)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LINEAR_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <Button className="w-full" disabled={!ok} onClick={() => onApply({ widthM: toMeters(Number(w), unit), depthM: toMeters(Number(d), unit) })} data-testid="render-apply">{L("Build conceptual model", "কনসেপ্টুয়াল মডেল বানান")}</Button>
      {hasArea && <Button variant="outline" className="w-full" onClick={() => onApply(null)}>{L("Derive from my approx. area (4:3 assumed)", "আমার আনুমানিক এরিয়া থেকে (৪:৩ ধরে)")}</Button>}
    </div>
  );
}

/** DXF without unit info: state the real length of one wall. */
export function DxfCalibration({ model, defaultUnit, onApply }: { model: BuildingModel; defaultUnit: LinearUnit; onApply: (wallId: string, known: number, unit: LinearUnit) => void }) {
  const L = useL();
  const walls = useMemo(() => model.walls.map((w) => ({ id: w.id, len: Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) })).sort((a, b) => b.len - a.len).slice(0, 8), [model]);
  const [id, setId] = useState(walls[0]?.id ?? ""); const [known, setKnown] = useState(""); const [unit, setUnit] = useState<LinearUnit>(defaultUnit);
  return (
    <div className="max-w-md space-y-3" data-testid="dxf-calibration">
      <Warn>{L("This DXF has no drawing-unit information, so real-world size is unknown. Pick one wall and enter its true length.", "এই DXF-এ ইউনিটের তথ্য নেই, তাই আসল মাপ অজানা। একটি দেয়াল বেছে তার আসল দৈর্ঘ্য দিন।")}</Warn>
      <div><Label className="text-xs">{L("Wall (drawing length)", "দেয়াল (ড্রয়িং দৈর্ঘ্য)")}</Label>
        <Select value={id} onValueChange={setId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{walls.map((w, n) => <SelectItem key={w.id} value={w.id}>#{n + 1} — {w.len.toFixed(2)} {L("drawing units", "ড্রয়িং ইউনিট")}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <div><Label className="text-xs">{L("Real length", "আসল দৈর্ঘ্য")}</Label><Input type="number" min={0} step="any" value={known} onChange={(e) => setKnown(e.target.value)} /></div>
        <div><Label className="text-xs">{L("Unit", "ইউনিট")}</Label><Select value={unit} onValueChange={(v) => setUnit(v as LinearUnit)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LINEAR_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <Button className="w-full" disabled={!(Number(known) > 0) || !id} onClick={() => onApply(id, Number(known), unit)}>{L("Apply calibration", "ক্যালিব্রেশন প্রয়োগ")}</Button>
    </div>
  );
}
