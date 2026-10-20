import { Card } from "@/components/ui/card";
import { explain } from "@/lib/viz/edit";
import type { BuildingModel } from "@/lib/viz/types";
import { useL } from "./bits";

/** Rule-based (not generative) explanation: it only restates what the model data says. */
export default function ExplainPanel({ model }: { model: BuildingModel }) {
  const L = useL();
  const e = explain(model);
  return (
    <Card className="p-4 space-y-3 text-sm" data-testid="explain-panel">
      <h3 className="font-semibold">{L("Explain this model", "এই মডেল ব্যাখ্যা")}</h3>
      <div><div className="text-xs font-semibold text-emerald-600 uppercase mb-1">{L("From your drawing", "আপনার ড্রয়িং থেকে")}</div><ul className="list-disc pl-4 text-xs space-y-1">{e.facts.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
      <div><div className="text-xs font-semibold text-amber-600 uppercase mb-1">{L("Assumed / AI-inferred", "অনুমান / AI-inferred")}</div><ul className="list-disc pl-4 text-xs space-y-1">{e.assumed.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
      {e.warnings.length > 0 && <div><div className="text-xs font-semibold text-red-600 uppercase mb-1">{L("Warnings", "সতর্কতা")}</div><ul className="list-disc pl-4 text-xs space-y-1">{e.warnings.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
    </Card>
  );
}
