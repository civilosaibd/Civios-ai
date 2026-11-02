import { useState } from "react";
import { Wand2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DEFAULT_INPUT, generatePlan, parsePrompt, type PlanInput } from "@/lib/planGenerator";
import type { CadDocument, CadEntity } from "@/lib/cad2d/geometry";

const unitFactor: Record<CadDocument["units"], number> = { ft: 1, in: 12, m: 0.3048, cm: 30.48, mm: 304.8 };
const id = () => globalThis.crypto?.randomUUID?.() ?? `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function toCadDocument(input: PlanInput, units: CadDocument["units"]): CadDocument {
  const plan = generatePlan(input);
  const f = unitFactor[units];
  const wallLayer = { id: "auto-walls", name: "AI Generated Walls", visible: true, color: "#334155", lineWeight: 2 };
  const openingLayer = { id: "auto-openings", name: "Doors & Windows", visible: true, color: "#0ea5e9", lineWeight: 1 };
  const labelLayer = { id: "auto-labels", name: "Room Labels & Dimensions", visible: true, color: "#64748b", lineWeight: 1 };
  const entities: CadEntity[] = [];
  const wall = (x1: number, y1: number, x2: number, y2: number) => entities.push({
    id: id(), layerId: wallLayer.id, type: "wall",
    start: { x: x1 * f, y: y1 * f }, end: { x: x2 * f, y: y2 * f }, thickness: 0.5 * f,
  });
  const label = (x: number, y: number, text: string, height = 0.8) => entities.push({
    id: id(), layerId: labelLayer.id, type: "text",
    at: { x: x * f, y: y * f }, text, height: height * f, rotation: 0,
  });
  // Outer perimeter
  wall(0, 0, plan.buildW, 0); wall(plan.buildW, 0, plan.buildW, plan.buildD);
  wall(plan.buildW, plan.buildD, 0, plan.buildD); wall(0, plan.buildD, 0, 0);
  // Native room partitions and labels
  for (const room of plan.rooms) {
    const x1 = room.x, y1 = room.y, x2 = room.x + room.w, y2 = room.y + room.h;
    wall(x1, y1, x2, y1); wall(x2, y1, x2, y2); wall(x2, y2, x1, y2); wall(x1, y2, x1, y1);
    label(room.x + room.w / 2 - Math.max(1, room.name.length * 0.18), room.y + room.h / 2, room.name, 0.85);
    label(room.x + room.w / 2 - 1.2, room.y + room.h / 2 + 1.25, `${room.w.toFixed(1)}' × ${room.h.toFixed(1)}'`, 0.55);
    // Door object is a true editable CAD entity. The 2D/3D workspace can select and transform it.
    entities.push({ id: id(), layerId: openingLayer.id, type: "door", at: { x: (x1 + x2) / 2 * f, y: y1 * f }, width: Math.min(3, Math.max(2.5, room.w * 0.28)) * f, rotation: 0, swing: "left" });
  }
  // Add windows to the outer rear and front elevations as editable CAD objects.
  entities.push({ id: id(), layerId: openingLayer.id, type: "window", at: { x: plan.buildW * 0.25 * f, y: plan.buildD * f }, width: Math.min(4, plan.buildW * 0.22) * f, rotation: 0 });
  entities.push({ id: id(), layerId: openingLayer.id, type: "window", at: { x: plan.buildW * 0.72 * f, y: plan.buildD * f }, width: Math.min(4, plan.buildW * 0.22) * f, rotation: 0 });
  // Plot/building dimensions and metadata
  entities.push({ id: id(), layerId: labelLayer.id, type: "dimension", a: { x: 0, y: -2 * f }, b: { x: plan.buildW * f, y: -2 * f }, offset: 0.6 * f });
  entities.push({ id: id(), layerId: labelLayer.id, type: "dimension", a: { x: (plan.buildW + 2) * f, y: 0 }, b: { x: (plan.buildW + 2) * f, y: plan.buildD * f }, offset: 0.6 * f });
  label(0, -4.2, `AI CONCEPT PLAN · ${input.bedrooms} BED · ${input.bathrooms} BATH · ${input.floors} FLOORS`, 0.9);
  const columns = Math.max(2, Math.floor(plan.buildW / 12));
  for (let row = 0; row < 2; row++) for (let col = 0; col < columns; col++) {
    entities.push({ id: id(), layerId: wallLayer.id, type: "column", at: { x: (plan.buildW * (col + 0.5) / columns) * f, y: (plan.buildD * (row ? 0.82 : 0.18)) * f }, width: 1 * f, depth: 1 * f, rotation: 0 });
  }
  return { version: 2, units, entities, layers: [wallLayer, openingLayer, labelLayer] };
}

export default function AutoPlanGenerator({ units, onGenerate }: { units: CadDocument["units"]; onGenerate: (document: CadDocument) => void }) {
  const [prompt, setPrompt] = useState("40x60 ft plot, south road, 3 bedrooms, 2 bathrooms, 4 floors, drawing, dining, kitchen, balcony and stair");
  const [busy, setBusy] = useState(false);
  const handleGenerate = () => {
    if (!prompt.trim()) { toast.error("Describe your building first."); return; }
    setBusy(true);
    try {
      const parsed = parsePrompt(prompt, DEFAULT_INPUT);
      const match = prompt.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|ফুট)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
      if (match) { parsed.plotWidth = Number(match[1]); parsed.plotDepth = Number(match[2]); }
      const drawing = toCadDocument(parsed, units);
      if (drawing.entities.length < 12) throw new Error("The requested layout did not produce enough geometry. Add plot dimensions and room requirements.");
      onGenerate(drawing);
      toast.success(`Generated editable 2D plan with ${drawing.entities.length} CAD objects. Switch to 3D Preview to view the model.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the floor plan.");
    } finally { setBusy(false); }
  };
  return <section className="shrink-0 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-3 shadow-sm">
    <div className="mb-2 flex items-center gap-2"><div className="rounded-lg bg-orange-500 p-2 text-white"><Sparkles className="h-4 w-4" /></div><div className="min-w-0"><h3 className="text-sm font-bold text-slate-900">Automatic 2D & 3D Building Generator</h3><p className="text-[10px] text-slate-600">Describe your building or use manual CAD tools below. Generated objects remain editable.</p></div></div>
    <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} aria-label="Describe building requirements" placeholder="Example: 40x60 ft plot, south road, 3 bedrooms, 2 bathrooms, 4 floors..." className="resize-y bg-white text-xs" />
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-[10px] text-slate-500"><AlertTriangle className="h-3 w-3" />Conceptual layout only; engineer review required.</p><Button size="sm" onClick={handleGenerate} disabled={busy} className="bg-orange-600 text-white hover:bg-orange-700"><Wand2 className="mr-1.5 h-4 w-4" />{busy ? "Generating..." : "Generate 2D + 3D"}</Button></div>
  </section>;
}
