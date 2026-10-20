import { useMemo, useState } from "react";
import { AlertTriangle, Box, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { confirmAll, listElements, removeElement, renameRoom, setColumnSize, setFloorHeight, setFloors, setMaterials, setOverallSize, setRoof, setWallThickness, type ElType } from "@/lib/viz/edit";
import { summarize, validateModel } from "@/lib/viz/model";
import { confidenceLabel, type BuildingModel } from "@/lib/viz/types";
import { formatLength } from "@/lib/viz/units";
import { ConfidenceBadge, Disclaimer, Warn, useL } from "./bits";

const EXT = ["Paint", "Brick finish", "Stone", "Tile", "Glass", "Metal"];

/** number input holding metres internally, shown in cm/m or in/ft; applies on blur/Enter and reports errors inline */
function Dim({ label, valueM, imperial, small, onCommit, basis }: { label: string; valueM: number; imperial: boolean; small?: boolean; onCommit: (m: number) => void; basis?: string }) {
  const L = useL();
  const unit = small ? (imperial ? "in" : "cm") : imperial ? "ft" : "m";
  const f = unit === "in" ? 39.3700787 : unit === "ft" ? 3.2808399 : unit === "cm" ? 100 : 1;
  const [txt, setTxt] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const shown = txt ?? String(+(valueM * f).toFixed(2));
  const commit = () => {
    if (txt === null) return; const n = Number(txt);
    try { if (!Number.isFinite(n)) throw new Error(L("Enter a number.", "সংখ্যা দিন।")); onCommit(n / f); setErr(null); } catch (e) { setErr((e as Error).message); }
    setTxt(null);
  };
  return (
    <div><Label className="text-xs flex justify-between"><span>{label} ({unit})</span>{basis && <span className={basis === "estimated" ? "text-amber-600" : "text-emerald-600"}>{basis === "estimated" ? L("estimated", "অনুমান") : basis === "user" ? L("you set", "আপনি দিয়েছেন") : L("from drawing", "ড্রয়িং থেকে")}</span>}</Label>
      <Input type="number" step="any" value={shown} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      {err && <p className="text-[11px] text-destructive mt-0.5">{err}</p>}</div>
  );
}

export default function VerifyPanel({ model, onChange, onConfirm, busy, scaleLabel }: { model: BuildingModel; onChange: (m: BuildingModel) => void; onConfirm: (m: BuildingModel) => void; busy?: boolean; scaleLabel?: string }) {
  const L = useL();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<ElType>("wall");
  const imperial = model.unitSystem === "imperial";
  const s = useMemo(() => summarize(model), [model]);
  const problems = useMemo(() => validateModel(model), [model]);
  const apply = (fn: () => BuildingModel) => { try { onChange(fn()); setErr(null); } catch (e) { setErr((e as Error).message); } };

  const rows: { type: ElType; label: string; n: number }[] = [
    { type: "wall", label: L("Walls", "দেয়াল"), n: model.walls.length }, { type: "column", label: L("Columns", "কলাম"), n: model.columns.length },
    { type: "door", label: L("Doors", "দরজা"), n: model.doors.length }, { type: "window", label: L("Windows", "জানালা"), n: model.windows.length },
    { type: "stair", label: L("Stairs", "সিঁড়ি"), n: model.stairs.length }, { type: "balcony", label: L("Balconies", "বারান্দা"), n: model.balconies.length },
    { type: "room", label: L("Rooms", "রুম"), n: model.rooms.length },
  ];
  const avg = (t: ElType) => { const a = listElements(model, t); return a.length ? a.reduce((x, y) => x + y.confidence, 0) / a.length : null; };
  const list = listElements(model, tab).map((e, i) => ({ e, i }));
  const lowCount = (t: ElType) => listElements(model, t).filter((e) => confidenceLabel(e.confidence) === "low").length;

  return (
    <div className="space-y-5" data-testid="verify-panel">
      {model.conceptual && <Warn><b>{L("Conceptual 3D Reconstruction", "কনসেপ্টুয়াল ৩ডি পুনর্গঠন")}</b> — {L("exact geometry cannot be recovered from a render. Verify every dimension.", "রেন্ডার থেকে নির্ভুল জ্যামিতি পাওয়া যায় না। প্রতিটি মাপ যাচাই করুন।")}</Warn>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">{L("Overall size", "মোট মাপ")}</div><div className="font-semibold">{formatLength(s.widthM, imperial ? "ft" : "m")} × {formatLength(s.depthM, imperial ? "ft" : "m")}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">{L("Height", "উচ্চতা")}</div><div className="font-semibold">{formatLength(s.heightM, imperial ? "ft" : "m")}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">{L("Footprint / total area", "ফুটপ্রিন্ট / মোট এরিয়া")}</div><div className="font-semibold">{s.footprintM2.toFixed(0)} / {s.totalFloorAreaM2.toFixed(0)} m²</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">{L("Scale source", "স্কেলের উৎস")}</div><div className="font-semibold text-sm">{scaleLabel ?? model.scale.source}</div></Card>
      </div>

      <section>
        <h3 className="font-semibold mb-2">{L("What was detected", "যা শনাক্ত হয়েছে")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {rows.map((r) => { const a = avg(r.type); const low = lowCount(r.type); return (
            <button key={r.type} onClick={() => setTab(r.type)} className={`text-left rounded-lg border p-3 transition ${tab === r.type ? "ring-2 ring-primary" : "hover:bg-muted/50"} ${low ? "border-red-500/60 bg-red-500/5" : ""}`} data-testid={`count-${r.type}`}>
              <div className="flex items-center justify-between"><span className="text-sm">{r.label}</span>{low > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}</div>
              <div className="text-2xl font-bold">{r.n}</div>
              {a !== null ? <ConfidenceBadge value={a} /> : <span className="text-xs text-muted-foreground">{L("none found", "পাওয়া যায়নি")}</span>}
              {low > 0 && <div className="text-[11px] text-red-600 mt-1">{low} {L("low confidence — check", "কম কনফিডেন্স — দেখুন")}</div>}
            </button>); })}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-5">
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">{L("Edit values", "মান সম্পাদনা")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">{L("Floors", "তলা")}</Label><Input type="number" min={1} max={40} value={model.floors} onChange={(e) => apply(() => setFloors(model, Number(e.target.value)))} data-testid="edit-floors" /></div>
            <Dim label={L("Floor height", "তলার উচ্চতা")} valueM={model.floorHeight.value} imperial={imperial} basis={model.floorHeight.basis} onCommit={(v) => apply(() => setFloorHeight(model, v))} />
            <Dim small label={L("Exterior wall", "বাইরের দেয়াল")} valueM={model.walls.find((w) => w.exterior)?.thickness ?? 0.254} imperial={imperial} onCommit={(v) => apply(() => setWallThickness(model, true, v))} />
            <Dim small label={L("Interior wall", "ভেতরের দেয়াল")} valueM={model.walls.find((w) => !w.exterior)?.thickness ?? 0.127} imperial={imperial} onCommit={(v) => apply(() => setWallThickness(model, false, v))} />
            {model.columns.length > 0 && <Dim small label={L("Column size", "কলামের সাইজ")} valueM={model.columns[0].size} imperial={imperial} onCommit={(v) => apply(() => setColumnSize(model, v))} />}
            <Dim label={L("Overall width", "মোট প্রস্থ")} valueM={s.widthM} imperial={imperial} onCommit={(v) => apply(() => setOverallSize(model, v, s.depthM))} />
            <Dim label={L("Overall depth", "মোট গভীরতা")} valueM={s.depthM} imperial={imperial} onCommit={(v) => apply(() => setOverallSize(model, s.widthM, v))} />
            <div><Label className="text-xs">{L("Roof", "ছাদ")}</Label>
              <Select value={model.roof.type} onValueChange={(v) => apply(() => setRoof(model, v as "flat" | "gable"))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="flat">{L("Flat + parapet", "সমতল + প্যারাপেট")}</SelectItem><SelectItem value="gable">{L("Gable", "ঢালু")}</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">{L("Exterior finish", "বাইরের ফিনিশ")}</Label>
              <Select value={model.materials.exterior} onValueChange={(v) => apply(() => setMaterials(model, { exterior: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EXT.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {err && <p className="text-xs text-destructive" role="alert">{err}</p>}
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="font-semibold capitalize">{rows.find((r) => r.type === tab)?.label} <span className="text-muted-foreground font-normal text-sm">({list.length})</span></h3>
          <p className="text-xs text-muted-foreground">{L("Delete false detections. Low-confidence items are highlighted.", "ভুল শনাক্তকরণ মুছুন। কম কনফিডেন্সের আইটেম হাইলাইট করা।")}</p>
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {list.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">{L("None detected.", "কিছু শনাক্ত হয়নি।")}</p>}
            {list.map(({ e, i }) => (
              <div key={e.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${confidenceLabel(e.confidence) === "low" ? "border-red-500/50 bg-red-500/5" : ""}`}>
                <span className="text-xs text-muted-foreground w-6">#{i + 1}</span>
                {tab === "room" ? <Input className="h-7 flex-1" value={(e as BuildingModel["rooms"][number]).name} onChange={(ev) => apply(() => renameRoom(model, e.id, ev.target.value))} aria-label="Room name" /> : <span className="flex-1 truncate text-xs">{e.source === "dxf" ? "CAD" : e.source === "user" ? L("you", "আপনি") : e.source === "vision" ? "AI trace" : L("inferred", "অনুমিত")} · {e.basis}</span>}
                <ConfidenceBadge value={e.confidence} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => apply(() => removeElement(model, tab, e.id))} aria-label="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {(model.assumptions.length > 0 || model.warnings.length > 0) && (
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold">{L("Assumptions & warnings", "অনুমান ও সতর্কতা")}</h3>
          <ul className="text-xs space-y-1 list-disc pl-4">
            {model.warnings.map((w, i) => <li key={`w${i}`} className="text-amber-700 dark:text-amber-400">{w}</li>)}
            {model.assumptions.map((a, i) => <li key={`a${i}`} className="text-muted-foreground">{a}</li>)}
          </ul>
        </Card>
      )}

      <div className="space-y-2">
        {problems.length > 0 && <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm space-y-1" role="alert">{problems.map((p, i) => <div key={i}>• {p}</div>)}</div>}
        <Button size="lg" className="w-full sm:w-auto" disabled={problems.length > 0 || busy} onClick={() => onConfirm(confirmAll(model))} data-testid="confirm-generate"><Box className="h-4 w-4 mr-2" />{busy ? L("Saving…", "সেভ হচ্ছে…") : L("Confirm & Generate 3D", "নিশ্চিত করুন ও ৩ডি তৈরি করুন")}</Button>
        <Disclaimer conceptual={model.conceptual} />
      </div>
    </div>
  );
}
