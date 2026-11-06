import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Plus, Trash2, RotateCcw, MousePointer2 } from "lucide-react";
import { toast } from "sonner";
import { analyzePolygon, polygonToDxf, type PlotVertex } from "@/lib/landGeometry";
import { findBuildingPlacement, type BuildingPlacementResult } from "@/lib/buildingPlacement";

type Props={T:(en:string,bn:string)=>string};
const initial:PlotVertex[]=[{x:0,y:0},{x:18,y:0},{x:15,y:12},{x:7,y:16},{x:0,y:10}];
const fmt=(n:number,d=2)=>n.toLocaleString(undefined,{maximumFractionDigits:d});
export default function IrregularPlotStudio({T}:Props){
  const [vertices,setVertices]=useState<PlotVertex[]>(initial);
  const [unit,setUnit]=useState<"m"|"ft">("m");
  const [draft,setDraft]=useState({x:"",y:""});
  const [building,setBuilding]=useState({width:"8",depth:"10",setback:"1.5"});
  const [placement,setPlacement]=useState<BuildingPlacementResult|null>(null);
  const svgRef=useRef<SVGSVGElement>(null);
  const analysis=useMemo(()=>analyzePolygon(vertices),[vertices]);
  const bounds=useMemo(()=>{
    const xs=vertices.map(p=>p.x),ys=vertices.map(p=>p.y);
    const minX=Math.min(0,...xs),maxX=Math.max(10,...xs),minY=Math.min(0,...ys),maxY=Math.max(10,...ys);
    const pad=Math.max((maxX-minX)*.12,(maxY-minY)*.12,2);
    return {minX:minX-pad,maxX:maxX+pad,minY:minY-pad,maxY:maxY+pad};
  },[vertices]);
  const width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY;
  const px=(x:number)=>40+(x-bounds.minX)/width*520;
  const py=(y:number)=>360-(y-bounds.minY)/height*320;
  const points=vertices.map(p=>`${px(p.x)},${py(p.y)}`).join(" ");
  const placementPoints=placement?.placement?.corners.map(p=>`${px(p.x)},${py(p.y)}`).join(" ");
  const add=()=>{
    const x=Number(draft.x),y=Number(draft.y);
    if(!draft.x.trim()||!draft.y.trim()||!Number.isFinite(x)||!Number.isFinite(y))return toast.error(T("Enter valid X and Y coordinates.","সঠিক X ও Y স্থানাঙ্ক দিন।"));
    setVertices(v=>[...v,{x,y}]);setDraft({x:"",y:""});
  };
  const addByCanvas=(event:MouseEvent<SVGSVGElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const sx=(event.clientX-rect.left)/rect.width*600,sy=(event.clientY-rect.top)/rect.height*400;
    if(sx<40||sx>560||sy<40||sy>360)return;
    const x=bounds.minX+(sx-40)/520*width,y=bounds.minY+(360-sy)/320*height;
    setVertices(v=>[...v,{x:Number(x.toFixed(3)),y:Number(y.toFixed(3))}]);
  };
  const calculatePlacement=()=>{
    if(!analysis.valid)return toast.error(T("Create a valid plot boundary first.","আগে সঠিক জমির সীমানা তৈরি করুন।"));
    const result=findBuildingPlacement({plot:vertices,width:Number(building.width),depth:Number(building.depth),setback:Number(building.setback),gridStep:Math.max(Number(building.width),Number(building.depth))/16,angleStepDegrees:15,maxCandidates:100000});
    setPlacement(result);
    if(!result.valid)toast.error(T(result.reason||"No suitable building placement found.","উপযুক্ত ভবনের অবস্থান পাওয়া যায়নি।"));
  };
  const exportDxf=()=>{
    if(!analysis.valid)return toast.error(T("Fix the boundary errors before exporting.","এক্সপোর্টের আগে সীমানার ভুল ঠিক করুন।"));
    const blob=new Blob([polygonToDxf(vertices)],{type:"application/dxf"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="civilos-irregular-plot.dxf";a.click();URL.revokeObjectURL(url);
  };
  const factor=unit==="m"?1:0.3048;
  const areaM2=analysis.area*factor*factor;
  const perimeterM=analysis.perimeter*factor;
  return <Card className="p-4 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold">{T("Irregular Plot Drawing Studio","অনিয়মিত জমির ড্রয়িং স্টুডিও")}</h3><p className="text-xs text-muted-foreground">{T("Draw any simple polygon using ordered survey coordinates or by clicking the canvas.","সার্ভে স্থানাঙ্ক দিয়ে অথবা ক্যানভাসে ক্লিক করে যেকোনো সাধারণ বহুভুজ আঁকুন।")}</p></div>
      <select aria-label={T("Coordinate unit","স্থানাঙ্কের একক")} className="h-9 rounded-md border bg-background px-2 text-sm" value={unit} onChange={e=>{const next=e.target.value as "m"|"ft";if(next!==unit){const scale=unit==="m"?1/0.3048:0.3048;setVertices(v=>v.map(p=>({x:Number((p.x*scale).toFixed(3)),y:Number((p.y*scale).toFixed(3))})));setBuilding(v=>({width:String(Number((Number(v.width)*scale).toFixed(3))),depth:String(Number((Number(v.depth)*scale).toFixed(3))),setback:String(Number((Number(v.setback)*scale).toFixed(3)))}));setPlacement(null);setUnit(next);}}}><option value="m">Metres (m)</option><option value="ft">Feet (ft)</option></select>
    </div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-2">
        <div className="rounded-lg border bg-muted/20 p-2">
          <div className="flex items-center justify-between pb-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><MousePointer2 className="h-3.5 w-3.5"/>{T("Click inside to add a vertex","ভেতরে ক্লিক করে কোণ যোগ করুন")}</span><span>{vertices.length} {T("vertices","টি কোণ")}</span></div>
          <svg ref={svgRef} viewBox="0 0 600 400" role="img" aria-label={T("Editable irregular plot boundary drawing","সম্পাদনাযোগ্য অনিয়মিত জমির সীমানা")} className="w-full h-auto touch-manipulation cursor-crosshair" onClick={addByCanvas}>
            <defs><pattern id="plot-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="1"/></pattern></defs>
            <rect x="0" y="0" width="600" height="400" fill="url(#plot-grid)"/>
            {vertices.length>=2&&<polyline points={points+(vertices.length>=3?` ${px(vertices[0].x)},${py(vertices[0].y)}`:"")} fill={vertices.length>=3?"rgba(37,99,235,.12)":"none"} stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round"/>}
            {placementPoints&&<polygon points={placementPoints} fill="rgba(249,115,22,.22)" stroke="#f97316" strokeWidth="2.5" strokeDasharray="7 4" pointerEvents="none"/>}
            {vertices.map((p,i)=><g key={i} pointerEvents="none"><circle cx={px(p.x)} cy={py(p.y)} r="5" fill="#f97316" stroke="white" strokeWidth="1.5"/><text x={px(p.x)+7} y={py(p.y)-8} fontSize="11" fill="currentColor">{String.fromCharCode(65+(i%26))}</text></g>)}
          </svg>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">{T("Area","ক্ষেত্রফল")}</p><p className="font-semibold">{analysis.valid?fmt(analysis.area):"—"} {unit==="m"?"m²":"ft²"}</p></div>
          <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">{T("Perimeter","পরিসীমা")}</p><p className="font-semibold">{analysis.valid?fmt(analysis.perimeter):"—"} {unit}</p></div>
          <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">{T("Decimal","শতাংশ")}</p><p className="font-semibold">{analysis.valid?fmt(areaM2*10.7639/435.6):"—"}</p></div>
          <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">{T("Katha","কাঠা")}</p><p className="font-semibold">{analysis.valid?fmt(areaM2*10.7639/720):"—"}</p></div>
        </div>
        {analysis.errors.length>0&&<div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{analysis.errors.map(e=><p key={e}>{T(e,e==="Add at least three vertices."?"কমপক্ষে তিনটি কোণ যোগ করুন।":e==="Duplicate vertices are not allowed."?"একই স্থানাঙ্ক একাধিকবার দেওয়া যাবে না।":"জমির সীমানা পরস্পরকে অতিক্রম বা স্পর্শ করছে। কোণগুলোর ক্রম ঠিক করুন।")}</p>)}</div>}
        {analysis.valid&&<p className="text-xs text-muted-foreground">{T("Converted area","রূপান্তরিত ক্ষেত্রফল")}: {fmt(areaM2,3)} m² · {fmt(areaM2*10.7639,2)} ft² · {fmt(perimeterM,2)} m</p>}
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label className="text-xs">X ({unit})</Label><Input type="number" value={draft.x} onChange={e=>setDraft(v=>({...v,x:e.target.value}))} placeholder="Easting / X"/></div>
          <div className="space-y-1"><Label className="text-xs">Y ({unit})</Label><Input type="number" value={draft.y} onChange={e=>setDraft(v=>({...v,y:e.target.value}))} placeholder="Northing / Y"/></div>
        </div>
        <div className="flex gap-2"><Button size="sm" onClick={add} className="flex-1"><Plus className="h-4 w-4 mr-1"/>{T("Add vertex","কোণ যোগ")}</Button><Button size="sm" variant="outline" onClick={()=>setVertices([])}><RotateCcw className="h-4 w-4"/></Button></div>
        <div className="max-h-64 overflow-auto space-y-2">
          {vertices.map((p,i)=><div key={i} className="grid grid-cols-[24px_1fr_1fr_28px] gap-1 items-center"><span className="text-xs font-semibold">{String.fromCharCode(65+(i%26))}</span><Input aria-label={`Vertex ${i+1} X`} type="number" step="0.001" value={p.x} onChange={e=>{const x=Number(e.target.value);setVertices(v=>v.map((q,j)=>j===i?{...q,x}:q));}}/><Input aria-label={`Vertex ${i+1} Y`} type="number" step="0.001" value={p.y} onChange={e=>{const y=Number(e.target.value);setVertices(v=>v.map((q,j)=>j===i?{...q,y}:q));}}/><Button size="icon" variant="ghost" aria-label={T("Remove vertex","কোণ মুছুন")} onClick={()=>setVertices(v=>v.filter((_,j)=>j!==i))}><Trash2 className="h-4 w-4 text-destructive"/></Button></div>)}
        </div>
        <div className="border-t pt-3 space-y-2">
          <div><h4 className="text-sm font-semibold">{T("Building Placement & Setback","ভবন স্থাপন ও সেটব্যাক")}</h4><p className="text-[11px] text-muted-foreground">{T("Find a rectangular footprint that fits inside the plot boundary.","জমির সীমানার ভেতরে মানানসই আয়তাকার ভবনের অবস্থান খুঁজুন।")}</p></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label className="text-[11px]">{T("Width","প্রস্থ")} ({unit})</Label><Input aria-label={T("Building width","ভবনের প্রস্থ")} type="number" min="0.1" step="0.1" value={building.width} onChange={e=>{setBuilding(v=>({...v,width:e.target.value}));setPlacement(null);}}/></div>
            <div className="space-y-1"><Label className="text-[11px]">{T("Depth","দৈর্ঘ্য")} ({unit})</Label><Input aria-label={T("Building depth","ভবনের দৈর্ঘ্য")} type="number" min="0.1" step="0.1" value={building.depth} onChange={e=>{setBuilding(v=>({...v,depth:e.target.value}));setPlacement(null);}}/></div>
            <div className="space-y-1"><Label className="text-[11px]">{T("Setback","সেটব্যাক")} ({unit})</Label><Input aria-label={T("Required setback","প্রয়োজনীয় সেটব্যাক")} type="number" min="0" step="0.1" value={building.setback} onChange={e=>{setBuilding(v=>({...v,setback:e.target.value}));setPlacement(null);}}/></div>
          </div>
          <Button className="w-full" onClick={calculatePlacement} disabled={!analysis.valid}>{T("Find suitable placement","ভবনের উপযুক্ত অবস্থান খুঁজুন")}</Button>
          {placement?.placement&&<div role="status" className="rounded-md bg-muted/60 p-2 text-xs space-y-1"><p className="font-semibold text-green-700">{T("Suitable footprint found","উপযুক্ত ভবনের অবস্থান পাওয়া গেছে")}</p><p>{T("Footprint area","ভবনের ক্ষেত্রফল")}: {fmt(placement.placement.area)} {unit==="m"?"m²":"ft²"}</p><p>{T("Rotation","ঘূর্ণন")}: {placement.placement.angleDegrees}°</p><p>{T("Center","কেন্দ্র")}: X {fmt(placement.placement.center.x)}, Y {fmt(placement.placement.center.y)}</p><p>{T("Checked positions","পরীক্ষিত অবস্থান")}: {placement.candidatesChecked.toLocaleString()}</p></div>}
          {placement&&!placement.placement&&<p role="alert" className="text-xs text-destructive">{T(placement.reason||"No suitable placement found.","উপযুক্ত অবস্থান পাওয়া যায়নি।")}</p>}
          <p className="text-[10px] text-muted-foreground">{T("Preliminary geometric fit only. Confirm statutory setbacks, road access, easements, orientation, soil conditions and local building rules before design approval.","এটি প্রাথমিক জ্যামিতিক যাচাই। অনুমোদনের আগে বিধিবদ্ধ সেটব্যাক, রাস্তা, ইজমেন্ট, দিক, মাটির অবস্থা ও স্থানীয় বিল্ডিং বিধিমালা যাচাই করুন।")}</p>
        </div>
        <Button className="w-full" variant="outline" onClick={exportDxf} disabled={!analysis.valid}><Download className="h-4 w-4 mr-1"/>{T("Export boundary DXF","সীমানা DXF এক্সপোর্ট")}</Button>
        <p className="text-[11px] text-muted-foreground">{T("Coordinates must be in boundary order and use one consistent local coordinate system. This is a 2D plot boundary tool, not a cadastral/legal survey certification.","স্থানাঙ্কগুলো সীমানার ধারাবাহিক ক্রমে এবং একই স্থানীয় কো-অর্ডিনেট সিস্টেমে দিতে হবে। এটি 2D জমির সীমানা টুল, আইনি/ক্যাডাস্ট্রাল জরিপের সনদ নয়।")}</p>
      </div>
    </div>
  </Card>;
}
