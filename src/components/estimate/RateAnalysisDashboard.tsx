import { useMemo, useState } from "react";
import { Download, TrendingUp, Calculator, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Material = { qty: number; unit: string; rate: number; total: number };
type Labor = { days: number; rate: number; total: number };
type Props = {
  materials: Record<string, Material>;
  labor: Record<string, Labor>;
  projectName: string;
  projectCost: number;
  currency: (value: number) => string;
  fmt: (value: number) => string;
};

const safe = (value: number) => Number.isFinite(value) ? value : 0;
const clampPercent = (value: number) => Math.max(-100, Math.min(500, safe(value)));

export default function RateAnalysisDashboard({ materials, labor, projectName, projectCost, currency, fmt }: Props) {
  const [materialChange, setMaterialChange] = useState(0);
  const [laborChange, setLaborChange] = useState(0);
  const [otherChange, setOtherChange] = useState(0);

  const materialRows = useMemo(() => Object.entries(materials).map(([name, row]) => ({
    name, quantity: safe(row.qty), unit: row.unit, rate: safe(row.rate), total: safe(row.total),
    scenarioRate: safe(row.rate) * (1 + clampPercent(materialChange) / 100),
    scenarioTotal: safe(row.total) * (1 + clampPercent(materialChange) / 100),
  })), [materials, materialChange]);
  const laborRows = useMemo(() => Object.entries(labor).map(([name, row]) => ({
    name, days: safe(row.days), rate: safe(row.rate), total: safe(row.total),
    scenarioRate: safe(row.rate) * (1 + clampPercent(laborChange) / 100),
    scenarioTotal: safe(row.total) * (1 + clampPercent(laborChange) / 100),
  })), [labor, laborChange]);

  const materialTotal = materialRows.reduce((sum, row) => sum + row.total, 0);
  const laborTotal = laborRows.reduce((sum, row) => sum + row.total, 0);
  const materialScenario = materialTotal * (1 + clampPercent(materialChange) / 100);
  const laborScenario = laborTotal * (1 + clampPercent(laborChange) / 100);
  const otherBase = Math.max(0, safe(projectCost) - materialTotal - laborTotal);
  const otherScenario = otherBase * (1 + clampPercent(otherChange) / 100);
  const scenarioTotal = materialScenario + laborScenario + otherScenario;
  const delta = scenarioTotal - safe(projectCost);
  const deltaPct = projectCost > 0 ? delta / projectCost * 100 : 0;

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ["Rate Analysis Scenario", projectName],
      ["Material rate change (%)", clampPercent(materialChange)],
      ["Labor rate change (%)", clampPercent(laborChange)],
      ["Other estimate cost change (%)", clampPercent(otherChange)],
      [],
      ["MATERIALS", "Quantity", "Unit", "Current rate", "Scenario rate", "Current cost", "Scenario cost"],
      ...materialRows.map(row => [row.name, row.quantity, row.unit, row.rate, row.scenarioRate, row.total, row.scenarioTotal]),
      ["Material subtotal", "", "", "", "", materialTotal, materialScenario],
      [],
      ["LABOR", "Days", "Unit", "Current daily rate", "Scenario daily rate", "Current cost", "Scenario cost"],
      ...laborRows.map(row => [row.name, row.days, "day", row.rate, row.scenarioRate, row.total, row.scenarioTotal]),
      ["Labor subtotal", "", "", "", "", laborTotal, laborScenario],
      [],
      ["Other estimate cost (derived residual)", "", "", "", "", otherBase, otherScenario],
      ["Current estimate baseline", safe(projectCost)],
      ["Scenario estimate total", scenarioTotal],
      ["Scenario change", delta],
      ["Scenario change (%)", deltaPct],
      [],
      ["Notice", "Scenario calculations apply user-entered percentage changes to existing estimate values. Rates are not independently verified market quotations."],
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(projectName || "Project").replace(/[^a-z0-9-_]+/gi, "_")}_Rate_Analysis.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const controls = [
    { label: "Material price change (%)", value: materialChange, change: setMaterialChange, hint: "Applied to all listed material rates" },
    { label: "Labor rate change (%)", value: laborChange, change: setLaborChange, hint: "Applied to all listed daily labor rates" },
    { label: "Other cost change (%)", value: otherChange, change: setOtherChange, hint: "Applied to residual cost outside materials and labor" },
  ];

  return (
    <section aria-labelledby="rate-analysis-title" className="scroll-mt-6 space-y-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300"><Calculator className="h-3.5 w-3.5" /> RATE & COST INTELLIGENCE</div>
          <h2 id="rate-analysis-title" className="text-2xl font-bold tracking-tight md:text-3xl">Rate analysis & cost scenarios</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Compare the current estimate with hypothetical rate changes. All baseline quantities and rates come from the existing estimate engine.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="w-fit"><Download className="mr-2 h-4 w-4" /> Export rate report</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {controls.map(control => <div key={control.label} className="rounded-2xl border border-border/70 bg-background p-4">
          <label className="text-sm font-semibold" htmlFor={control.label}>{control.label}</label>
          <div className="mt-2 flex items-center gap-2"><Input id={control.label} type="number" min={-100} max={500} step={1} value={control.value} onChange={event => control.change(clampPercent(Number(event.target.value)))} className="max-w-32 tabular-nums" /><span className="text-sm text-muted-foreground">%</span></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{control.hint}</p>
        </div>)}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/70 p-4"><p className="text-xs text-muted-foreground">Current estimate baseline</p><p className="mt-2 break-words text-xl font-bold">{currency(safe(projectCost))}</p><p className="mt-1 text-xs text-muted-foreground">Provided estimate total</p></div>
        <div className="rounded-2xl border border-border/70 p-4"><p className="text-xs text-muted-foreground">Scenario total</p><p className="mt-2 break-words text-xl font-bold">{currency(scenarioTotal)}</p><p className="mt-1 text-xs text-muted-foreground">After the selected rate changes</p></div>
        <div className={`rounded-2xl border p-4 ${delta > 0 ? "border-amber-500/30 bg-amber-500/5" : delta < 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/70"}`}><p className="text-xs text-muted-foreground">Estimated cost impact</p><p className="mt-2 break-words text-xl font-bold">{delta > 0 ? "+" : ""}{currency(delta)}</p><p className="mt-1 text-xs text-muted-foreground">{deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(2)}% from baseline</p></div>
        <div className="rounded-2xl border border-border/70 p-4"><p className="text-xs text-muted-foreground">Material + labor</p><p className="mt-2 break-words text-xl font-bold">{currency(materialScenario + laborScenario)}</p><p className="mt-1 text-xs text-muted-foreground">Scenario direct-cost subtotal</p></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-border/70 p-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold">Material unit rates</h3><p className="mt-1 text-xs text-muted-foreground">Quantity × current/scenario rate, using engine line totals</p></div><Badge variant="outline">{materialRows.length} lines</Badge></div>
          {materialRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-3">Material</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Current rate</th><th className="px-2 py-2 text-right">Scenario rate</th><th className="py-2 pl-2 text-right">Scenario cost</th></tr></thead><tbody>{materialRows.map(row => <tr key={row.name} className="border-b border-border/50"><td className="py-2 pr-3 font-medium">{row.name}<p className="text-xs text-muted-foreground">{row.unit}</p></td><td className="px-2 py-2 text-right tabular-nums">{fmt(row.quantity)}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(row.rate)}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(row.scenarioRate)}</td><td className="py-2 pl-2 text-right font-semibold tabular-nums">{fmt(row.scenarioTotal)}</td></tr>)}</tbody><tfoot><tr className="bg-muted/40 font-bold"><td className="py-3" colSpan={4}>Scenario material subtotal</td><td className="py-3 text-right">{fmt(materialScenario)}</td></tr></tfoot></table></div> : <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No material rates available.</p>}
        </div>
        <div className="min-w-0 rounded-2xl border border-border/70 p-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold">Labor unit rates</h3><p className="mt-1 text-xs text-muted-foreground">Crew days × current/scenario daily rate</p></div><Badge variant="outline">{laborRows.length} crews</Badge></div>
          {laborRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-3">Crew</th><th className="px-2 py-2 text-right">Days</th><th className="px-2 py-2 text-right">Current/day</th><th className="px-2 py-2 text-right">Scenario/day</th><th className="py-2 pl-2 text-right">Scenario cost</th></tr></thead><tbody>{laborRows.map(row => <tr key={row.name} className="border-b border-border/50"><td className="py-2 pr-3 font-medium">{row.name}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(row.days)}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(row.rate)}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(row.scenarioRate)}</td><td className="py-2 pl-2 text-right font-semibold tabular-nums">{fmt(row.scenarioTotal)}</td></tr>)}</tbody><tfoot><tr className="bg-muted/40 font-bold"><td className="py-3" colSpan={4}>Scenario labor subtotal</td><td className="py-3 text-right">{fmt(laborScenario)}</td></tr></tfoot></table></div> : <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No labor rates available.</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><h3 className="font-semibold">Rate verification & calculation notes</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground"><li>Scenario changes are user-controlled what-if percentages, not a claim about future or live market prices.</li><li>Baseline rates are taken from the current estimate engine and selected district-rate inputs; verify with dated supplier and labor quotations before procurement.</li><li>“Other estimate cost” is the difference between the supplied project estimate total and listed materials/labor. It is adjusted as one scenario bucket and may include civil work, finishing, services, transport, overhead or contingency.</li><li>This analysis does not replace a measured BOQ, rate build-up with resource coefficients, tax review or engineer-approved estimate.</li></ul></div></div>
      <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" /> <span>Scenario totals are a transparent sensitivity model. They may differ from a fully regenerated quotation if the estimate applies additional percentage-based overhead, contingency or contractor profit.</span></div></div>
    </section>
  );
}
