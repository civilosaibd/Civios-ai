import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wand2, Sparkles, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import type { CadDocument, CadEntity } from "@/lib/cad2d/geometry";

type Opening = { x: number; y: number; width: number; wall: "north" | "south" | "east" | "west"; room: string };
type GeneratedPlan = { units: "ft"; footprint: { width: number; depth: number }; roadSide: "north" | "south" | "east" | "west"; floors: number; rooms: Array<{ name: string; x: number; y: number; width: number; depth: number }>; doors: Opening[]; windows: Opening[]; assumptions: string[]; warnings: string[] };
const unitFactor: Record<CadDocument["units"], number> = { ft: 1, in: 12, m: 0.3048, cm: 30.48, mm: 304.8 };
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `indocad-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function toCadDocument(plan: GeneratedPlan, units: CadDocument["units"]): CadDocument {
  const f = unitFactor[units];
  const wallLayer = { id: "ai-walls", name: "AI Generated Walls", visible: true, color: "#334155", lineWeight: 2 };
  const openingLayer = { id: "ai-openings", name: "AI Doors & Windows", visible: true, color: "#0284c7", lineWeight: 1 };
  const labelLayer = { id: "ai-labels", name: "AI Room Labels & Dimensions", visible: true, color: "#64748b", lineWeight: 1 };
  const entities: CadEntity[] = [];
  const wall = (x1: number, y1: number, x2: number, y2: number) => {
    if (Math.hypot(x2-x1,y2-y1)<0.05) return;
    entities.push({id:makeId(),layerId:wallLayer.id,type:"wall",start:{x:x1*f,y:y1*f},end:{x:x2*f,y:y2*f},thickness:0.5*f});
  };
  const label = (x:number,y:number,value:string,height=0.75) => entities.push({id:makeId(),layerId:labelLayer.id,type:"text",at:{x:x*f,y:y*f},text:value,height:height*f,rotation:0});
  wall(0,0,plan.footprint.width,0); wall(plan.footprint.width,0,plan.footprint.width,plan.footprint.depth);
  wall(plan.footprint.width,plan.footprint.depth,0,plan.footprint.depth); wall(0,plan.footprint.depth,0,0);
  for(const room of plan.rooms){
    const right=room.x+room.width, top=room.y+room.depth;
    wall(room.x,room.y,right,room.y); wall(right,room.y,right,top); wall(right,top,room.x,top); wall(room.x,top,room.x,room.y);
    label(room.x+room.width/2-Math.min(2.2,room.name.length*0.18),room.y+room.depth/2,room.name,0.8);
    label(room.x+room.width/2-1.3,room.y+room.depth/2+1.05,`${room.width.toFixed(1)}' × ${room.depth.toFixed(1)}'`,0.5);
  }
  const addOpening=(item:Opening,type:"door"|"window")=>entities.push({id:makeId(),layerId:openingLayer.id,type,at:{x:item.x*f,y:item.y*f},width:item.width*f,rotation:item.wall==="north"||item.wall==="south"?0:Math.PI/2,...(type==="door"?{swing:"left" as const}:{})} as CadEntity);
  plan.doors.forEach(item=>addOpening(item,"door")); plan.windows.forEach(item=>addOpening(item,"window"));
  entities.push({id:makeId(),layerId:labelLayer.id,type:"dimension",a:{x:0,y:-2*f},b:{x:plan.footprint.width*f,y:-2*f},offset:0.6*f});
  entities.push({id:makeId(),layerId:labelLayer.id,type:"dimension",a:{x:(plan.footprint.width+2)*f,y:0},b:{x:(plan.footprint.width+2)*f,y:plan.footprint.depth*f},offset:0.6*f});
  label(0,-4.2,`AI CONCEPT · ${plan.floors} FLOOR(S) · ROAD: ${plan.roadSide.toUpperCase()}`,0.85);
  return {version:2,units,entities,layers:[wallLayer,openingLayer,labelLayer]};
}
export default function AutoPlanGenerator({units,onGenerate}:{units:CadDocument["units"];onGenerate:(document:CadDocument)=>void}){
  const [prompt,setPrompt]=useState("40×60 ft plot, south road, 3 bedrooms, 2 bathrooms, 4 floors. Include living/drawing room, dining, kitchen, family space, staircase, balcony and good natural ventilation. Keep rooms practical and arrange them in a compact modern family house.");
  const [busy,setBusy]=useState(false);
  const [notes,setNotes]=useState<string[]>([]);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [generatedMeta,setGeneratedMeta]=useState<{rooms:number;floors:number}|null>(null);
  const handleGenerate=async()=>{
    if(busy)return;
    if(prompt.trim().length<8){toast.error("Please describe the building requirements in more detail.");return;}
    setBusy(true);setNotes([]);setWarnings([]);setGeneratedMeta(null);
    try{
      const {data,error}=await supabase.functions.invoke("ai-floorplan",{body:{prompt:prompt.trim()}});
      if(error)throw new Error(error.message||"AI floor-plan service could not be reached.");
      if(!data?.ok||!data.plan)throw new Error(data?.error||"AI did not return a valid floor plan.");
      const plan=data.plan as GeneratedPlan; const drawing=toCadDocument(plan,units);
      if(drawing.entities.length<10)throw new Error("The generated CAD geometry is incomplete. Please try a more detailed prompt.");
      onGenerate(drawing);setNotes(plan.assumptions??[]);setWarnings(plan.warnings??[]);
      setGeneratedMeta({rooms:plan.rooms.length,floors:plan.floors});
      toast.success(`AI generated ${plan.rooms.length} rooms and ${drawing.entities.length} editable CAD objects.`);
    }catch(error){toast.error(error instanceof Error?error.message:"AI floor-plan generation failed.");}
    finally{setBusy(false);}
  };
  return <section className="shrink-0 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-3 shadow-sm">
    <div className="mb-2 flex items-center gap-2"><div className="rounded-lg bg-orange-500 p-2 text-white"><Sparkles className="h-4 w-4" /></div><div className="min-w-0"><h3 className="text-sm font-bold text-slate-900">Automatic 2D & 3D Building Generator</h3><p className="text-[10px] text-slate-600">Describe your building or use manual CAD tools below. Generated objects remain editable.</p></div></div>
    <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} aria-label="Describe building requirements" placeholder="Example: 40x60 ft plot, south road, 3 bedrooms, 2 bathrooms, 4 floors..." className="resize-y bg-white text-xs" />
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-[10px] text-slate-500"><AlertTriangle className="h-3 w-3" />Conceptual layout only; engineer review required.</p><Button size="sm" onClick={handleGenerate} disabled={busy} className="bg-orange-600 text-white hover:bg-orange-700"><Wand2 className="mr-1.5 h-4 w-4" />{busy ? "Generating..." : "Generate 2D + 3D"}</Button></div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-[10px] text-slate-500"><AlertTriangle className="h-3 w-3" />Conceptual layout only; engineer review required.</p><Button size="sm" onClick={handleGenerate} disabled={busy} className="bg-orange-600 text-white hover:bg-orange-700">{busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Generating...</> : <><Wand2 className="mr-1.5 h-4 w-4" />Generate 2D + 3D</>}</Button></div>
    {generatedMeta && <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />AI plan generated: {generatedMeta.rooms} rooms · {generatedMeta.floors} floors. Edit any CAD object or switch to 3D Preview.</div>}
    {(notes.length>0||warnings.length>0)&&<div className="mt-2 grid gap-2 sm:grid-cols-2">{notes.length>0&&<div className="rounded-md border bg-white p-2 text-[11px]"><p className="mb-1 font-semibold text-slate-700">AI assumptions</p>{notes.map((item,i)=><p key={i} className="text-slate-600">• {item}</p>)}</div>}{warnings.length>0&&<div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px]"><p className="mb-1 font-semibold text-amber-800">AI warnings</p>{warnings.map((item,i)=><p key={i} className="text-amber-800">• {item}</p>)}</div>}</div>}
  </section>;
}
