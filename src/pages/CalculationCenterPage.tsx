import { useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Copy, Download, Info, RotateCcw, BrickWall, Wallet } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";

const n = (v: string) => Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v: number, digits = 2) => v.toLocaleString("en-BD", { maximumFractionDigits: digits });
const Field = ({ label, value, onChange, unit, step = "any" }: { label: string; value: string; onChange: (v: string) => void; unit?: string; step?: string }) => (
  <div className="space-y-1.5"><Label>{label}{unit ? ` (${unit})` : ""}</Label><Input type="number" min="0" step={step} inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} /></div>
);
const ResultRows = ({ rows }: { rows: [string, string][] }) => (
  <div className="space-y-2 rounded-xl border bg-muted/30 p-4">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><strong className="text-right tabular-nums">{value}</strong></div>)}</div>
);
const defaults = {
  wallLength: "40", wallHeight: "10", wallThickness: "10", brickLength: "240", brickWidth: "115", brickHeight: "70", joint: "10", brickRatio: "6",
  concreteVolume: "1", cRatio: "1", sRatio: "1.5", aRatio: "3",
  plasterArea: "100", plasterThickness: "12", plasterRatio: "4",
  barDiameter: "12", barLength: "12", barCount: "10", steelWaste: "5",
  brickRate: "0", cementRate: "0", sandRate: "0", aggregateRate: "0", steelRate: "0", laborCost: "0", otherCost: "0",
};

export default function CalculationCenterPage() {
  const [v, setV] = useState(defaults);
  const set = (key: keyof typeof defaults) => (value: string) => setV(old => ({ ...old, [key]: value }));
  const brick = useMemo(() => {
    const wallM3 = n(v.wallLength) * 0.3048 * n(v.wallHeight) * 0.3048 * (n(v.wallThickness) * 0.0254);
    const moduleM3 = ((n(v.brickLength) + n(v.joint)) * (n(v.brickWidth) + n(v.joint)) * (n(v.brickHeight) + n(v.joint))) / 1e9;
    const count = moduleM3 > 0 ? wallM3 / moduleM3 : 0;
    const actualBrickM3 = count * n(v.brickLength) * n(v.brickWidth) * n(v.brickHeight) / 1e9;
    const mortarWetM3 = Math.max(0, wallM3 - actualBrickM3);
    const dryM3 = mortarWetM3 * 1.33;
    const ratio = n(v.brickRatio);
    const cementBags = (dryM3 / (1 + ratio)) / 0.0347;
    const sandCft = dryM3 * ratio / (1 + ratio) * 35.3147;
    return { wallM3, count, mortarWetM3, cementBags, sandCft };
  }, [v]);
  const concrete = useMemo(() => {
    const wet = n(v.concreteVolume), dry = wet * 1.54;
    const c = n(v.cRatio), s = n(v.sRatio), a = n(v.aRatio), sum = c + s + a;
    return { wet, dry, cementBags: sum ? dry * c / sum / 0.0347 : 0, sandCft: sum ? dry * s / sum * 35.3147 : 0, aggregateCft: sum ? dry * a / sum * 35.3147 : 0 };
  }, [v]);
  const plaster = useMemo(() => {
    const wet = n(v.plasterArea) * 0.092903 * n(v.plasterThickness) / 1000, dry = wet * 1.33, ratio = n(v.plasterRatio);
    return { wet, cementBags: dry / (1 + ratio) / 0.0347, sandCft: dry * ratio / (1 + ratio) * 35.3147 };
  }, [v]);
  const steel = useMemo(() => {
    const unit = n(v.barDiameter) ** 2 / 162, length = n(v.barLength) * n(v.barCount), net = unit * length;
    return { unit, length, net, total: net * (1 + n(v.steelWaste) / 100) };
  }, [v]);
  const totals = useMemo(() => {
    const bricks = brick.count * n(v.brickRate);
    const cement = (brick.cementBags + concrete.cementBags + plaster.cementBags) * n(v.cementRate);
    const sand = (brick.sandCft + concrete.sandCft + plaster.sandCft) * n(v.sandRate);
    const aggregate = concrete.aggregateCft * n(v.aggregateRate);
    const rebar = steel.total * n(v.steelRate);
    const labor = n(v.laborCost), other = n(v.otherCost);
    return { bricks, cement, sand, aggregate, rebar, labor, other, total: bricks + cement + sand + aggregate + rebar + labor + other };
  }, [brick, concrete, plaster, steel, v]);
  const reset = () => setV(defaults);
  const copy = async () => {
    const text = [
      "CivilOS AI — Calculation Center",
      `Brickwork: ${fmt(brick.count, 0)} bricks, ${fmt(brick.cementBags)} cement bags, ${fmt(brick.sandCft)} CFT sand`,
      `Concrete: ${fmt(concrete.wet)} m³, ${fmt(concrete.cementBags)} cement bags, ${fmt(concrete.sandCft)} CFT sand, ${fmt(concrete.aggregateCft)} CFT aggregate`,
      `Plaster: ${fmt(plaster.cementBags)} cement bags, ${fmt(plaster.sandCft)} CFT sand`,
      `Steel: ${fmt(steel.total)} kg including wastage`,
      `Estimated total cost: BDT ${fmt(totals.total, 0)}`,
      "Preliminary estimates only. Verify dimensions, specifications and site conditions."
    ].join("\n");
    try { await navigator.clipboard.writeText(text); toast.success("Calculation summary copied."); } catch { toast.error("Could not access clipboard."); }
  };
  const exportCsv = () => {
    const rows = [
      ["CivilOS AI Calculation Center", "Quantity / Value", "Unit"],
      ["Brickwork bricks", String(brick.count), "pcs"], ["Brickwork cement", String(brick.cementBags), "bags"], ["Brickwork sand", String(brick.sandCft), "CFT"],
      ["Concrete volume", String(concrete.wet), "m³"], ["Concrete cement", String(concrete.cementBags), "bags"], ["Concrete sand", String(concrete.sandCft), "CFT"], ["Concrete aggregate", String(concrete.aggregateCft), "CFT"],
      ["Plaster cement", String(plaster.cementBags), "bags"], ["Plaster sand", String(plaster.sandCft), "CFT"], ["Steel incl. wastage", String(steel.total), "kg"],
      ["Estimated total cost", String(totals.total), "BDT"], ["Note", "Preliminary estimate; verify engineering assumptions.", ""]
    ];
    const csv = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "civilos-calculation-summary.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <SidebarProvider>
      <SEO title="Calculation Center — CivilOS AI" description="Independent civil engineering calculators for brickwork, concrete, plaster, reinforcement and construction cost." />
      <div className="flex min-h-screen w-full bg-background"><DashboardSidebar /><div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2"><SidebarTrigger /><Calculator className="h-4 w-4 shrink-0 text-accent" /><h1 className="truncate font-heading font-semibold">Calculation Center</h1></div>
          <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Copy</span></Button><Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Export CSV</span></Button><ThemeToggle /></div>
        </header>
        <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
          <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-5 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Independent engineering utility</p><h2 className="mt-2 text-2xl font-bold md:text-3xl">Quick construction calculations</h2><p className="mt-2 text-sm text-muted-foreground">হিসাব করুন, পরিমাণ জানুন এবং আনুমানিক খরচ বের করুন — কোনো Project তৈরি বা নির্বাচন করার প্রয়োজন নেই।</p></div><div className="rounded-xl border bg-background/80 p-3"><Calculator className="h-8 w-8 text-accent" /></div></div>
          </section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4"><p className="text-xs text-muted-foreground">ইট (Brickwork)</p><p className="mt-1 text-2xl font-bold">{fmt(brick.count, 0)} pcs</p><p className="text-xs text-muted-foreground">Calculated from wall dimensions</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">সিমেন্ট (All calculations)</p><p className="mt-1 text-2xl font-bold">{fmt(brick.cementBags + concrete.cementBags + plaster.cementBags)} bags</p><p className="text-xs text-muted-foreground">50 kg bag volume assumption</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">রড (Steel)</p><p className="mt-1 text-2xl font-bold">{fmt(steel.total)} kg</p><p className="text-xs text-muted-foreground">Including entered wastage</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">আনুমানিক মোট খরচ</p><p className="mt-1 text-2xl font-bold">৳ {fmt(totals.total, 0)}</p><p className="text-xs text-muted-foreground">Based on rates you enter below</p></Card>
          </div>
          <Tabs defaultValue="brick" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4"><TabsTrigger value="brick"><BrickWall className="mr-1 h-4 w-4" /> ইটের গাঁথুনি</TabsTrigger><TabsTrigger value="concrete">কংক্রিট</TabsTrigger><TabsTrigger value="plaster">প্লাস্টার</TabsTrigger><TabsTrigger value="steel">রড / Steel</TabsTrigger></TabsList>
            <TabsContent value="brick"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Brickwork Calculator</h3><div className="grid grid-cols-2 gap-3"><Field label="Wall length" unit="ft" value={v.wallLength} onChange={set("wallLength")} /><Field label="Wall height" unit="ft" value={v.wallHeight} onChange={set("wallHeight")} /><Field label="Wall thickness" unit="inch" value={v.wallThickness} onChange={set("wallThickness")} /><Field label="Mortar joint" unit="mm" value={v.joint} onChange={set("joint")} /></div><p className="text-sm font-medium">Brick dimensions (mm)</p><div className="grid grid-cols-3 gap-2"><Field label="Length" value={v.brickLength} onChange={set("brickLength")} /><Field label="Width" value={v.brickWidth} onChange={set("brickWidth")} /><Field label="Height" value={v.brickHeight} onChange={set("brickHeight")} /></div><div className="space-y-1.5"><Label>Mortar ratio (cement : sand)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={v.brickRatio} onChange={e => set("brickRatio")(e.target.value)}><option value="4">1 : 4</option><option value="5">1 : 5</option><option value="6">1 : 6</option></select></div><p className="text-xs text-muted-foreground">Brick count uses modular brick dimensions including the entered joint. Mortar is estimated as wall volume minus actual brick volume, then converted using a 1.33 dry-volume factor.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated quantities</h3><ResultRows rows={[[ "Wall volume", `${fmt(brick.wallM3)} m³` ],[ "Bricks (without wastage)", `${fmt(brick.count, 0)} pcs` ],[ "Mortar (wet)", `${fmt(brick.mortarWetM3)} m³` ],[ "Cement", `${fmt(brick.cementBags)} bags` ],[ "Sand", `${fmt(brick.sandCft)} CFT` ]]}/></div></Card></TabsContent>
            <TabsContent value="concrete"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Concrete Mix Calculator</h3><Field label="Wet concrete volume" unit="m³" value={v.concreteVolume} onChange={set("concreteVolume")} /><div className="grid grid-cols-3 gap-2"><Field label="Cement ratio" value={v.cRatio} onChange={set("cRatio")} /><Field label="Sand ratio" value={v.sRatio} onChange={set("sRatio")} /><Field label="Aggregate ratio" value={v.aRatio} onChange={set("aRatio")} /></div><p className="text-xs text-muted-foreground">Nominal volume mix only. Dry-volume factor 1.54; one 50 kg cement bag is assumed to occupy 0.0347 m³. Use an approved mix design for structural concrete.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated quantities</h3><ResultRows rows={[[ "Wet volume", `${fmt(concrete.wet)} m³` ],[ "Dry volume", `${fmt(concrete.dry)} m³` ],[ "Cement", `${fmt(concrete.cementBags)} bags` ],[ "Sand", `${fmt(concrete.sandCft)} CFT` ],[ "Stone aggregate", `${fmt(concrete.aggregateCft)} CFT` ]]}/></div></Card></TabsContent>
            <TabsContent value="plaster"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Plaster Calculator</h3><Field label="Plaster area" unit="sq ft" value={v.plasterArea} onChange={set("plasterArea")} /><Field label="Thickness" unit="mm" value={v.plasterThickness} onChange={set("plasterThickness")} /><div className="space-y-1.5"><Label>Mortar ratio (cement : sand)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={v.plasterRatio} onChange={e => set("plasterRatio")(e.target.value)}><option value="3">1 : 3</option><option value="4">1 : 4</option><option value="5">1 : 5</option><option value="6">1 : 6</option></select></div><p className="text-xs text-muted-foreground">Dry mortar factor 1.33. Openings, surface unevenness and wastage are not included.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated quantities</h3><ResultRows rows={[[ "Wet mortar", `${fmt(plaster.wet)} m³` ],[ "Cement", `${fmt(plaster.cementBags)} bags` ],[ "Sand", `${fmt(plaster.sandCft)} CFT` ]]}/></div></Card></TabsContent>
            <TabsContent value="steel"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Reinforcement Steel Weight</h3><Field label="Bar diameter" unit="mm" value={v.barDiameter} onChange={set("barDiameter")} /><Field label="Length per bar" unit="m" value={v.barLength} onChange={set("barLength")} /><Field label="Number of bars" value={v.barCount} onChange={set("barCount")} step="1" /><Field label="Wastage allowance" unit="%" value={v.steelWaste} onChange={set("steelWaste")} /><p className="text-xs text-muted-foreground">Unit weight = diameter² ÷ 162 kg/m. This is a weight calculator, not a structural reinforcement design or BBS.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated quantities</h3><ResultRows rows={[[ "Unit weight", `${fmt(steel.unit)} kg/m` ],[ "Total length", `${fmt(steel.length)} m` ],[ "Net weight", `${fmt(steel.net)} kg` ],[ "Including wastage", `${fmt(steel.total)} kg` ]]}/></div></Card></TabsContent>
          </Tabs>
          <Card className="space-y-4 p-4 md:p-6"><div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-accent" /><div><h3 className="font-semibold">Construction Cost Calculator</h3><p className="text-xs text-muted-foreground">Enter your local market rates. No live market price is assumed.</p></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Per brick" unit="BDT / pcs" value={v.brickRate} onChange={set("brickRate")} /><Field label="Cement" unit="BDT / bag" value={v.cementRate} onChange={set("cementRate")} /><Field label="Sand" unit="BDT / CFT" value={v.sandRate} onChange={set("sandRate")} /><Field label="Aggregate / khoya" unit="BDT / CFT" value={v.aggregateRate} onChange={set("aggregateRate")} /><Field label="Steel / rod" unit="BDT / kg" value={v.steelRate} onChange={set("steelRate")} /><Field label="Labour cost" unit="BDT" value={v.laborCost} onChange={set("laborCost")} /><Field label="Other cost" unit="BDT" value={v.otherCost} onChange={set("otherCost")} /></div><div className="grid gap-4 lg:grid-cols-[1fr_auto]"><ResultRows rows={[[ "Bricks", `৳ ${fmt(totals.bricks, 0)}` ],[ "Cement", `৳ ${fmt(totals.cement, 0)}` ],[ "Sand", `৳ ${fmt(totals.sand, 0)}` ],[ "Aggregate / khoya", `৳ ${fmt(totals.aggregate, 0)}` ],[ "Steel / rod", `৳ ${fmt(totals.rebar, 0)}` ],[ "Labour", `৳ ${fmt(totals.labor, 0)}` ],[ "Other", `৳ ${fmt(totals.other, 0)}` ]]}/><div className="flex min-w-48 flex-col justify-center rounded-xl bg-primary p-5 text-primary-foreground"><span className="text-xs opacity-80">Estimated total</span><strong className="mt-1 text-2xl">৳ {fmt(totals.total, 0)}</strong><span className="mt-1 text-xs opacity-80">BDT · based on entered rates</span></div></div></Card>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-xs text-muted-foreground">Engineering disclaimer: results are preliminary quantity estimates, not structural design or procurement instructions. Actual quantities depend on drawings, brick type, joints, mix design, detailing, site conditions and wastage. Validate all inputs and calculations with approved drawings and a qualified engineer. Calculators on this page are independent and are not saved to or linked with any Project.</p></div><Button variant="outline" size="sm" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />Reset all</Button></div>
        </main>
      </div></div>
    </SidebarProvider>
  );
}
