import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUILDING_TYPES, type UnitSystem } from "@/lib/viz/types";
import type { Setup } from "@/lib/viz/workflow";
import { useL } from "./bits";

export interface SetupState extends Setup { location: string }

export default function SetupForm({ value, onChange, disabled }: { value: SetupState; onChange: (v: SetupState) => void; disabled?: boolean }) {
  const L = useL();
  const set = <K extends keyof SetupState>(k: K, v: SetupState[K]) => onChange({ ...value, [k]: v });
  const auto = value.floors === null;
  return (
    <div className="grid sm:grid-cols-2 gap-4" data-testid="viz-setup">
      <div className="sm:col-span-2"><Label>{L("Project / visualization name", "প্রজেক্টের নাম")} *</Label><Input disabled={disabled} maxLength={200} value={value.name} onChange={(e) => set("name", e.target.value)} /></div>
      <div><Label>{L("Building type", "বিল্ডিং টাইপ")}</Label>
        <Select disabled={disabled} value={value.buildingType} onValueChange={(v) => set("buildingType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUILDING_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>{L("Location", "অবস্থান")}</Label><Input disabled={disabled} maxLength={120} placeholder="Dhaka, BD" value={value.location} onChange={(e) => set("location", e.target.value)} /></div>
      <div>
        <div className="flex items-center justify-between"><Label>{L("Number of floors", "তলার সংখ্যা")}</Label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">{L("Auto detect", "অটো ডিটেক্ট")}<Switch disabled={disabled} checked={auto} onCheckedChange={(v) => set("floors", v ? null : 2)} /></label></div>
        <Input type="number" min={1} max={40} step={1} disabled={disabled || auto} value={auto ? "" : value.floors ?? ""} placeholder={auto ? L("Detected from drawing", "ড্রয়িং থেকে") : ""} onChange={(e) => { const n = Math.round(Number(e.target.value)); set("floors", Number.isFinite(n) && n >= 1 ? Math.min(40, n) : 1); }} />
      </div>
      <div><Label>{L("Approx. total area (sq ft, optional)", "আনুমানিক মোট এরিয়া (বর্গফুট, ঐচ্ছিক)")}</Label>
        <Input type="number" min={0} disabled={disabled} value={value.approxAreaSqft ?? ""} onChange={(e) => { const n = Number(e.target.value); set("approxAreaSqft", n > 0 ? n : null); }} /></div>
      <div className="sm:col-span-2"><Label>{L("Units", "ইউনিট")}</Label>
        <div className="flex gap-2 mt-1">{(["metric", "imperial"] as UnitSystem[]).map((u) => (
          <button key={u} type="button" disabled={disabled} onClick={() => set("unitSystem", u)} className={`px-3 py-1.5 rounded-md border text-sm ${value.unitSystem === u ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>{u === "metric" ? L("Metric (m, cm)", "মেট্রিক (মি, সেমি)") : L("Imperial (ft, in)", "ইম্পেরিয়াল (ফুট, ইঞ্চি)")}</button>
        ))}</div></div>
    </div>
  );
}
