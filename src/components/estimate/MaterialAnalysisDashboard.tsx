import { useMemo } from "react";
import { Activity, Construction, DollarSign, Download, Layers, ShieldCheck, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Material = { qty: number; unit: string; rate: number; total: number };
type Props = {
  materials: Record<string, Material>;
  projectName: string;
  projectCost: number;
  currency: (value: number) => string;
  fmt: (value: number) => string;
};

export default function MaterialAnalysisDashboard({ materials, projectName, projectCost, currency, fmt }: Props) {
  const rows = useMemo(() => Object.entries(materials).map(([name, item]) => ({
    name,
    qty: Number.isFinite(item.qty) ? item.qty : 0,
    unit: item.unit,
    rate: Number.isFinite(item.rate) ? item.rate : 0,
    total: Number.isFinite(item.total) ? item.total : 0,
  })), [materials]);
  const total = rows.reduce((sum, item) => sum + item.total, 0);
  const highest = [...rows].sort((a, b) => b.total - a.total)[0];
  const chartRows = rows.filter((item) => item.total > 0).sort((a, b) => b.total - a.total);

  const exportCsv = () => {
    const csvRows: (string | number)[][] = [
      ["Material", "Estimated quantity", "Unit", "Rate (BDT)", "Estimated cost (BDT)", "Project"],
      ...rows.map((item) => [item.name, item.qty, item.unit, item.rate, item.total, projectName]),
      ["", "", "", "TOTAL MATERIAL COST", total, projectName],
      [],
      ["Notice", "Preliminary estimate-engine quantities only. Verify against approved drawings, specifications, wastage allowances and current supplier quotations."],
    ];
    const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${projectName || "Project"}_Material_Analysis.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const metrics = [
    { label: "Material categories", value: String(rows.length), note: "Items provided by estimate engine", icon: Layers },
    { label: "Estimated material cost", value: currency(total), note: "Sum of listed material line totals", icon: DollarSign },
    { label: "Highest cost material", value: highest?.name ?? "Not available", note: highest ? currency(highest.total) : "No material data", icon: TrendingUp },
    { label: "Share of project estimate", value: projectCost > 0 ? `${(total / projectCost * 100).toFixed(1)}%` : "—", note: "Compared with estimate-engine total before contractor profit", icon: Activity },
  ];

  return (
    <section aria-labelledby="material-analysis-title" className="scroll-mt-6 space-y-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300"><Construction className="h-3.5 w-3.5" /> LIVE MATERIAL SCHEDULE</div>
          <h2 id="material-analysis-title" className="text-2xl font-bold tracking-tight md:text-3xl">Material analysis</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Material quantities, unit rates and costs are read directly from the current estimate and update with project inputs and rates.</p>
        </div>
        <Button onClick={exportCsv} variant="outline" className="w-fit"><Download className="mr-2 h-4 w-4" /> Export material report</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><metric.icon className="h-4 w-4" /></span></div>
            <p className="mt-3 break-words text-xl font-bold tracking-tight">{metric.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 rounded-2xl border border-border/70 p-4 md:p-5">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-semibold">Material schedule</h3><p className="mt-1 text-xs text-muted-foreground">Current project estimate quantities and rates</p></div><Badge variant="outline">{rows.length} items</Badge></div>
          {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-3 pr-3 font-medium">Material</th><th className="px-3 py-3 text-right font-medium">Quantity</th><th className="px-3 py-3 font-medium">Unit</th><th className="px-3 py-3 text-right font-medium">Rate</th><th className="py-3 pl-3 text-right font-medium">Cost (BDT)</th></tr></thead>
            <tbody>{rows.map((item) => <tr key={item.name} className="border-b border-border/50"><td className="py-3 pr-3 font-medium">{item.name}</td><td className="px-3 py-3 text-right tabular-nums">{fmt(item.qty)}</td><td className="px-3 py-3 text-muted-foreground">{item.unit}</td><td className="px-3 py-3 text-right tabular-nums">{fmt(item.rate)}</td><td className="py-3 pl-3 text-right font-semibold tabular-nums">{fmt(item.total)}</td></tr>)}</tbody>
            <tfoot><tr className="bg-muted/40 font-bold"><td className="py-3 pr-3" colSpan={4}>Total listed material cost</td><td className="py-3 pl-3 text-right tabular-nums">{fmt(total)}</td></tr></tfoot>
          </table></div> : <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">Material quantities are not available for this estimate.</p>}
        </div>
        <div className="min-w-0 rounded-2xl border border-border/70 p-4 md:p-5">
          <div className="mb-3"><h3 className="font-semibold">Material cost breakdown</h3><p className="mt-1 text-xs text-muted-foreground">Listed material costs, highest first</p></div>
          <div className="h-80 min-w-0" role="img" aria-label="Bar chart showing estimated cost for each material">
            {chartRows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => value >= 100000 ? `৳${(value / 100000).toFixed(1)}L` : `৳${(value / 1000).toFixed(0)}k`} fontSize={10} /><YAxis type="category" dataKey="name" width={105} fontSize={10} tick={{ fill: "currentColor" }} /><Tooltip formatter={(value: number) => [currency(value), "Estimated material cost"]} /><Bar dataKey="total" name="Estimated material cost" fill="hsl(25, 90%, 50%)" radius={[0, 5, 5, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">The chart will appear when material cost data is available.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 md:p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div className="space-y-2"><h3 className="font-semibold">Engineering and quantity verification</h3><ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground"><li>These are preliminary planning quantities generated by the current estimate model, not a measured take-off from approved drawings.</li><li>Concrete mix, reinforcement, brickwork, wastage, laps, openings, specifications and site conditions can materially change actual quantities.</li><li>Confirm supplier rates, units and applicable taxes/transport with local quotations before procurement or contract use.</li><li>Do not use this schedule as a substitute for engineer-reviewed structural design, bar bending schedules or a certified BOQ.</li></ul></div></div></div>
    </section>
  );
}
