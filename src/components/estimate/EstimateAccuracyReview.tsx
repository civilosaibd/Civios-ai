import { useMemo } from "react";
import { Download, ShieldCheck, AlertTriangle, CheckCircle2, Info, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Line = { qty: number; unit: string; rate: number; total: number };
type LaborLine = { days: number; rate: number; total: number };
type Estimate = {
  totalFloorArea: number; floors: number; totalCost: number; costPerSqft: number;
  materials: Record<string, Line>; labor: Record<string, LaborLine>;
  civilWork: Record<string, number>; finishing: Record<string, number>;
  electrical: Record<string, number | string>; plumbing: Record<string, number | string>;
  costBreakdown: { category: string; amount: number }[];
};
type BOQItem = { item: string; qty: number; unit: string; rate: number; total: number };
type Props = { estimate: Estimate; boq: BOQItem[]; projectName: string; fmt: (value: number) => string; currency: (value: number) => string };

type Finding = { severity: "review" | "info" | "ok"; title: string; detail: string };

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const EPSILON = 0.01;

export default function EstimateAccuracyReview({ estimate, boq, projectName, fmt, currency }: Props) {
  const findings = useMemo(() => {
    const rows: Finding[] = [];
    const materials = Object.entries(estimate.materials || {});
    const labor = Object.entries(estimate.labor || {});

    if (!isFiniteNumber(estimate.totalFloorArea) || estimate.totalFloorArea <= 0) {
      rows.push({ severity: "review", title: "Floor area is missing or invalid", detail: "Enter a positive project floor area and review the area units before relying on the estimate." });
    } else {
      rows.push({ severity: "ok", title: "Floor area is positive", detail: `Recorded total floor area: ${fmt(estimate.totalFloorArea)} sqft. Confirm that the source dimensions and unit conversion are correct.` });
    }
    if (!Number.isInteger(estimate.floors) || estimate.floors < 1) {
      rows.push({ severity: "review", title: "Floor count needs review", detail: "The estimate should have a whole-number floor count of at least 1." });
    }
    if (!isFiniteNumber(estimate.totalCost) || estimate.totalCost <= 0) {
      rows.push({ severity: "review", title: "Project total is missing or invalid", detail: "The estimate total is not a positive finite number." });
    }

    let materialIssues = 0;
    for (const [name, line] of materials) {
      if (![line.qty, line.rate, line.total].every(isFiniteNumber)) {
        materialIssues++;
        rows.push({ severity: "review", title: `Invalid material values: ${name}`, detail: "Quantity, unit rate and line total must all be finite numbers." });
        continue;
      }
      if (line.qty < 0 || line.rate < 0 || line.total < 0) {
        materialIssues++;
        rows.push({ severity: "review", title: `Negative material value: ${name}`, detail: "Negative quantity, rate or line total needs correction or an explicit credit/discount explanation." });
      }
      const expected = line.qty * line.rate;
      if (Math.abs(expected - line.total) > Math.max(1, Math.abs(expected) * 0.005)) {
        materialIssues++;
        rows.push({ severity: "review", title: `Material line arithmetic differs: ${name}`, detail: `Quantity × rate gives ${fmt(expected)}, while the stored line total is ${fmt(line.total)}.` });
      }
    }
    if (materials.length && materialIssues === 0) {
      rows.push({ severity: "ok", title: "Material line arithmetic passed", detail: `${materials.length} material lines checked for finite, non-negative values and quantity × rate consistency.` });
    }
    let laborIssues = 0;
    for (const [name, line] of labor) {
      if (![line.days, line.rate, line.total].every(isFiniteNumber) || line.days < 0 || line.rate < 0 || line.total < 0) {
        laborIssues++;
        rows.push({ severity: "review", title: `Labor values need review: ${name}`, detail: "Days, daily rate and total must be finite and non-negative." });
        continue;
      }
      const expected = line.days * line.rate;
      if (Math.abs(expected - line.total) > Math.max(1, Math.abs(expected) * 0.005)) {
        laborIssues++;
        rows.push({ severity: "review", title: `Labor line arithmetic differs: ${name}`, detail: `Days × daily rate gives ${fmt(expected)}, while the stored line total is ${fmt(line.total)}.` });
      }
    }
    if (labor.length && laborIssues === 0) {
      rows.push({ severity: "ok", title: "Labor line arithmetic passed", detail: `${labor.length} labor lines checked for finite, non-negative values and days × rate consistency.` });
    }

    const boqIssues = boq.filter((line) => ![line.qty, line.rate, line.total].every(isFiniteNumber) || line.qty < 0 || line.rate < 0 || line.total < 0);
    if (boqIssues.length) {
      rows.push({ severity: "review", title: "BOQ contains invalid numeric values", detail: `${boqIssues.length} BOQ lines contain non-finite or negative quantity/rate/total values.` });
    } else if (boq.length) {
      rows.push({ severity: "ok", title: "BOQ numeric fields passed", detail: `${boq.length} BOQ lines have finite, non-negative quantity, rate and total fields. This does not validate measurement correctness.` });
    } else {
      rows.push({ severity: "info", title: "BOQ is empty", detail: "No BOQ line items were supplied for review." });
    }

    const breakdownTotal = (estimate.costBreakdown || []).reduce((sum, item) => sum + (isFiniteNumber(item.amount) ? item.amount : 0), 0);
    if (isFiniteNumber(estimate.totalCost) && estimate.totalCost > 0 && breakdownTotal > 0) {
      const gap = estimate.totalCost - breakdownTotal;
      rows.push({ severity: Math.abs(gap) > Math.max(1, estimate.totalCost * 0.02) ? "info" : "ok", title: "Cost breakdown comparison", detail: `Listed breakdown: ${currency(breakdownTotal)}; estimate total: ${currency(estimate.totalCost)}; difference: ${currency(gap)}. Different totals can be expected when margins or quotation adjustments are applied separately.` });
    } else {
      rows.push({ severity: "info", title: "Cost breakdown comparison unavailable", detail: "A positive estimate total and non-empty cost breakdown are required for this comparison." });
    }

    rows.push({ severity: "info", title: "Engineering quantities require professional review", detail: "Automated checks validate arithmetic and basic input ranges only. They do not verify site measurements, design adequacy, code compliance, rate freshness, or construction safety." });
    return rows;
  }, [estimate, boq, fmt, currency]);

  const reviewCount = findings.filter((item) => item.severity === "review").length;
  const okCount = findings.filter((item) => item.severity === "ok").length;
  const infoCount = findings.filter((item) => item.severity === "info").length;

  const exportReport = () => {
    const rows = [
      ["Estimate Review Report", projectName],
      ["Generated at", new Date().toISOString()],
      ["Total floor area (sqft)", estimate.totalFloorArea],
      ["Floors", estimate.floors],
      ["Estimate total", estimate.totalCost],
      ["Cost per sqft", estimate.costPerSqft],
      ["Review items", reviewCount],
      ["Passed checks", okCount],
      ["Informational notes", infoCount],
      [],
      ["Severity", "Check", "Details"],
      ...findings.map((item) => [item.severity.toUpperCase(), item.title, item.detail]),
      [],
      ["Limitations", "Automated arithmetic and input-range checks only; not a certified quantity survey, structural check, or market-rate verification."],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(projectName || "Project").replace(/[^a-z0-9-_]+/gi, "_")}_Estimate_Review.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const style = {
    review: { icon: AlertTriangle, label: "Review", className: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
    info: { icon: Info, label: "Note", className: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300" },
    ok: { icon: CheckCircle2, label: "Passed", className: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" },
  } as const;

  return (
    <section aria-labelledby="estimate-review-title" className="space-y-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ClipboardCheck className="h-5 w-5" /></span>
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><ShieldCheck className="h-3.5 w-3.5" /> QUALITY & INPUT REVIEW</div>
            <h2 id="estimate-review-title" className="text-2xl font-bold tracking-tight md:text-3xl">Estimate accuracy & engineering review</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Checks arithmetic, numeric ranges and estimate completeness indicators using the current estimate snapshot. Findings are guidance—not certification of design or quantities.</p>
          </div>
        </div>
        <button type="button" onClick={exportReport} className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"><Download className="mr-2 h-4 w-4" /> Export review CSV</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4"><p className="text-xs text-muted-foreground">Items to review</p><p className="mt-1 text-2xl font-bold">{reviewCount}</p><p className="mt-1 text-xs text-muted-foreground">Requires user verification</p></div>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="text-xs text-muted-foreground">Passed checks</p><p className="mt-1 text-2xl font-bold">{okCount}</p><p className="mt-1 text-xs text-muted-foreground">Basic arithmetic/range checks only</p></div>
        <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4"><p className="text-xs text-muted-foreground">Informational notes</p><p className="mt-1 text-2xl font-bold">{infoCount}</p><p className="mt-1 text-xs text-muted-foreground">Assumptions and limitations</p></div>
      </div>

      <div className="space-y-3">
        {findings.map((item, index) => {
          const config = style[item.severity];
          const Icon = config.icon;
          return <article key={`${item.title}-${index}`} className={`flex items-start gap-3 rounded-2xl border p-4 ${config.className}`}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3><Badge variant="outline">{config.label}</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p></div>
          </article>;
        })}
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <p className="font-semibold text-foreground">Review scope</p>
        <p className="mt-1">The dashboard can identify arithmetic inconsistencies in the supplied data. It cannot confirm whether the assumed quantities, dimensions, soil conditions, structural design, local prices, taxes or scope are correct. Obtain an engineer/quantity surveyor review before procurement or construction.</p>
      </div>
    </section>
  );
}
