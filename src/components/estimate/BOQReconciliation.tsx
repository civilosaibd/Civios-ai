import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Info, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Material = { qty: number; unit: string; rate: number; total: number };
type BOQItem = { item: string; qty: number; unit: string; rate: number; total: number };
type Props = {
  materials: Record<string, Material>;
  boq: BOQItem[];
  fmt: (value: number) => string;
  currency: (value: number) => string;
};

const normalize = (value: string) => value.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

function materialKey(name: string): string | null {
  const value = normalize(name);
  if (value.includes("cement")) return "cement";
  if (value.includes("steel") || value.includes("reinforcement")) return "steel";
  if (value.includes("brick")) return "brick";
  if (value.includes("sand")) return "sand";
  if (value.includes("stone") || value.includes("aggregate") || value.includes("chips")) return "stone";
  if (value.includes("paint interior")) return "paint-interior";
  if (value.includes("paint exterior")) return "paint-exterior";
  if (value.includes("tile")) return "tiles";
  if (value.includes("door")) return "doors";
  if (value.includes("window")) return "windows";
  return null;
}

function unitKey(unit: string): string {
  const value = normalize(unit);
  if (["bag", "bags", "pcs", "pc", "piece", "pieces", "kg", "cft", "sft", "sqft"].includes(value)) return value;
  return value;
}

export default function BOQReconciliation({ materials, boq, fmt, currency }: Props) {
  const checks = useMemo(() => {
    const entries = Object.entries(materials).map(([name, material]) => ({ name, material, key: materialKey(name) }));
    const matched = entries.flatMap(({ name, material, key }) => {
      if (!key) return [];
      const candidates = boq.filter((item) => materialKey(item.item) === key);
      if (!candidates.length) return [];
      const item = candidates[0];
      const sameUnit = unitKey(material.unit) === unitKey(item.unit);
      const qtyDelta = material.qty - item.qty;
      const costDelta = material.total - item.total;
      const qtyDiffers = sameUnit && Math.abs(qtyDelta) > Math.max(0.01, Math.abs(material.qty) * 0.001);
      const costDiffers = Math.abs(costDelta) > Math.max(1, Math.abs(material.total) * 0.001);
      return [{ name, material, item, sameUnit, qtyDelta, costDelta, qtyDiffers, costDiffers }];
    });
    const boqOnly = boq.filter((item) => !entries.some(({ key }) => key !== null && key === materialKey(item.item)));
    const exact = matched.filter((row) => row.sameUnit && !row.qtyDiffers && !row.costDiffers).length;
    const needsReview = matched.filter((row) => !row.sameUnit || row.qtyDiffers || row.costDiffers).length;
    return { matched, boqOnly, exact, needsReview };
  }, [materials, boq]);

  const materialTotal = Object.values(materials).reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0);
  const boqTotal = boq.reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0);

  return (
    <section aria-labelledby="boq-reconciliation-title" className="space-y-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:p-7">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Scale className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="boq-reconciliation-title" className="text-2xl font-bold tracking-tight md:text-3xl">BOQ & material reconciliation</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Cross-checks matching material line items between the estimate material schedule and generated BOQ. This is a consistency check, not a project-total reconciliation: BOQ also contains work items such as concrete and plaster.</p>
        </div>
        <Badge variant="outline" className="hidden sm:inline-flex">Step 5</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/70 p-4"><p className="text-xs text-muted-foreground">Matched BOQ lines</p><p className="mt-2 text-2xl font-bold">{checks.matched.length}</p><p className="mt-1 text-xs text-muted-foreground">Material items found in both lists</p></div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="text-xs text-muted-foreground">Consistent lines</p><p className="mt-2 text-2xl font-bold">{checks.exact}</p><p className="mt-1 text-xs text-muted-foreground">Quantity, unit and cost align</p></div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-xs text-muted-foreground">Lines to review</p><p className="mt-2 text-2xl font-bold">{checks.needsReview}</p><p className="mt-1 text-xs text-muted-foreground">Unit, quantity or cost differs</p></div>
        <div className="rounded-2xl border border-border/70 p-4"><p className="text-xs text-muted-foreground">Listed BOQ total</p><p className="mt-2 break-words text-2xl font-bold">{currency(boqTotal)}</p><p className="mt-1 text-xs text-muted-foreground">Material schedule: {currency(materialTotal)}</p></div>
      </div>

      {checks.matched.length ? (
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-4 py-3 font-medium">Material</th><th className="px-4 py-3 text-right font-medium">Material qty</th><th className="px-4 py-3 text-right font-medium">BOQ qty</th><th className="px-4 py-3 font-medium">Unit check</th><th className="px-4 py-3 text-right font-medium">Material cost</th><th className="px-4 py-3 text-right font-medium">BOQ cost</th><th className="px-4 py-3 font-medium">Result</th></tr></thead>
            <tbody>{checks.matched.map((row) => {
              const ok = row.sameUnit && !row.qtyDiffers && !row.costDiffers;
              return <tr key={row.name} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{row.name}<p className="text-xs text-muted-foreground">BOQ: {row.item.item}</p></td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(row.material.qty)} {row.material.unit}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(row.item.qty)} {row.item.unit}</td>
                <td className="px-4 py-3">{row.sameUnit ? <Badge variant="outline">Same unit</Badge> : <Badge variant="destructive">Unit differs</Badge>}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(row.material.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(row.item.total)}</td>
                <td className="px-4 py-3">{ok ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Consistent</span> : <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /> Review</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No directly comparable material lines were found in the generated BOQ.</div>}

      {checks.boqOnly.length > 0 && <div className="rounded-2xl border border-border/70 p-4"><h3 className="font-semibold">BOQ work items not directly comparable to material totals</h3><p className="mt-1 text-sm text-muted-foreground">These items are kept separate because their quantities or rates describe work scopes rather than a one-to-one material purchase line.</p><div className="mt-3 flex flex-wrap gap-2">{checks.boqOnly.map((item) => <Badge key={item.item} variant="secondary">{item.item}</Badge>)}</div></div>}

      <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4"><div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><h3 className="font-semibold">How to interpret this check</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">A matching quantity and cost indicates the two generated lists are internally consistent for that line; it does not prove the quantity is correct for the actual building. BOQ work-item totals and material purchase costs may overlap conceptually, so do not add the two totals together. Review every flagged line and confirm measurement rules, units, specifications and rates before tender or procurement.</p></div></div></div>
    </section>
  );
}
