import { useMemo, useState } from "react";
import { Download, Calculator, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateConstructionTakeoff, type TakeoffInputs } from "@/lib/constructionTakeoff";

const initial: TakeoffInputs = {
  excavationLength: 10, excavationWidth: 1, excavationDepth: 1,
  footingCount: 4, footingLength: 2, footingWidth: 2, footingDepth: 0.5,
  slabArea: 100, slabThickness: 0.15,
  wallLength: 20, wallHeight: 3, wallThickness: 0.2, openingArea: 5,
  plasterArea: 80, floorArea: 100, paintArea: 160, steelKgPerM3: 100,
  rates: { excavationM3: 500, concreteM3: 8000, brickworkM3: 6000, plasterM2: 250, flooringM2: 1200, paintingM2: 180, steelKg: 90 },
};

const fields: Array<{ key: keyof Omit<TakeoffInputs, "rates">; label: string; step?: string }> = [
  { key: "excavationLength", label: "Excavation length (m)" },
  { key: "excavationWidth", label: "Excavation width (m)" },
  { key: "excavationDepth", label: "Excavation depth (m)" },
  { key: "footingCount", label: "Number of footings", step: "1" },
  { key: "footingLength", label: "Footing length (m)" },
  { key: "footingWidth", label: "Footing width (m)" },
  { key: "footingDepth", label: "Footing depth (m)" },
  { key: "slabArea", label: "Slab area (m²)" },
  { key: "slabThickness", label: "Slab thickness (m)" },
  { key: "wallLength", label: "Wall length (m)" },
  { key: "wallHeight", label: "Wall height (m)" },
  { key: "wallThickness", label: "Wall thickness (m)" },
  { key: "openingArea", label: "Door/window opening area (m²)" },
  { key: "plasterArea", label: "Measured plaster area (m²)" },
  { key: "floorArea", label: "Floor finish area (m²)" },
  { key: "paintArea", label: "Measured paint area (m²)" },
  { key: "steelKgPerM3", label: "Steel allowance (kg/m³)" },
];

const rateFields: Array<{ key: keyof TakeoffInputs["rates"]; label: string }> = [
  { key: "excavationM3", label: "Excavation rate / m³" },
  { key: "concreteM3", label: "Concrete rate / m³" },
  { key: "steelKg", label: "Steel rate / kg" },
  { key: "brickworkM3", label: "Masonry rate / m³" },
  { key: "plasterM2", label: "Plaster rate / m²" },
  { key: "flooringM2", label: "Flooring rate / m²" },
  { key: "paintingM2", label: "Painting rate / m²" },
];

export default function ConstructionTradeTakeoff() {
  const [values, setValues] = useState<TakeoffInputs>(initial);
  const [error, setError] = useState("");
  const result = useMemo(() => {
    try { setError(""); return calculateConstructionTakeoff(values); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid inputs"); return null; }
  }, [values]);

  const updateDimension = (key: keyof Omit<TakeoffInputs, "rates">, raw: string) => {
    const value = raw === "" ? 0 : Number(raw);
    setValues((current) => ({ ...current, [key]: value }));
  };
  const updateRate = (key: keyof TakeoffInputs["rates"], raw: string) => {
    const value = raw === "" ? 0 : Number(raw);
    setValues((current) => ({ ...current, rates: { ...current.rates, [key]: value } }));
  };
  const exportCsv = () => {
    if (!result) return;
    const rows = [["Code", "Description", "Quantity", "Unit", "Rate (BDT)", "Amount (BDT)", "Formula"],
      ...result.lines.map((line) => [line.code, line.description, line.quantity, line.unit, line.rate, line.amount, line.formula]),
      ["", "TOTAL", "", "", "", result.total, ""]];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "CivilOS_Trade_Takeoff_BOQ.csv"; anchor.click(); URL.revokeObjectURL(url);
  };

  return <section className="space-y-6">
    <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Construction trade takeoff</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Metric quantity worksheet for excavation, concrete, reinforcement allowance, masonry, plaster, flooring and painting. Enter measured dimensions and local unit rates.</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div><h3 className="mb-3 font-semibold">Dimensions & measured quantities</h3><div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => <label key={field.key} className="space-y-1 text-xs text-muted-foreground">{field.label}<Input type="number" min="0" step={field.step ?? "0.01"} value={values[field.key]} onChange={(event) => updateDimension(field.key, event.target.value)} /></label>)}
        </div></div>
        <div><h3 className="mb-3 font-semibold">Editable local rates (BDT)</h3><div className="grid gap-3 sm:grid-cols-2">
          {rateFields.map((field) => <label key={field.key} className="space-y-1 text-xs text-muted-foreground">{field.label}<Input type="number" min="0" step="0.01" value={values.rates[field.key]} onChange={(event) => updateRate(field.key, event.target.value)} /></label>)}
        </div>
          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground"><Info className="mr-1 inline h-4 w-4" /> Rates are editable placeholders, not verified market rates. Steel is an indicative kg/m³ allowance, not a bar bending schedule.</div>
        </div>
      </div>
    </div>
    <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Measured BOQ schedule</h3><p className="text-xs text-muted-foreground">Formula-driven quantities and editable rates</p></div><Button onClick={exportCsv} disabled={!result}><Download className="mr-2 h-4 w-4" /> Export BOQ CSV</Button></div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {result && <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-3">Code</th><th>Description</th><th className="text-right">Quantity</th><th>Unit</th><th className="text-right">Rate (৳)</th><th className="text-right">Amount (৳)</th></tr></thead><tbody>{result.lines.map((line) => <tr key={line.code} className="border-b border-border/50"><td className="py-3 text-xs">{line.code}</td><td>{line.description}<p className="text-xs text-muted-foreground">{line.formula}</p></td><td className="text-right tabular-nums">{line.quantity.toLocaleString("en-BD")}</td><td>{line.unit}</td><td className="text-right tabular-nums">{line.rate.toLocaleString("en-BD")}</td><td className="text-right font-semibold tabular-nums">{line.amount.toLocaleString("en-BD")}</td></tr>)}</tbody><tfoot><tr className="font-bold"><td colSpan={5} className="py-3 text-right">TOTAL (BDT)</td><td className="text-right">৳{result.total.toLocaleString("en-BD")}</td></tr></tfoot></table></div></>}
    </div>
  </section>;
}
