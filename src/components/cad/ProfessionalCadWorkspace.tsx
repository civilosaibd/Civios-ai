import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CAD_COMMANDS, DEFAULT_CAD_GRID, normalizeCommand,
  type CadToolId, type CadGridSettings,
} from "@/lib/cad2d/professional-model";
import {
  createEmptyDocument, normalizeRect, snapToGrid, translateEntity, rotateEntity, mirrorEntity, entityBounds, type CadEntity, type CadDocument, type Point2D,
} from "@/lib/cad2d/geometry";
import { Download, Grid3X3, MousePointer2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Layers3, Wrench } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type DraftEntity = CadEntity & { id: string; layerId: string };
type View = { x: number; y: number; scale: number };
const palette: { id: CadToolId; label: string; group: string }[] = [
  { id: "select", label: "Select", group: "Common" },
  { id: "line", label: "Line", group: "Draw" }, { id: "polyline", label: "Polyline", group: "Draw" },
  { id: "rectangle", label: "Rectangle", group: "Draw" }, { id: "circle", label: "Circle", group: "Draw" },
  { id: "arc", label: "Arc", group: "Draw" }, { id: "ellipse", label: "Ellipse", group: "Draw" },
  { id: "polygon", label: "Polygon", group: "Draw" }, { id: "hatch", label: "Hatch", group: "Draw" },
  { id: "move", label: "Move", group: "Modify" }, { id: "copy", label: "Copy", group: "Modify" }, { id: "erase", label: "Erase", group: "Modify" },
  { id: "rotate", label: "Rotate", group: "Modify" }, { id: "mirror", label: "Mirror", group: "Modify" },
  { id: "offset", label: "Offset", group: "Modify" }, { id: "trim", label: "Trim", group: "Modify" },
  { id: "extend", label: "Extend", group: "Modify" }, { id: "fillet", label: "Fillet", group: "Modify" },
  { id: "dimension", label: "Dimension", group: "Annotate" }, { id: "text", label: "Text", group: "Annotate" },
  { id: "wall", label: "Wall", group: "Architecture" }, { id: "door", label: "Door", group: "Architecture" },
  { id: "window", label: "Window", group: "Architecture" }, { id: "column", label: "Column", group: "Architecture" },
];

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `cad-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ProfessionalCadWorkspace() {
  const [doc, setDoc] = useState<CadDocument>(() => {
    if (typeof window === "undefined") return createEmptyDocument("ft");
    try {
      const saved = window.localStorage.getItem("civilos-cad-document-v1");
      if (!saved) return createEmptyDocument("ft");
      const parsed = JSON.parse(saved) as CadDocument;
      if (parsed?.version === 1 && Array.isArray(parsed.entities) && Array.isArray(parsed.layers) && parsed.layers.length > 0) return parsed;
    } catch {
      // Ignore invalid or unavailable local storage and start with an empty drawing.
    }
    return createEmptyDocument("ft");
  });
  const [tool, setTool] = useState<CadToolId>("select");
  const [grid, setGrid] = useState<CadGridSettings>(DEFAULT_CAD_GRID);
  const [view, setView] = useState<View>({ x: 60, y: 50, scale: 1 });
  const [start, setStart] = useState<Point2D | null>(null);
  const [cursor, setCursor] = useState<Point2D | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<CadDocument[]>([]);
  const [future, setFuture] = useState<CadDocument[]>([]);
  const [layerName, setLayerName] = useState("0");
  const [toolsOpen, setToolsOpen] = useState(false);
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);
  const activeLayer = doc.layers.find((layer) => layer.name === layerName) ?? doc.layers[0];

  useEffect(() => {
    try {
      window.localStorage.setItem("civilos-cad-document-v1", JSON.stringify(doc));
    } catch {
      toast.error("Could not auto-save this drawing locally. Please export a JSON backup.");
    }
  }, [doc]);

  const commit = useCallback((next: CadDocument) => {
    setHistory((h) => [...h.slice(-99), doc]);
    setFuture([]);
    setDoc({ ...next });
  }, [doc]);

  const toWorld = (event: ReactPointerEvent<SVGSVGElement>): Point2D => {
    const rect = event.currentTarget.getBoundingClientRect();
    let p = { x: (event.clientX - rect.left - view.x) / view.scale, y: (event.clientY - rect.top - view.y) / view.scale };
    if (grid.snapEnabled) p = snapToGrid(p, grid.snapSpacing);
    // Ortho constrains the second point to the dominant axis from the first point.
    if (grid.ortho && start && tool !== "select" && tool !== "erase") {
      const dx = p.x - start.x, dy = p.y - start.y;
      p = Math.abs(dx) >= Math.abs(dy)
        ? { ...p, y: start.y }
        : { ...p, x: start.x };
    }
    return p;
  };
  const distanceToSegment = (p: Point2D, a: Point2D, b: Point2D) => {
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const findHit = (p: Point2D) => [...doc.entities].reverse().find((e) => {
    if (e.type === "line" || e.type === "wall") return distanceToSegment(p, e.start, e.end) < 7 / view.scale;
    if (e.type === "rectangle") return p.x>=e.min.x-4/view.scale && p.x<=e.max.x+4/view.scale && p.y>=e.min.y-4/view.scale && p.y<=e.max.y+4/view.scale && (Math.abs(p.x-e.min.x)<7/view.scale || Math.abs(p.x-e.max.x)<7/view.scale || Math.abs(p.y-e.min.y)<7/view.scale || Math.abs(p.y-e.max.y)<7/view.scale);
    if (e.type === "circle") return Math.abs(Math.hypot(p.x-e.center.x,p.y-e.center.y)-e.radius)<7/view.scale;
    if (e.type === "ellipse") { const t=Math.atan2((p.y-e.center.y)/Math.max(e.ry,.001),(p.x-e.center.x)/Math.max(e.rx,.001)); const q={x:e.center.x+e.rx*Math.cos(t),y:e.center.y+e.ry*Math.sin(t)}; return Math.hypot(p.x-q.x,p.y-q.y)<7/view.scale; }
    if (e.type === "polyline") {
      const segments = e.points.slice(1).map((point, index) => [e.points[index], point] as const);
      if (e.closed && e.points.length > 2) segments.push([e.points[e.points.length - 1], e.points[0]]);
      return segments.some(([a, b]) => distanceToSegment(p, a, b) < 7 / view.scale);
    }
    return false;
  })?.id;
  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const p = toWorld(event);
    if (tool === "select") { const id=findHit(p); setSelected(id ? [id] : []); return; }
    if (tool === "move" || tool === "copy" || tool === "erase" || tool === "rotate" || tool === "mirror") {
      const id=findHit(p); if (!id) { toast.info("Click an existing object first."); return; }
      if (tool === "erase") { commit({ ...doc, entities: doc.entities.filter((e)=>e.id!==id) }); setSelected([]); return; }
      if (tool === "rotate") {
        const entity=doc.entities.find((e)=>e.id===id);
        if (entity) {
          const bounds=entityBounds(entity);
          const pivot={x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2};
          commit({...doc,entities:doc.entities.map((e)=>e.id===id?rotateEntity(e,Math.PI/2,pivot):e)});
          setSelected([id]);
          toast.success("Rotated 90°.");
        }
        return;
      }
      if (tool === "mirror") {
        const entity = doc.entities.find((e) => e.id === id);
        if (entity) {
          const bounds = entityBounds(entity);
          const axisX = (bounds.min.x + bounds.max.x) / 2;
          commit({ ...doc, entities: doc.entities.map((e) => e.id === id ? mirrorEntity(e, axisX) : e) });
          setSelected([id]);
          toast.success("Mirrored across the object's vertical centerline.");
        }
        return;
      }
      setSelected([id]); setStart(p); return;
    }
    if (!start) { setStart(p); setCursor(p); return; }
    const a=start, b=p;
    let entity: CadEntity | null = null;
    const base={ id:makeId(), layerId:activeLayer.id };
    if (tool==="line") entity={...base,type:"line",start:a,end:b};
    else if (tool==="rectangle" || tool==="wall") {
      const r=normalizeRect(a,b);
      entity=tool==="wall" ? {...base,type:"wall",start:a,end:b,thickness:0.5} : {...base,type:"rectangle",...r};
    } else if (tool==="circle") entity={...base,type:"circle",center:a,radius:Math.hypot(b.x-a.x,b.y-a.y)};
    else if (tool==="polyline") entity={...base,type:"polyline",points:[a,b],closed:false};
    else if (tool==="polygon") {
      const radius=Math.hypot(b.x-a.x,b.y-a.y);
      if (radius > 0) {
        const sides=6, angle=Math.atan2(b.y-a.y,b.x-a.x);
        const points=Array.from({length:sides},(_,i)=>({x:a.x+radius*Math.cos(angle+i*2*Math.PI/sides),y:a.y+radius*Math.sin(angle+i*2*Math.PI/sides)}));
        entity={...base,type:"polyline",points,closed:true};
      }
    }
    else if (tool==="arc") entity={...base,type:"arc",center:a,radius:Math.hypot(b.x-a.x,b.y-a.y),startAngle:0,endAngle:Math.PI*1.5};
    else if (tool==="ellipse") entity={...base,type:"ellipse",center:a,rx:Math.abs(b.x-a.x),ry:Math.abs(b.y-a.y)};
    if (entity) commit({...doc,entities:[...doc.entities,entity]});
    setStart(null); setCursor(null);
  };
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const p=toWorld(event); setCursor(p);
    if (start && (tool==="move" || tool==="copy") && selected.length) {
      // Preview is shown by cursor; commit on pointer-up to keep history deterministic.
    }
  };
  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!start || !selected.length || (tool!=="move" && tool!=="copy")) return;
    const end=toWorld(event), dx=end.x-start.x, dy=end.y-start.y;
    const id=selected[0], entity=doc.entities.find((e)=>e.id===id);
    if (entity && (dx!==0 || dy!==0)) {
      const moved = translateEntity(entity, dx, dy);
      const entities=tool==="copy" ? [...doc.entities,{...moved,id:makeId()} as CadEntity] : doc.entities.map((e)=>e.id===id?moved as CadEntity:e);
      commit({...doc,entities});
    }
    setStart(null);
  };

  const runCommand = () => {
    const raw=command.trim(); if(!raw) return;
    if (/^(UNDO|U)$/i.test(raw)) { undo(); setCommand(""); return; }
    if (/^(REDO|RE)$/i.test(raw)) { redo(); setCommand(""); return; }
    if (/^(ERASE|DELETE|E)$/i.test(raw)) { setTool("erase"); setCommand(""); return; }
    const def=normalizeCommand(raw);
    if (!def) { toast.error(`Unknown command: ${raw.split(/\\s+/)[0]}`); return; }
    setTool(def.id);
    setCommand("");
  };
  const undo = () => { if(!history.length)return; setFuture((f)=>[doc,...f]);setDoc(history[history.length-1]);setHistory(history.slice(0,-1)); };
  const redo = () => { if(!future.length)return; setHistory((h)=>[...h,doc]);setDoc(future[0]);setFuture(future.slice(1)); };
  const addLayer = () => {
    const name=window.prompt("New layer name"); if(!name?.trim())return;
    if(doc.layers.some((l)=>l.name.toLowerCase()===name.trim().toLowerCase())) {toast.error("Layer name already exists.");return;}
    const layer={id:makeId(),name:name.trim(),visible:true,color:["#2563eb","#dc2626","#059669","#9333ea"][doc.layers.length%4],lineWeight:1};
    commit({...doc,layers:[...doc.layers,layer]});setLayerName(layer.name);
  };
  const exportFile = (kind:"json"|"svg") => {
    const content=kind==="json" ? JSON.stringify(doc,null,2) : svgRef.current?.outerHTML ?? "";
    const blob=new Blob([content],{type:kind==="json"?"application/json":"image/svg+xml"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`civilos-drawing.${kind}`;a.click();URL.revokeObjectURL(url);
  };
  const groups=useMemo(()=>Array.from(new Set(palette.map((p)=>p.group))),[]);
  const selectTool = (id: CadToolId) => { setTool(id); setStart(null); setCursor(null); setToolsOpen(false); };
  const ToolPalette = (
    <div className="space-y-3">
      <div><div className="mb-2 flex items-center gap-2"><Wrench className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">Tools</h3></div><p className="mb-2 text-[11px] text-muted-foreground">Choose a tool, then click points on the drawing canvas.</p></div>
      {groups.map((group)=><div key={group}><p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group === "Common" ? "Common tools" : group}</p><div className="grid grid-cols-2 gap-1">{palette.filter((p)=>p.group===group).map((p)=><Button key={p.id} size="sm" variant={tool===p.id?"default":"outline"} className="h-9 min-w-0 justify-start px-2 text-xs" onClick={()=>selectTool(p.id)} title={p.label} aria-pressed={tool===p.id}><MousePointer2 className="mr-1 h-3 w-3 shrink-0"/><span className="truncate">{p.label}</span></Button>)}</div></div>)}
    </div>
  );
  const renderEntity = (e: CadEntity) => {
    const layer=doc.layers.find((l)=>l.id===e.layerId); if(layer && !layer.visible)return null;
    const color=selected.includes(e.id)?"#f97316":layer?.color ?? "#111827";
    const common={stroke:color,strokeWidth:selected.includes(e.id)?2.5:1.6,fill:"none" as const,vectorEffect:"non-scaling-stroke" as const};
    if(e.type==="line"||e.type==="wall")return <line key={e.id} x1={e.start.x} y1={e.start.y} x2={e.end.x} y2={e.end.y} {...common} strokeWidth={e.type==="wall"?Math.max(2,e.thickness):common.strokeWidth}/>;
    if(e.type==="rectangle")return <rect key={e.id} x={e.min.x} y={e.min.y} width={e.max.x-e.min.x} height={e.max.y-e.min.y} {...common}/>;
    if(e.type==="circle")return <circle key={e.id} cx={e.center.x} cy={e.center.y} r={e.radius} {...common}/>;
    if(e.type==="ellipse")return <ellipse key={e.id} cx={e.center.x} cy={e.center.y} rx={e.rx} ry={e.ry} {...common}/>;
    if(e.type==="polyline")return <polyline key={e.id} points={e.points.map((p)=>`${p.x},${p.y}`).join(" ")} {...common}/>;
    if(e.type==="arc")return <path key={e.id} d={`M ${e.center.x+e.radius*Math.cos(e.startAngle)} ${e.center.y+e.radius*Math.sin(e.startAngle)} A ${e.radius} ${e.radius} 0 1 1 ${e.center.x+e.radius*Math.cos(e.endAngle)} ${e.center.y+e.radius*Math.sin(e.endAngle)}`} {...common}/>;
    return null;
  };

  return <section className="space-y-3 rounded-xl border bg-card p-3 md:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-semibold">CivilOS Professional 2D Drafting</h2><p className="text-xs text-muted-foreground">Interactive drafting workspace · drawing units: feet · local auto-save enabled</p></div>
      <div className="flex flex-wrap items-center gap-1">
        {isMobile && <Sheet open={toolsOpen} onOpenChange={setToolsOpen}><SheetTrigger asChild><Button size="sm" variant="default"><Wrench className="mr-1 h-4 w-4"/>Tools</Button></SheetTrigger><SheetContent side="bottom" className="max-h-[82dvh] overflow-y-auto"><SheetHeader><SheetTitle>2D Drafting Tools</SheetTitle></SheetHeader><div className="mt-4">{ToolPalette}</div></SheetContent></Sheet>}
        <Button size="sm" variant="outline" onClick={undo} disabled={!history.length}><Undo2 className="mr-1 h-4 w-4"/>Undo</Button>
        <Button size="sm" variant="outline" onClick={redo} disabled={!future.length}><Redo2 className="mr-1 h-4 w-4"/>Redo</Button>
        <Button size="sm" variant="outline" onClick={()=>setGrid((g)=>({...g,enabled:!g.enabled}))}><Grid3X3 className="mr-1 h-4 w-4"/>{grid.enabled?"Grid on":"Grid off"}</Button>
        <Button size="sm" variant="outline" onClick={()=>setView({x:60,y:50,scale:1})}><Maximize2 className="mr-1 h-4 w-4"/>Fit</Button>
        <Button size="sm" variant="outline" onClick={()=>setView((v)=>({...v,scale:Math.min(8,v.scale*1.25)}))}><ZoomIn className="h-4 w-4"/></Button>
        <Button size="sm" variant="outline" onClick={()=>setView((v)=>({...v,scale:Math.max(.2,v.scale/1.25)}))}><ZoomOut className="h-4 w-4"/></Button>
        <Button size="sm" variant="outline" onClick={()=>exportFile("svg")}><Download className="mr-1 h-4 w-4"/>SVG</Button>
        <Button size="sm" variant="outline" onClick={()=>exportFile("json")}>Save JSON</Button>
      </div>
    </div>
    <div className="grid min-w-0 gap-3 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_240px]">
      <aside className="hidden space-y-3 rounded-lg border p-3 md:block xl:max-h-[76vh] xl:overflow-y-auto">{ToolPalette}</aside>
      <div className="min-w-0 overflow-hidden rounded-lg border bg-white xl:col-start-2">
        <svg ref={svgRef} viewBox="0 0 1000 640" className="h-[min(62dvh,640px)] min-h-[340px] w-full touch-none sm:h-[560px] xl:h-[min(76vh,760px)]" role="img" aria-label="2D CAD drafting canvas" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
          <defs><pattern id="cad-grid-small" width={10*view.scale} height={10*view.scale} patternUnits="userSpaceOnUse" x={view.x% (10*view.scale)} y={view.y%(10*view.scale)}><path d={`M ${10*view.scale} 0 L 0 0 0 ${10*view.scale}`} fill="none" stroke="#e5e7eb" strokeWidth=".7"/></pattern></defs>
          {grid.enabled&&<rect width="1000" height="640" fill="url(#cad-grid-small)"/>}
          <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>{doc.entities.map(renderEntity)}{start&&cursor&&tool!=="select"&&tool!=="move"&&tool!=="copy"&&<line x1={start.x} y1={start.y} x2={cursor.x} y2={cursor.y} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1/view.scale}/>}</g>
        </svg>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><span>Tool: {tool.toUpperCase()} · Objects: {doc.entities.length} · Selected: {selected.length}</span><span>Cursor: {cursor?cursor.x.toFixed(2)+", "+cursor.y.toFixed(2):"—"}</span></div>
      </div>
      <aside className="min-w-0 space-y-3 rounded-lg border p-3 md:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1">
        <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4"/>Layers</h3><div className="space-y-1">{doc.layers.map((l)=><div key={l.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={l.visible} onChange={(e)=>commit({...doc,layers:doc.layers.map((x)=>x.id===l.id?{...x,visible:e.target.checked}:x)})}/><span className="h-3 w-3 rounded-sm border" style={{background:l.color}}/><button className="truncate text-left" onClick={()=>setLayerName(l.name)}>{l.name}</button><span className="ml-auto text-muted-foreground">{doc.entities.filter((e)=>e.layerId===l.id).length}</span></div>)}</div><Button size="sm" variant="outline" className="mt-2 w-full" onClick={addLayer}>+ New layer</Button></div>
        <div><label className="mb-1 block text-xs font-medium">Active layer</label><select className="w-full rounded-md border bg-background p-2 text-sm" value={layerName} onChange={(e)=>setLayerName(e.target.value)}>{doc.layers.map((l)=><option key={l.id}>{l.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium">Grid / snap spacing</label><Input type="number" min=".01" step=".25" value={grid.snapSpacing} onChange={(e)=>setGrid((g)=>({...g,snapSpacing:Math.max(.01,Number(e.target.value)||1)}))}/><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.snapEnabled} onChange={(e)=>setGrid((g)=>({...g,snapEnabled:e.target.checked}))}/> Snap to grid</label><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.ortho} onChange={(e)=>setGrid((g)=>({...g,ortho:e.target.checked}))}/> Ortho mode (setting)</label></div>
        <div><p className="mb-1 text-xs font-medium">Command line</p><form className="flex gap-1" onSubmit={(e)=>{e.preventDefault();runCommand();}}><Input value={command} onChange={(e)=>setCommand(e.target.value)} placeholder="LINE / RECTANG / CIRCLE"/><Button size="sm" type="submit">Run</Button></form><p className="mt-1 text-[10px] text-muted-foreground">Command aliases select the corresponding tool; geometry handlers are enabled for the initial draw tools.</p></div>
      </aside>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">Current working tools: select, line, rectangle, circle, arc, wall, polygon, move, copy, rotate, mirror and erase. Other tools are organized for the planned CAD workflow but are not yet implemented. Drawings stay in this browser session unless exported as SVG or JSON.</p>
  </section>;
}
