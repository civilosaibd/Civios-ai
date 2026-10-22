import { useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, RotateCcw, Download, Info } from "lucide-react";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";

const number = (v: string, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const fmt = (n: number, digits = 2) => n.toLocaleString("en-BD", { maximumFractionDigits: digits });
const Field = ({ label, value, onChange, min = "0", step = "any", suffix }: { label: string; value: string; onChange: (v: string) => void; min?: string; step?: string; suffix?: string }) => (
  <div className="space-y-1.5">
    <Label>{label}{suffix ? ` (${suffix})` : ""}</Label>
    <Input type="number" min={min} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

function Result({ rows }: { rows: [string, string][] }) {
  return <div className="space-y-2 rounded-xl border bg-muted/30 p-4">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><strong className="text-right tabular-nums">{value}</strong></div>)}</div>;
}

export default function MaterialCalculatorPage() {
  const [volume, setVolume] = useState("1");
  const [cementRatio, setCementRatio] = useState("1");
  const [sandRatio, setSandRatio] = useState("1.5");
  const [aggregateRatio, setAggregateRatio] = useState("3");
  const [brickVolume, setBrickVolume] = useState("1");
  const [brickRatio, setBrickRatio] = useState("6");
  const [plasterArea, setPlasterArea] = useState("100");
  const [plasterThickness, setPlasterThickness] = useState("12");
  const [plasterRatio, setPlasterRatio] = useState("4");
  const [barDiameter, setBarDiameter] = useState("12");
  const [barLength, setBarLength] = useState("12");
  const [barCount, setBarCount] = useState("10");
  const [waste, setWaste] = useState("5");

  const concrete = useMemo(() => {
    const wet = Math.max(0, number(volume));
    const dry = wet * 1.54;
    const c = Math.max(0, number(cementRatio)), s = Math.max(0, number(sandRatio)), a = Math.max(0, number(aggregateRatio));
    const sum = c + s + a || 1;
    const cementBags = (dry * c / sum) / 0.0347;
    return { wet, dry, cementBags, sand: dry * s / sum * 35.3147, aggregate: dry * a / sum * 35.3147 };
  }, [volume, cementRatio, sandRatio, aggregateRatio]);

  const brickwork = useMemo(() => {
    const v = Math.max(0, number(brickVolume));
    const bricks = v * 500;
    const mortarWet = v * 0.30;
    const dry = mortarWet * 1.33;
    const r = Math.max(1, number(brickRatio));
    const cementBags = (dry / (1 + r)) / 0.0347;
    const sandCft = (dry * r / (1 + r)) * 35.3147;
    return { bricks, mortarWet, cementBags, sandCft };
  }, [brickVolume, brickRatio]);

  const plaster = useMemo(() => {
    const area = Math.max(0, number(plasterArea));
    const thicknessM = Math.max(0, number(plasterThickness)) / 1000;
    const wetM3 = area * 0.092903 * thicknessM;
    const dryM3 = wetM3 * 1.33;
    const r = Math.max(1, number(plasterRatio));
    return { wetM3, cementBags: (dryM3 / (1 + r)) / 0.0347, sandCft: (dryM3 * r / (1 + r)) * 35.3147 };
  }, [plasterArea, plasterThickness, plasterRatio]);

  const steel = useMemo(() => {
    const d = Math.max(0, number(barDiameter));
    const length = Math.max(0, number(barLength));
    const count = Math.max(0, number(barCount));
    const unit = d * d / 162;
    const totalLength = length * count;
    return { unit, totalLength, weight: unit * totalLength, withWaste: unit * totalLength * (1 + Math.max(0, number(waste)) / 100) };
  }, [barDiameter, barLength, barCount, waste]);

  const reset = () => {
    setVolume("1"); setCementRatio("1"); setSandRatio("1.5"); setAggregateRatio("3");
    setBrickVolume("1"); setBrickRatio("6"); setPlasterArea("100"); setPlasterThickness("12"); setPlasterRatio("4");
    setBarDiameter("12"); setBarLength("12"); setBarCount("10"); setWaste("5");
  };

  const exportResults = () => {
    const rows = [
      ["CivilOS AI Material Calculator", "Estimated quantity"],
      ["Concrete volume (m³)", String(concrete.wet)],
      ["Concrete cement (bags)", String(concrete.cementBags)],
      ["Concrete sand (CFT)", String(concrete.sand)],
      ["Concrete aggregate (CFT)", String(concrete.aggregate)],
      ["Brickwork bricks (approx.)", String(brickwork.bricks)],
      ["Brickwork cement (bags)", String(brickwork.cementBags)],
      ["Brickwork sand (CFT)", String(brickwork.sandCft)],
      ["Plaster cement (bags)", String(plaster.cementBags)],
      ["Plaster sand (CFT)", String(plaster.sandCft)],
      ["Steel total weight (kg)", String(steel.weight)],
      ["Steel with waste (kg)", String(steel.withWaste)],
      ["Note", "Preliminary estimates only; verify assumptions and project specifications."],
    ];
    const csv = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "civilos-material-estimate.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SidebarProvider>
      <SEO title="Material Calculator — CivilOS AI" description="Calculate preliminary concrete, brickwork, plaster and reinforcement quantities." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-2"><SidebarTrigger /><Calculator className="h-4 w-4 text-accent" /><h1 className="font-heading font-semibold">Material Calculator</h1></div>
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={exportResults}><Download className="mr-1 h-4 w-4" /> Export CSV</Button><ThemeToggle /></div>
          </header>
          <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
            <div><h2 className="text-2xl font-bold">Construction material quantities</h2><p className="mt-1 text-sm text-muted-foreground">Quick, transparent estimates for common civil engineering work. All values can be edited.</p></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4"><p className="text-xs text-muted-foreground">Concrete cement</p><p className="mt-1 text-2xl font-bold">{fmt(concrete.cementBags)} bags</p><p className="text-xs text-muted-foreground">For {fmt(concrete.wet)} m³ concrete</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">Brickwork bricks</p><p className="mt-1 text-2xl font-bold">{fmt(brickwork.bricks, 0)} pcs</p><p className="text-xs text-muted-foreground">Approx. per 1 m³</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">Plaster cement</p><p className="mt-1 text-2xl font-bold">{fmt(plaster.cementBags)} bags</p><p className="text-xs text-muted-foreground">For {fmt(number(plasterArea))} sq ft</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">Steel with waste</p><p className="mt-1 text-2xl font-bold">{fmt(steel.withWaste)} kg</p><p className="text-xs text-muted-foreground">{fmt(number(waste))}% allowance included</p></Card>
            </div>
            <Tabs defaultValue="concrete" className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4"><TabsTrigger value="concrete">Concrete</TabsTrigger><TabsTrigger value="brickwork">Brickwork</TabsTrigger><TabsTrigger value="plaster">Plaster</TabsTrigger><TabsTrigger value="steel">Steel weight</TabsTrigger></TabsList>
              <TabsContent value="concrete"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Concrete mix calculator</h3><Field label="Wet concrete volume" suffix="m³" value={volume} onChange={setVolume}/><div className="grid grid-cols-3 gap-3"><Field label="Cement ratio" value={cementRatio} onChange={setCementRatio}/><Field label="Sand ratio" value={sandRatio} onChange={setSandRatio}/><Field label="Aggregate ratio" value={aggregateRatio} onChange={setAggregateRatio}/></div><p className="text-xs text-muted-foreground">Mix ratio is by volume. Dry volume factor used: 1.54; one 50 kg cement bag is assumed to occupy 0.0347 m³.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated materials</h3><Result rows={[["Wet concrete", `${fmt(concrete.wet)} m³`],["Dry volume", `${fmt(concrete.dry)} m³`],["Cement", `${fmt(concrete.cementBags)} bags`],["Sand", `${fmt(concrete.sand)} CFT`],["Aggregate", `${fmt(concrete.aggregate)} CFT`]]}/></div></Card></TabsContent>
              <TabsContent value="brickwork"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Brickwork material calculator</h3><Field label="Brickwork volume" suffix="m³" value={brickVolume} onChange={setBrickVolume}/><div className="space-y-1.5"><Label>Mortar mix (cement : sand)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={brickRatio} onChange={e=>setBrickRatio(e.target.value)}><option value="4">1 : 4</option><option value="5">1 : 5</option><option value="6">1 : 6</option></select></div><p className="text-xs text-muted-foreground">Assumptions: approximately 500 bricks/m³ and wet mortar volume 30% of brickwork volume. Actual quantities vary by brick size and joint thickness.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated materials</h3><Result rows={[["Bricks", `${fmt(brickwork.bricks, 0)} pcs`],["Wet mortar", `${fmt(brickwork.mortarWet)} m³`],["Cement", `${fmt(brickwork.cementBags)} bags`],["Sand", `${fmt(brickwork.sandCft)} CFT`]]}/></div></Card></TabsContent>
              <TabsContent value="plaster"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Plaster calculator</h3><Field label="Plaster area" suffix="sq ft" value={plasterArea} onChange={setPlasterArea}/><Field label="Thickness" suffix="mm" value={plasterThickness} onChange={setPlasterThickness}/><div className="space-y-1.5"><Label>Mortar mix (cement : sand)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={plasterRatio} onChange={e=>setPlasterRatio(e.target.value)}><option value="3">1 : 3</option><option value="4">1 : 4</option><option value="5">1 : 5</option><option value="6">1 : 6</option></select></div><p className="text-xs text-muted-foreground">Dry mortar factor used: 1.33. Openings, uneven surfaces and wastage are not included.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated materials</h3><Result rows={[["Wet mortar", `${fmt(plaster.wetM3)} m³`],["Cement", `${fmt(plaster.cementBags)} bags`],["Sand", `${fmt(plaster.sandCft)} CFT`]]}/></div></Card></TabsContent>
              <TabsContent value="steel"><Card className="grid gap-5 p-4 md:grid-cols-2 md:p-6"><div className="space-y-4"><h3 className="font-semibold">Reinforcement steel weight</h3><Field label="Bar diameter" suffix="mm" value={barDiameter} onChange={setBarDiameter}/><Field label="Length per bar" suffix="m" value={barLength} onChange={setBarLength}/><Field label="Number of bars" value={barCount} onChange={setBarCount} step="1"/><Field label="Wastage allowance" suffix="%" value={waste} onChange={setWaste}/><p className="text-xs text-muted-foreground">Formula: unit weight = diameter² ÷ 162 kg/m. Confirm bar schedule and lap/hook lengths with approved structural drawings.</p></div><div className="space-y-3"><h3 className="font-semibold">Estimated steel</h3><Result rows={[["Unit weight", `${fmt(steel.unit)} kg/m`],["Total length", `${fmt(steel.totalLength)} m`],["Net weight", `${fmt(steel.weight)} kg`],["With wastage", `${fmt(steel.withWaste)} kg`]]}/></div></Card></TabsContent>
            </Tabs>
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"/><p className="text-xs text-muted-foreground">Engineering note: these are preliminary quantity estimates, not structural design or a substitute for approved drawings, local specifications, or site measurements. Verify mix design, material properties, unit conversions and wastage before procurement.</p></div><Button variant="outline" size="sm" onClick={reset}><RotateCcw className="mr-1 h-4 w-4"/>Reset defaults</Button></div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
