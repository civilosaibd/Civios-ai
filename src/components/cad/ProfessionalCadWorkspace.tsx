import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CAD_COMMANDS, DEFAULT_CAD_GRID, normalizeCommand,
  type CadToolId, type CadGridSettings,
} from "@/lib/cad2d/professional-model";
import {
  createEmptyDocument, normalizeRect, snapToGrid, translateEntity, rotateEntity, mirrorEntity, entityBounds, offsetEntity, trimLineAtPoint, extendLineToBoundary, parseCadCommand, type CadEntity, type CadDocument, type Point2D,
} from "@/lib/cad2d/geometry";
import { Download, Grid3X3, MousePointer2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Layers3, Wrench, DraftingCompass, Ruler, Shapes, House, Save, FileJson, Eye, CheckCircle2, Command, Move, Hand, Upload } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type DraftEntity = CadEntity & { id: string; layerId: string };
type View = { x: number; y: number; scale: number };
const palette: { id: CadToolId; label: string; group: string }[] = [
  { id: "select", label: "Select", group: "Common" }, { id: "measure", label: "Measure", group: "Common" },
  { id: "line", label: "Line", group: "Draw" }, { id: "polyline", label: "Polyline", group: "Draw" },
  { id: "rectangle", label: "Rectangle", group: "Draw" }, { id: "circle", label: "Circle", group: "Draw" },
  { id: "arc", label: "Arc", group: "Draw" }, { id: "ellipse", label: "Ellipse", group: "Draw" },
  { id: "polygon", label: "Polygon", group: "Draw" }, { id: "hatch", label: "Hatch", group: "Draw" },
  { id: "move", label: "Move", group: "Modify" }, { id: "copy", label: "Copy", group: "Modify" }, { id: "erase", label: "Erase", group: "Modify" },
  { id: "rotate", label: "Rotate", group: "Modify" }, { id: "mirror", label: "Mirror", group: "Modify" },
  { id: "offset", label: "Offset", group: "Modify" }, { id: "trim", label: "Trim", group: "Modify" },
  { id: "extend", label: "Extend", group: "Modify" }, { id: "fillet", label: "Fillet", group: "Modify" },
  { id: "dimension", label: "Dimension", group: "Annotate" }, { id: "text", label: "Text", group: "Annotate" },
  { id: "wall", label: "Wall", group: "Architecture" }, { id: "beam", label: "Beam", group: "Architecture" }, { id: "door", label: "Door", group: "Architecture" },
  { id: "window", label: "Window", group: "Architecture" }, { id: "column", label: "Column", group: "Architecture" }, { id: "stair", label: "Stair", group: "Architecture" },
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
  const [arcStart, setArcStart] = useState<{ center: Point2D; radius: number; startAngle: number } | null>(null);
  const [polylinePoints, setPolylinePoints] = useState<Point2D[]>([]);
  const [modifyTargetId, setModifyTargetId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point2D | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionWindow, setSelectionWindow] = useState<{ start: Point2D; end: Point2D } | null>(null);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<CadDocument[]>([]);
  const [future, setFuture] = useState<CadDocument[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "error">("saved");
  const [layerName, setLayerName] = useState("0");
  const [toolsOpen, setToolsOpen] = useState(false);
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ clientX: number; clientY: number; viewX: number; viewY: number } | null>(null);
  const activeLayer = doc.layers.find((layer) => layer.name === layerName) ?? doc.layers[0];

  useEffect(() => {
    try {
      window.localStorage.setItem("civilos-cad-document-v1", JSON.stringify(doc));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [doc]);

  const commit = useCallback((next: CadDocument) => {
    setHistory((h) => [...h.slice(-99), doc]);
    setFuture([]);
    setDoc({ ...next });
  }, [doc]);

  const toWorld = (event: ReactPointerEvent<SVGSVGElement>): Point2D => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Convert CSS pixels into SVG viewBox coordinates before applying the world transform.
    const canvasX = (event.clientX - rect.left) * (1000 / Math.max(rect.width, 1));
    const canvasY = (event.clientY - rect.top) * (640 / Math.max(rect.height, 1));
    let p = { x: (canvasX - view.x) / view.scale, y: (canvasY - view.y) / view.scale };
    if (grid.snapEnabled) p = snapToGrid(p, grid.snapSpacing);
    // Ortho uses the previous polyline vertex, or the first point for other tools.
    const orthoAnchor = tool === "polyline" && polylinePoints.length
      ? polylinePoints[polylinePoints.length - 1]
      : start;
    if (grid.ortho && orthoAnchor && tool !== "select" && tool !== "erase") {
      const dx = p.x - orthoAnchor.x, dy = p.y - orthoAnchor.y;
      p = Math.abs(dx) >= Math.abs(dy)
        ? { ...p, y: orthoAnchor.y }
        : { ...p, x: orthoAnchor.x };
    }
    return p;
  };
  const distanceToSegment = (p: Point2D, a: Point2D, b: Point2D) => {
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const findHit = (p: Point2D) => [...doc.entities].reverse().filter((e) => doc.layers.find((layer) => layer.id === e.layerId)?.visible !== false).find((e) => {
    if (e.type === "line" || e.type === "wall") return distanceToSegment(p, e.start, e.end) < 7 / view.scale;
    if (e.type === "rectangle") return p.x>=e.min.x-4/view.scale && p.x<=e.max.x+4/view.scale && p.y>=e.min.y-4/view.scale && p.y<=e.max.y+4/view.scale && (Math.abs(p.x-e.min.x)<7/view.scale || Math.abs(p.x-e.max.x)<7/view.scale || Math.abs(p.y-e.min.y)<7/view.scale || Math.abs(p.y-e.max.y)<7/view.scale);
    if (e.type === "circle") return Math.abs(Math.hypot(p.x-e.center.x,p.y-e.center.y)-e.radius)<7/view.scale;
    if (e.type === "arc") {
      const radius = Math.hypot(p.x - e.center.x, p.y - e.center.y);
      if (Math.abs(radius - e.radius) >= 7 / view.scale) return false;
      const normalizeAngle = (angle: number) => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const angle = normalizeAngle(Math.atan2(p.y - e.center.y, p.x - e.center.x));
      const startAngle = normalizeAngle(e.startAngle), endAngle = normalizeAngle(e.endAngle);
      return startAngle <= endAngle ? angle >= startAngle && angle <= endAngle : angle >= startAngle || angle <= endAngle;
    }
    if (e.type === "text") { const bounds = entityBounds(e); return p.x >= bounds.min.x && p.x <= bounds.max.x && p.y >= bounds.min.y && p.y <= bounds.max.y; }
    if (e.type === "ellipse") { const t=Math.atan2((p.y-e.center.y)/Math.max(e.ry,.001),(p.x-e.center.x)/Math.max(e.rx,.001)); const q={x:e.center.x+e.rx*Math.cos(t),y:e.center.y+e.ry*Math.sin(t)}; return Math.hypot(p.x-q.x,p.y-q.y)<7/view.scale; }
    if (e.type === "polyline") {
      const segments = e.points.slice(1).map((point, index) => [e.points[index], point] as const);
      if (e.closed && e.points.length > 2) segments.push([e.points[e.points.length - 1], e.points[0]]);
      return segments.some(([a, b]) => distanceToSegment(p, a, b) < 7 / view.scale);
    }
    return false;
  })?.id;
  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    // Middle/right mouse drag pans the drawing without changing the active tool.
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      panRef.current = { clientX: event.clientX, clientY: event.clientY, viewX: view.x, viewY: view.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const p = toWorld(event);
    if (tool === "polyline") {
      if (!start) {
        setStart(p);
        setPolylinePoints([p]);
      } else {
        setPolylinePoints((points) => [...points, p]);
      }
      setCursor(p);
      return;
    }
    if (tool === "offset") {
      const id = findHit(p);
      const entity = doc.entities.find((item) => item.id === id);
      if (!entity) { toast.info("Click the object you want to offset."); return; }
      const raw = window.prompt("Offset distance (positive = inward for closed shapes; line side follows its direction):", "1");
      if (raw === null) return;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount === 0) { toast.error("Enter a finite, non-zero offset distance."); return; }
      try {
        const result = offsetEntity(entity, amount);
        commit({ ...doc, entities: [...doc.entities, { ...result, id: makeId() }] });
        toast.success("Offset object created.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not offset this object.");
      }
      return;
    }
    if (tool === "trim") {
      if (!modifyTargetId) {
        const id = findHit(p);
        const entity = doc.entities.find((item) => item.id === id);
        if (!entity || (entity.type !== "line" && entity.type !== "wall")) { toast.info("TRIM currently supports straight lines and walls. Click one first."); return; }
        setModifyTargetId(id);
        toast.info("Click the point on the selected line where it should be trimmed.");
        return;
      }
      const entity = doc.entities.find((item) => item.id === modifyTargetId);
      if (!entity || (entity.type !== "line" && entity.type !== "wall")) { setModifyTargetId(null); return; }
      const dx = entity.end.x - entity.start.x, dy = entity.end.y - entity.start.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - entity.start.x) * dx + (p.y - entity.start.y) * dy) / lengthSquared)) : 0;
      const projected = { x: entity.start.x + t * dx, y: entity.start.y + t * dy };
      try {
        const trimmed = trimLineAtPoint(entity, projected);
        commit({ ...doc, entities: doc.entities.map((item) => item.id === entity.id ? trimmed : item) });
        setSelected([entity.id]); setModifyTargetId(null);
        toast.success("Line trimmed.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not trim this line.");
      }
      return;
    }
    if (tool === "extend") {
      if (!modifyTargetId) {
        const id = findHit(p);
        const entity = doc.entities.find((item) => item.id === id);
        if (!entity || (entity.type !== "line" && entity.type !== "wall")) { toast.info("EXTEND currently supports straight lines and walls. Click the line to extend first."); return; }
        setModifyTargetId(id);
        toast.info("Now click a straight boundary line or wall.");
        return;
      }
      const target = doc.entities.find((item) => item.id === modifyTargetId);
      const boundaryId = findHit(p);
      const boundary = doc.entities.find((item) => item.id === boundaryId);
      if (!target || (target.type !== "line" && target.type !== "wall") || !boundary || (boundary.type !== "line" && boundary.type !== "wall")) {
        toast.info("Click a straight boundary line or wall.");
        return;
      }
      try {
        const extended = extendLineToBoundary(target, boundary);
        commit({ ...doc, entities: doc.entities.map((item) => item.id === target.id ? extended : item) });
        setSelected([target.id]); setModifyTargetId(null);
        toast.success("Line extended to boundary.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not extend this line.");
        setModifyTargetId(null);
      }
      return;
    }
    if (tool === "arc") {
      if (!start) {
        setStart(p);
        setCursor(p);
        setArcStart(null);
        toast.info("Choose the arc start point.");
        return;
      }
      if (!arcStart) {
        const radius = Math.hypot(p.x - start.x, p.y - start.y);
        if (radius <= 1e-8) {
          toast.info("Arc radius must be greater than zero.");
          setStart(null); setCursor(null);
          return;
        }
        setArcStart({ center: start, radius, startAngle: Math.atan2(p.y - start.y, p.x - start.x) });
        setCursor(p);
        toast.info("Choose the arc end point.");
        return;
      }
      const endAngle = Math.atan2(p.y - arcStart.center.y, p.x - arcStart.center.x);
      let sweep = endAngle - arcStart.startAngle;
      while (sweep <= 0) sweep += Math.PI * 2;
      if (sweep < 1e-6 || Math.abs(sweep - Math.PI * 2) < 1e-6) {
        toast.info("Choose a different arc end point.");
        return;
      }
      const entity: CadEntity = { id: makeId(), layerId: activeLayer.id, type: "arc", center: arcStart.center, radius: arcStart.radius, startAngle: arcStart.startAngle, endAngle: arcStart.startAngle + sweep };
      commit({ ...doc, entities: [...doc.entities, entity] });
      setSelected([entity.id]);
      setStart(null); setArcStart(null); setCursor(null);
      toast.success("Arc created from center, start, and end points.");
      return;
    }
    if (tool === "text") {
      const value = window.prompt("Text to place in the drawing:");
      if (value === null || !value.trim()) return;
      const rawHeight = window.prompt(`Text height in ${doc.units}:`, "2.5");
      if (rawHeight === null) return;
      const height = Number(rawHeight);
      if (!Number.isFinite(height) || height <= 0) {
        toast.error("Text height must be a positive finite number.");
        return;
      }
      const entity: CadEntity = { id: makeId(), layerId: activeLayer.id, type: "text", at: p, text: value.trim(), height, rotation: 0 };
      commit({ ...doc, entities: [...doc.entities, entity] });
      setSelected([entity.id]);
      setTool("select");
      toast.success("Text annotation added.");
      return;
    }
    if (tool === "measure") {
      if (!start) {
        setStart(p);
        setCursor(p);
        toast.info("Choose the second point to measure the distance.");
      } else {
        const length = Math.hypot(p.x - start.x, p.y - start.y);
        toast.success(`Distance: ${length.toFixed(3)} ${doc.units}`);
        setStart(null);
        setCursor(p);
      }
      return;
    }
    if (tool === "select") { const id=findHit(p); if (event.shiftKey && id) setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); else setSelected(id ? [id] : []); setStart(p); setCursor(p); setSelectionWindow(null); return; }
    if (tool === "move" || tool === "copy" || tool === "erase" || tool === "rotate" || tool === "mirror") {
      const id=findHit(p); if (!id) { toast.info("Click an existing object first."); return; }
      if (tool === "erase") { const idsToErase = selected.includes(id) ? new Set(selected) : new Set([id]); const remaining = doc.entities.filter((entity) => !idsToErase.has(entity.id)); commit({ ...doc, entities: remaining }); setSelected([]); toast.success(`Erased ${doc.entities.length - remaining.length} object(s).`); return; }
      if (tool === "rotate") {
        const targets = selected.includes(id) ? selected : [id];
        const targetEntities = doc.entities.filter((entity) => targets.includes(entity.id));
        if (targetEntities.length) {
          const bounds = targetEntities.map(entityBounds);
          const minX = Math.min(...bounds.map((item) => item.min.x));
          const minY = Math.min(...bounds.map((item) => item.min.y));
          const maxX = Math.max(...bounds.map((item) => item.max.x));
          const maxY = Math.max(...bounds.map((item) => item.max.y));
          const pivot = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
          const targetSet = new Set(targets);
          commit({ ...doc, entities: doc.entities.map((entity) => targetSet.has(entity.id) ? rotateEntity(entity, Math.PI / 2, pivot) : entity) });
          setSelected(targets);
          toast.success(`Rotated ${targets.length} object(s) 90° around the selection center.`);
        }
        return;
      }
      if (tool === "mirror") {
        const targets = selected.includes(id) ? selected : [id];
        const targetSet = new Set(targets);
        // The clicked world X coordinate defines the vertical mirror axis.
        commit({ ...doc, entities: doc.entities.map((entity) => targetSet.has(entity.id) ? mirrorEntity(entity, p.x) : entity) });
        setSelected(targets);
        toast.success(`Mirrored ${targets.length} object(s) across the clicked vertical axis.`);
        return;
      }
      setSelected((current) => current.includes(id) ? current : [id]); setStart(p); return;
    }
    if (!start) { setStart(p); setCursor(p); return; }
    const a=start, b=p;
    const deltaX = Math.abs(b.x - a.x), deltaY = Math.abs(b.y - a.y);
    if ((tool === "line" || tool === "wall" || tool === "beam") && Math.hypot(deltaX, deltaY) < 1e-8) {
      toast.info("Choose two different points to create a line or wall.");
      setStart(null); setCursor(null);
      return;
    }
    if ((tool === "rectangle" || tool === "column") && (deltaX < 1e-8 || deltaY < 1e-8)) {
      toast.info("This shape needs both a width and a height.");
      setStart(null); setCursor(null);
      return;
    }
    if (tool === "circle" && Math.hypot(deltaX, deltaY) < 1e-8) {
      toast.info("Move from the center point to set a circle radius.");
      setStart(null); setCursor(null);
      return;
    }
    if (tool === "ellipse" && (deltaX < 1e-8 || deltaY < 1e-8)) {
      toast.info("An ellipse needs a non-zero horizontal and vertical radius.");
      setStart(null); setCursor(null);
      return;
    }
    let entity: CadEntity | null = null;
    const base={ id:makeId(), layerId:activeLayer.id };
    if (tool === "dimension") {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= 1e-8) {
        toast.info("Choose two different points to create a dimension.");
        setStart(null); setCursor(null);
        return;
      }
      const offset = Math.max(1.5, length * 0.08);
      const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
      const da = { x: a.x + normal.x * offset, y: a.y + normal.y * offset };
      const db = { x: b.x + normal.x * offset, y: b.y + normal.y * offset };
      const mid = { x: (da.x + db.x) / 2, y: (da.y + db.y) / 2 };
      const dimensionEntities: CadEntity[] = [
        { ...base, id: makeId(), type: "line", start: a, end: da },
        { ...base, id: makeId(), type: "line", start: b, end: db },
        { ...base, id: makeId(), type: "line", start: da, end: db },
        { ...base, id: makeId(), type: "text", at: { x: mid.x, y: mid.y - 0.2 }, text: `${length.toFixed(2)} ${doc.units}`, height: Math.max(0.8, offset * 0.45), rotation: Math.atan2(db.y - da.y, db.x - da.x) },
      ];
      commit({ ...doc, entities: [...doc.entities, ...dimensionEntities] });
      setSelected(dimensionEntities.map((item) => item.id));
      toast.success(`Dimension added: ${length.toFixed(2)} ${doc.units}`);
      setStart(null); setPolylinePoints([]); setCursor(null);
      return;
    }
    if (tool === "stair") {
      const width = Math.abs(b.x - a.x), depth = Math.abs(b.y - a.y);
      if (width <= 1e-8 || depth <= 1e-8) {
        toast.info("A stair footprint needs both a width and a depth.");
        setStart(null); setCursor(null);
        return;
      }
      const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
      const stepCount = Math.max(3, Math.min(16, Math.round(Math.max(width, depth) / Math.max(Math.min(width, depth) / 5, 1))));
      const stairEntities: CadEntity[] = [
        { ...base, id: makeId(), type: "line", start: { x: left, y: top }, end: { x: right, y: top } },
        { ...base, id: makeId(), type: "line", start: { x: right, y: top }, end: { x: right, y: bottom } },
        { ...base, id: makeId(), type: "line", start: { x: right, y: bottom }, end: { x: left, y: bottom } },
        { ...base, id: makeId(), type: "line", start: { x: left, y: bottom }, end: { x: left, y: top } },
      ];
      for (let index = 1; index < stepCount; index += 1) {
        const ratio = index / stepCount;
        stairEntities.push({
          ...base, id: makeId(), type: "line",
          start: { x: left + width * ratio, y: top },
          end: { x: left + width * ratio, y: bottom },
        });
      }
      commit({ ...doc, entities: [...doc.entities, ...stairEntities] });
      setSelected(stairEntities.map((item) => item.id));
      toast.success(`Stair footprint added with ${stepCount} tread divisions.`);
      setStart(null); setPolylinePoints([]); setCursor(null);
      return;
    }
    if (tool === "door" || tool === "window") {
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length <= 1e-8) {
        toast.info("Choose two different points to set the opening width.");
        setStart(null); setCursor(null);
        return;
      }
      const normal = { x: -dy / length, y: dx / length };
      const openingEntities: CadEntity[] = tool === "door"
        ? [
            { ...base, id: makeId(), type: "line", start: a, end: b },
            { ...base, id: makeId(), type: "arc", center: a, radius: length, startAngle: Math.atan2(dy, dx), endAngle: Math.atan2(dy, dx) + Math.PI / 2 },
          ]
        : [
            { ...base, id: makeId(), type: "line", start: { x: a.x + normal.x * 0.12 * length, y: a.y + normal.y * 0.12 * length }, end: { x: b.x + normal.x * 0.12 * length, y: b.y + normal.y * 0.12 * length } },
            { ...base, id: makeId(), type: "line", start: { x: a.x + normal.x * 0.32 * length, y: a.y + normal.y * 0.32 * length }, end: { x: b.x + normal.x * 0.32 * length, y: b.y + normal.y * 0.32 * length } },
            { ...base, id: makeId(), type: "line", start: { x: a.x + normal.x * 0.52 * length, y: a.y + normal.y * 0.52 * length }, end: { x: b.x + normal.x * 0.52 * length, y: b.y + normal.y * 0.52 * length } },
          ];
      commit({ ...doc, entities: [...doc.entities, ...openingEntities] });
      setSelected(openingEntities.map((item) => item.id));
      toast.success(tool === "door" ? "Basic door swing symbol added." : "Basic window symbol added.");
      setStart(null); setPolylinePoints([]); setCursor(null);
      return;
    }
    if (tool==="line") entity={...base,type:"line",start:a,end:b};
    else if (tool==="rectangle" || tool==="column" || tool==="wall" || tool==="beam") {
      const r=normalizeRect(a,b);
      entity=(tool==="wall" || tool==="beam") ? {...base,type:"wall",start:a,end:b,thickness:tool==="beam"?0.75:0.5} : {...base,type:"rectangle",...r};
    } else if (tool==="circle") entity={...base,type:"circle",center:a,radius:Math.hypot(b.x-a.x,b.y-a.y)};
    else if (tool==="polyline") entity={...base,type:"polyline",points:[a,b],closed:false};
    else if (tool==="polygon") {
      const radius=Math.hypot(b.x-a.x,b.y-a.y);
      if (radius <= 1e-8) {
        toast.info("Choose a point away from the polygon center.");
        setStart(null); setCursor(null);
        return;
      }
      const rawSides = window.prompt("Number of polygon sides (3–64):", "6");
      if (rawSides === null) { setStart(null); setCursor(null); return; }
      const sides = Number(rawSides);
      if (!Number.isInteger(sides) || sides < 3 || sides > 64) {
        toast.error("Polygon sides must be a whole number from 3 to 64.");
        setStart(null); setCursor(null);
        return;
      }
      const angle=Math.atan2(b.y-a.y,b.x-a.x);
      const points=Array.from({length:sides},(_,i)=>({x:a.x+radius*Math.cos(angle+i*2*Math.PI/sides),y:a.y+radius*Math.sin(angle+i*2*Math.PI/sides)}));
      entity={...base,type:"polyline",points,closed:true};
    }
    else if (tool==="arc") entity={...base,type:"arc",center:a,radius:Math.hypot(b.x-a.x,b.y-a.y),startAngle:0,endAngle:Math.PI*1.5};
    else if (tool==="ellipse") entity={...base,type:"ellipse",center:a,rx:Math.abs(b.x-a.x),ry:Math.abs(b.y-a.y)};
    if (entity) commit({...doc,entities:[...doc.entities,entity]});
    setStart(null); setPolylinePoints([]); setCursor(null);
  };
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const pan = panRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      setView((current) => ({ ...current, x: pan.viewX + (event.clientX - pan.clientX) * (1000 / Math.max(rect.width, 1)), y: pan.viewY + (event.clientY - pan.clientY) * (640 / Math.max(rect.height, 1)) }));
      return;
    }
    const p=toWorld(event); setCursor(p);
    if (tool === "select" && start) setSelectionWindow({ start, end: p });
    if (start && (tool==="move" || tool==="copy") && selected.length) {
      // Preview is shown by cursor; commit on pointer-up to keep history deterministic.
    }
  };
  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      panRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (tool === "select" && start) {
      const end = toWorld(event);
      const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
      if (Math.hypot(width, height) > 4 / view.scale) {
        const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
        const ids = doc.entities.filter((entity) => {
          if (doc.layers.find((layer) => layer.id === entity.layerId)?.visible === false) return false;
          const bounds = entityBounds(entity);
          return bounds.max.x >= minX && bounds.min.x <= maxX && bounds.max.y >= minY && bounds.min.y <= maxY;
        }).map((entity) => entity.id);
        setSelected(ids);
        setSelectionWindow({ start, end });
        window.setTimeout(() => setSelectionWindow(null), 180);
      }
      setStart(null);
      return;
    }
    if (!start || !selected.length || (tool!=="move" && tool!=="copy")) return;
    const end=toWorld(event), dx=end.x-start.x, dy=end.y-start.y;
    if (selected.length && (dx!==0 || dy!==0)) {
      const selectedSet = new Set(selected);
      const entities = tool === "copy"
        ? [...doc.entities, ...doc.entities.filter((entity) => selectedSet.has(entity.id)).map((entity) => ({ ...translateEntity(entity, dx, dy), id: makeId() } as CadEntity))]
        : doc.entities.map((entity) => selectedSet.has(entity.id) ? translateEntity(entity, dx, dy) : entity);
      commit({ ...doc, entities });
    }
    setStart(null);
  };

  const runCommand = () => {
    const raw = command.trim();
    if (!raw) return;
    try {
      const parsed = parseCadCommand(raw);
      if (parsed.name === "UNDO") { undo(); setCommand(""); return; }
      if (parsed.name === "REDO") { redo(); setCommand(""); return; }
      if (parsed.name === "ERASE" || parsed.name === "DELETE") { setTool("erase"); setCommand(""); return; }
      if (parsed.name === "ZOOMFIT") { fitToDrawing(); setCommand(""); return; }
      const base = { id: makeId(), layerId: activeLayer.id };
      let entity: CadEntity;
      if (parsed.name === "LINE") {
        const [startPoint, endPoint] = parsed.args;
        if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) <= 1e-8) {
          throw new Error("Line endpoints must be different.");
        }
        entity = { ...base, type: "line", start: startPoint, end: endPoint };
      } else if (parsed.name === "RECTANGLE") {
        const [first, second] = parsed.args;
        const rect = normalizeRect(first, second);
        if (rect.max.x <= rect.min.x || rect.max.y <= rect.min.y) throw new Error("Rectangle width and height must be positive.");
        entity = { ...base, type: "rectangle", ...rect };
      } else if (parsed.name === "CIRCLE") {
        const [center, radius] = parsed.args;
        entity = { ...base, type: "circle", center, radius };
      } else {
        const [startPoint, endPoint, thickness] = parsed.args;
        if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) <= 1e-8) {
          throw new Error("Wall endpoints must be different.");
        }
        entity = { ...base, type: "wall", start: startPoint, end: endPoint, thickness };
      }
      commit({ ...doc, entities: [...doc.entities, entity] });
      setSelected([entity.id]);
      setTool("select");
      setCommand("");
      toast.success(`${parsed.name} created from command coordinates.`);
    } catch (error) {
      const def = normalizeCommand(raw);
      if (def) {
        setTool(def.id);
        setCommand("");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not run this CAD command.");
    }
  };
  const undo = () => { if(!history.length)return; setFuture((f)=>[doc,...f]);setDoc(history[history.length-1]);setHistory(history.slice(0,-1)); };
  const redo = () => { if(!future.length)return; setHistory((h)=>[...h,doc]);setDoc(future[0]);setFuture(future.slice(1)); };

  // Keyboard editing shortcuts mirror common desktop CAD conventions.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === "d" && selected.length > 0) {
        event.preventDefault();
        const selectedSet = new Set(selected);
        const originals = doc.entities.filter((entity) => selectedSet.has(entity.id));
        const offset = Math.max(grid.snapSpacing, 1);
        const duplicates = originals.map((entity) => ({ ...translateEntity(entity, offset, offset), id: makeId() } as CadEntity));
        commit({ ...doc, entities: [...doc.entities, ...duplicates] });
        setSelected(duplicates.map((entity) => entity.id));
        toast.success(`Duplicated ${duplicates.length} object(s).`);
        return;
      }
      if (!modifier && !event.altKey) {
        const toolShortcuts: Record<string, CadToolId> = {
          s: "select", l: "line", c: "circle", r: "rectangle", p: "polyline",
          w: "wall", m: "move", o: "offset", t: "trim", x: "extend",
          e: "erase", g: "measure", i: "mirror", q: "rotate",
        };
        const shortcutTool = toolShortcuts[event.key.toLowerCase()];
        if (shortcutTool) {
          event.preventDefault();
          setTool(shortcutTool);
          setStart(null);
          setPolylinePoints([]);
          setModifyTargetId(null);
          setSelectionWindow(null);
          setCursor(null);
          return;
        }
      }
      if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelected(doc.entities.filter((entity) => doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false).map((entity) => entity.id));
        return;
      }
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Enter" && tool === "polyline" && polylinePoints.length >= 2) {
        event.preventDefault();
        const points = polylinePoints.filter((point, index) => index === 0 ||
          Math.hypot(point.x - polylinePoints[index - 1].x, point.y - polylinePoints[index - 1].y) > 1e-8);
        if (points.length >= 2) {
          const entity: CadEntity = { id: makeId(), layerId: activeLayer.id, type: "polyline", points, closed: false };
          commit({ ...doc, entities: [...doc.entities, entity] });
          toast.success("Polyline created.");
        }
        setStart(null); setPolylinePoints([]); setCursor(null);
        return;
      }
      if (event.key === "Escape") {
        setModifyTargetId(null);
        setSelectionWindow(null);
        setStart(null);
        setPolylinePoints([]);
        setCursor(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected.length > 0) {
        event.preventDefault();
        const selectedSet = new Set(selected);
        const remaining = doc.entities.filter((entity) => !selectedSet.has(entity.id));
        if (remaining.length !== doc.entities.length) {
          commit({ ...doc, entities: remaining });
          setSelected([]);
          toast.success(`Deleted ${doc.entities.length - remaining.length} object(s).`);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, selected, history, future, commit, tool, polylinePoints, activeLayer.id]);
  const addLayer = () => {
    const name=window.prompt("New layer name"); if(!name?.trim())return;
    if(doc.layers.some((l)=>l.name.toLowerCase()===name.trim().toLowerCase())) {toast.error("Layer name already exists.");return;}
    const layer={id:makeId(),name:name.trim(),visible:true,color:["#2563eb","#dc2626","#059669","#9333ea"][doc.layers.length%4],lineWeight:1};
    commit({...doc,layers:[...doc.layers,layer]});setLayerName(layer.name);
  };
  const renameActiveLayer = () => {
    const layer = activeLayer;
    const nextName = window.prompt("Rename active layer", layer.name)?.trim();
    if (!nextName || nextName === layer.name) return;
    if (doc.layers.some((item) => item.id !== layer.id && item.name.toLowerCase() === nextName.toLowerCase())) {
      toast.error("A layer with that name already exists.");
      return;
    }
    commit({ ...doc, layers: doc.layers.map((item) => item.id === layer.id ? { ...item, name: nextName } : item) });
    setLayerName(nextName);
    toast.success("Layer renamed.");
  };
  const deleteActiveLayer = () => {
    const layer = activeLayer;
    if (doc.layers.length <= 1) { toast.error("A drawing must keep at least one layer."); return; }
    const objectCount = doc.entities.filter((entity) => entity.layerId === layer.id).length;
    if (objectCount > 0) { toast.error("This layer contains drawing objects. Move or delete them before removing the layer."); return; }
    if (!window.confirm(`Delete empty layer "${layer.name}"?`)) return;
    const remaining = doc.layers.filter((item) => item.id !== layer.id);
    commit({ ...doc, layers: remaining });
    setLayerName(remaining[0].name);
    toast.success("Empty layer deleted.");
  };
  const fitToDrawing = () => {
    const visibleEntities = doc.entities.filter((entity) =>
      doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false
    );
    if (!visibleEntities.length) { setView({ x: 60, y: 50, scale: 1 }); return; }
    const bounds = visibleEntities.map(entityBounds);
    const minX = Math.min(...bounds.map((b) => b.min.x));
    const minY = Math.min(...bounds.map((b) => b.min.y));
    const maxX = Math.max(...bounds.map((b) => b.max.x));
    const maxY = Math.max(...bounds.map((b) => b.max.y));
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const scale = Math.max(0.2, Math.min(8, 900 / width, 540 / height));
    setView({ x: (1000 - width * scale) / 2 - minX * scale, y: (640 - height * scale) / 2 - minY * scale, scale });
  };
  const zoomToSelection = () => {
    const selectedEntities = doc.entities.filter((entity) => selected.includes(entity.id) &&
      doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false);
    if (!selectedEntities.length) {
      toast.info("Select one or more visible objects first.");
      return;
    }
    const bounds = selectedEntities.map(entityBounds);
    const minX = Math.min(...bounds.map((item) => item.min.x));
    const minY = Math.min(...bounds.map((item) => item.min.y));
    const maxX = Math.max(...bounds.map((item) => item.max.x));
    const maxY = Math.max(...bounds.map((item) => item.max.y));
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const scale = Math.max(0.2, Math.min(8, 820 / width, 460 / height));
    setView({ x: (1000 - width * scale) / 2 - minX * scale, y: (640 - height * scale) / 2 - minY * scale, scale });
  };
  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) * (1000 / Math.max(rect.width, 1));
    const canvasY = (event.clientY - rect.top) * (640 / Math.max(rect.height, 1));
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((current) => {
      const scale = Math.max(0.2, Math.min(8, current.scale * factor));
      const worldX = (canvasX - current.x) / current.scale;
      const worldY = (canvasY - current.y) / current.scale;
      return { scale, x: canvasX - worldX * scale, y: canvasY - worldY * scale };
    });
  };
  const exportFile = (kind:"json"|"svg") => {
    const content=kind==="json" ? JSON.stringify(doc,null,2) : svgRef.current?.outerHTML ?? "";
    const blob=new Blob([content],{type:kind==="json"?"application/json":"image/svg+xml"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`civilos-drawing.${kind}`;a.click();URL.revokeObjectURL(url);
  };
  const importJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed: unknown = JSON.parse(await file.text());
        if (!parsed || typeof parsed !== "object") throw new Error("The file is not a valid drawing document.");
        const candidate = parsed as Partial<CadDocument>;
        if (candidate.version !== 1 || !Array.isArray(candidate.entities) || !Array.isArray(candidate.layers) || candidate.layers.length === 0) {
          throw new Error("Unsupported drawing format. Choose a CivilOS AI JSON drawing backup.");
        }
        const validLayers = candidate.layers.every((layer) =>
          layer && typeof layer.id === "string" && typeof layer.name === "string" &&
          typeof layer.visible === "boolean" && typeof layer.color === "string"
        );
        const isFinitePoint = (point: unknown): point is Point2D =>
          !!point && typeof point === "object" &&
          Number.isFinite((point as Point2D).x) && Number.isFinite((point as Point2D).y);
        const validEntities = candidate.entities.every((rawEntity) => {
          if (!rawEntity || typeof rawEntity !== "object" ||
              typeof rawEntity.id !== "string" || typeof rawEntity.layerId !== "string") return false;
          const entity = rawEntity as CadEntity;
          switch (entity.type) {
            case "line": return isFinitePoint(entity.start) && isFinitePoint(entity.end) &&
              Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) > 1e-8;
            case "wall": return isFinitePoint(entity.start) && isFinitePoint(entity.end) &&
              Number.isFinite(entity.thickness) && entity.thickness > 0 &&
              Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) > 1e-8;
            case "polyline": return Array.isArray(entity.points) && entity.points.length >= 2 &&
              entity.points.every(isFinitePoint);
            case "rectangle": return isFinitePoint(entity.min) && isFinitePoint(entity.max) &&
              entity.max.x > entity.min.x && entity.max.y > entity.min.y;
            case "circle": return isFinitePoint(entity.center) && Number.isFinite(entity.radius) && entity.radius > 0;
            case "ellipse": return isFinitePoint(entity.center) && Number.isFinite(entity.rx) && entity.rx > 0 &&
              Number.isFinite(entity.ry) && entity.ry > 0;
            case "arc": return isFinitePoint(entity.center) && Number.isFinite(entity.radius) && entity.radius > 0 &&
              Number.isFinite(entity.startAngle) && Number.isFinite(entity.endAngle);
            case "text": return isFinitePoint(entity.at) && typeof entity.text === "string" && entity.text.trim().length > 0 && Number.isFinite(entity.height) && entity.height > 0 && Number.isFinite(entity.rotation);
            default: return false;
          }
        });
        const validUnits = candidate.units === "mm" || candidate.units === "cm" ||
          candidate.units === "m" || candidate.units === "in" || candidate.units === "ft";
        const layerIdsForValidation = candidate.layers.map((layer) => layer.id);
        const layerNamesForValidation = candidate.layers.map((layer) => layer.name.trim().toLowerCase());
        const entityIdsForValidation = candidate.entities.map((entity) =>
          entity && typeof entity === "object" && "id" in entity ? (entity as { id?: unknown }).id : undefined
        );
        const uniqueValues = (values: unknown[]) => new Set(values).size === values.length;
        if (!validUnits) throw new Error("Unsupported drawing units. Use mm, cm, m, in, or ft.");
        if (!validLayers || !validEntities) throw new Error("The drawing contains invalid layer or object data.");
        if (!uniqueValues(layerIdsForValidation) || layerNamesForValidation.some((name) => !name) ||
            !uniqueValues(layerNamesForValidation)) {
          throw new Error("Layer IDs and names must be present and unique.");
        }
        if (entityIdsForValidation.some((id) => typeof id !== "string" || !id.trim()) ||
            !uniqueValues(entityIdsForValidation)) {
          throw new Error("Every drawing object must have a unique, non-empty ID.");
        }
        const layerIds = new Set(candidate.layers.map((layer) => layer.id));
        if (candidate.entities.some((entity) => !layerIds.has(entity.layerId))) {
          throw new Error("Some objects refer to layers that are missing from this file.");
        }
        const imported = candidate as CadDocument;
        if (doc.entities.length > 0 && !window.confirm(
          `Replace the current drawing (${doc.entities.length} object(s)) with this imported drawing (${imported.entities.length} object(s))? Export a JSON backup first if you need to keep the current drawing.`
        )) return;
        commit(imported);
        setLayerName(imported.layers[0].name);
        setSelected([]);
        setStart(null);
        setPolylinePoints([]);
        setModifyTargetId(null);
        toast.success(`Imported ${imported.entities.length} drawing object(s).`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not import this JSON drawing.");
      }
    };
    input.click();
  };
  const groups=useMemo(()=>Array.from(new Set(palette.map((p)=>p.group))),[]);
  const selectTool = (id: CadToolId) => { setTool(id); setStart(null); setPolylinePoints([]); setModifyTargetId(null); setCursor(null); setToolsOpen(false); };
  const finishPolyline = () => {
    const points = polylinePoints.filter((point, index) => index === 0 ||
      Math.hypot(point.x - polylinePoints[index - 1].x, point.y - polylinePoints[index - 1].y) > 1e-8);
    if (points.length < 2) { toast.info("Add at least two distinct points before finishing the polyline."); return; }
    const entity: CadEntity = { id: makeId(), layerId: activeLayer.id, type: "polyline", points, closed: false };
    commit({ ...doc, entities: [...doc.entities, entity] });
    setStart(null); setPolylinePoints([]); setCursor(null);
    toast.success("Polyline created.");
  };
  const ToolPalette = (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-950 p-3 text-white shadow-sm"><div className="mb-2 flex items-center gap-2"><div className="rounded-lg bg-orange-500/20 p-2 text-orange-300"><DraftingCompass className="h-4 w-4"/></div><div><h3 className="text-sm font-semibold">Drafting tools</h3><p className="text-[10px] text-slate-400">Choose a tool to begin</p></div></div><p className="text-[11px] leading-relaxed text-slate-300">Click points on the canvas. Shift-click adds/removes objects from the selection; Ctrl/Cmd+Shift+D duplicates the selection. Polyline supports multiple vertices; press Enter, double-click, or use Finish Polyline when done.</p><div className="mt-3 flex items-center justify-between rounded-lg bg-white/10 px-2 py-1.5 text-[11px]"><span className="text-slate-300">Active tool</span><span className="font-semibold text-orange-300">{tool.toUpperCase()}</span></div></div>
      {groups.map((group)=>{const GroupIcon = group === "Draw" ? Shapes : group === "Modify" ? Move : group === "Annotate" ? Ruler : group === "Architecture" ? House : MousePointer2; return <div key={group} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm"><p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"><GroupIcon className="h-3.5 w-3.5 text-orange-500"/>{group === "Common" ? "Essentials" : group === "Architecture" ? "Architecture" : group === "Draw" ? "Draw objects" : group === "Modify" ? "Edit objects" : group}</p><div className="grid grid-cols-2 gap-1.5">{palette.filter((p)=>p.group===group).map((p)=>{const active=tool===p.id;return <Button key={p.id} size="sm" variant="outline" className={`h-10 min-w-0 justify-start rounded-lg border px-2 text-xs transition-all ${active?"border-orange-400 bg-orange-50 text-orange-800 shadow-sm ring-1 ring-orange-200 hover:bg-orange-50":"border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300 hover:bg-white"}`} onClick={()=>selectTool(p.id)} title={p.label} aria-pressed={active}><span className={`mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${active?"bg-orange-500 text-white":"bg-white text-slate-500 shadow-sm"}`}><MousePointer2 className="h-3 w-3"/></span><span className="truncate">{p.label}</span></Button>})}</div></div>})
    </div>
  );
  const renderEntity = (e: CadEntity) => {
    const layer=doc.layers.find((l)=>l.id===e.layerId); if(layer && !layer.visible)return null;
    const color=selected.includes(e.id)?"#f97316":layer?.color ?? "#111827";
    const common={stroke:color,strokeWidth:selected.includes(e.id)?2.5:1.6,fill:"none" as const,vectorEffect:"non-scaling-stroke" as const};
    if(e.type==="line"||e.type==="wall")return <line key={e.id} x1={e.start.x} y1={e.start.y} x2={e.end.x} y2={e.end.y} {...common} strokeWidth={e.type==="wall"?Math.max(2,e.thickness):common.strokeWidth}/>;
    if(e.type==="rectangle")return <rect key={e.id} x={e.min.x} y={e.min.y} width={e.max.x-e.min.x} height={e.max.y-e.min.y} {...common}/>;
    if(e.type==="circle")return <circle key={e.id} cx={e.center.x} cy={e.center.y} r={e.radius} {...common}/>
    if(e.type==="text")return <text key={e.id} x={e.at.x} y={e.at.y} fontSize={e.height} transform={`rotate(${e.rotation * 180 / Math.PI} ${e.at.x} ${e.at.y})`} fill={color} stroke="none" style={{userSelect:"none"}}>{e.text}</text>;;
    if(e.type==="ellipse")return <ellipse key={e.id} cx={e.center.x} cy={e.center.y} rx={e.rx} ry={e.ry} {...common}/>;
    if(e.type==="polyline")return <polyline key={e.id} points={e.points.map((p)=>`${p.x},${p.y}`).join(" ")} {...common}/>;
    if(e.type==="arc")return <path key={e.id} d={`M ${e.center.x+e.radius*Math.cos(e.startAngle)} ${e.center.y+e.radius*Math.sin(e.startAngle)} A ${e.radius} ${e.radius} 0 1 1 ${e.center.x+e.radius*Math.cos(e.endAngle)} ${e.center.y+e.radius*Math.sin(e.endAngle)}`} {...common}/>;
    return null;
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm md:p-5">
    <div className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 shadow-md shadow-orange-950/30"><DraftingCompass className="h-6 w-6 text-white"/></div><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold tracking-tight md:text-xl">Professional 2D Studio</h2><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300"><CheckCircle2 className="mr-1 inline h-3 w-3"/>Workspace ready</span></div><p className="text-xs text-slate-400">CivilOS AI · precision drafting workspace</p></div></div><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"><span className={`h-2 w-2 rounded-full ${saveStatus === "saved" ? "bg-emerald-400" : "bg-rose-400"}`}/><span className="text-slate-300">Auto-save</span><span className="font-semibold text-white">{saveStatus === "saved" ? "Saved on this device" : "Save failed — export backup"}</span></div></div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/[0.03] px-4 py-2.5 text-[11px] text-slate-400 md:px-5"><span className="inline-flex items-center gap-1.5"><Command className="h-3.5 w-3.5"/>Shortcuts: L line · C circle · R rectangle · P polyline · S select · E erase</span><span className="hidden text-slate-600 sm:inline">•</span><span className="inline-flex items-center gap-1.5"><Hand className="h-3.5 w-3.5"/>Wheel zoom · middle/right drag pan</span></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2 px-1"><div className="rounded-lg bg-orange-50 p-2 text-orange-600"><Wrench className="h-4 w-4"/></div><div><p className="text-xs font-semibold text-slate-800">Quick controls</p><p className="text-[10px] text-slate-500">Manage your drawing</p></div></div>
      <div className="flex flex-wrap items-center gap-1">
        {tool === "polyline" && polylinePoints.length >= 2 && <Button size="sm" onClick={finishPolyline}>Finish Polyline</Button>}
        {isMobile && <Sheet open={toolsOpen} onOpenChange={setToolsOpen}><SheetTrigger asChild><Button size="sm" variant="default"><Wrench className="mr-1 h-4 w-4"/>Tools</Button></SheetTrigger><SheetContent side="bottom" className="max-h-[82dvh] overflow-y-auto"><SheetHeader><SheetTitle>2D Drafting Tools</SheetTitle></SheetHeader><div className="mt-4">{ToolPalette}</div></SheetContent></Sheet>}
        <Button size="sm" variant="outline" className="rounded-lg" onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)"><Undo2 className="mr-1.5 h-4 w-4"/>Undo</Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)"><Redo2 className="mr-1.5 h-4 w-4"/>Redo</Button>
        <Button size="sm" variant={grid.enabled?"secondary":"outline"} className="rounded-lg" onClick={()=>setGrid((g)=>({...g,enabled:!g.enabled}))}><Grid3X3 className="mr-1.5 h-4 w-4"/>{grid.enabled?"Grid on":"Grid off"}</Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={zoomToSelection} title="Zoom to the selected objects"><ZoomIn className="mr-1.5 h-4 w-4"/>Zoom selection</Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={fitToDrawing} title="Fit all drawing objects into the canvas"><Maximize2 className="mr-1.5 h-4 w-4"/>Fit drawing</Button>
        <Button size="icon" variant="outline" className="rounded-lg" onClick={()=>setView((v)=>({...v,scale:Math.min(8,v.scale*1.25)}))} title="Zoom in"><ZoomIn className="h-4 w-4"/></Button>
        <Button size="icon" variant="outline" className="rounded-lg" onClick={()=>setView((v)=>({...v,scale:Math.max(.2,v.scale/1.25)}))} title="Zoom out"><ZoomOut className="h-4 w-4"/></Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={importJson} title="Open a CivilOS AI JSON drawing backup"><Upload className="mr-1.5 h-4 w-4"/>Import JSON</Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={()=>exportFile("svg")}><Download className="mr-1.5 h-4 w-4"/>Export SVG</Button>
        <Button size="sm" className="rounded-lg bg-orange-500 text-white hover:bg-orange-600" onClick={()=>exportFile("json")}><FileJson className="mr-1.5 h-4 w-4"/>Backup JSON</Button>
      </div>
    </div>
    <div className="grid min-w-0 gap-4 md:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_250px]">
      <aside className="hidden space-y-3 rounded-2xl border border-slate-200 bg-slate-100/80 p-3 md:block xl:max-h-[76vh] xl:overflow-y-auto">{ToolPalette}</aside>
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md xl:col-start-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5"><div className="flex items-center gap-2"><div className="rounded-md bg-orange-50 p-1.5 text-orange-600"><Ruler className="h-4 w-4"/></div><div><p className="text-xs font-semibold text-slate-800">Drawing canvas</p><p className="text-[10px] text-slate-500">Infinite-feel workspace · grid & precision controls</p></div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{doc.entities.length} objects</span></div>
        <svg ref={svgRef} viewBox="0 0 1000 640" className="h-[min(62dvh,640px)] min-h-[340px] w-full touch-none bg-slate-50 sm:h-[560px] xl:h-[min(76vh,760px)]" role="img" aria-label="2D CAD drafting canvas" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onDoubleClick={(event)=>{if(tool==="polyline"){event.preventDefault();finishPolyline();}}} onWheel={handleWheel} onContextMenu={(event)=>event.preventDefault()}>
          <defs><pattern id="cad-grid-small" width={Math.max(2,grid.gridSpacing*view.scale)} height={Math.max(2,grid.gridSpacing*view.scale)} patternUnits="userSpaceOnUse" x={view.x%Math.max(2,grid.gridSpacing*view.scale)} y={view.y%Math.max(2,grid.gridSpacing*view.scale)}><path d={`M ${Math.max(2,grid.gridSpacing*view.scale)} 0 L 0 0 0 ${Math.max(2,grid.gridSpacing*view.scale)}`} fill="none" stroke="#e5e7eb" strokeWidth=".7"/></pattern></defs>
          {grid.enabled&&<rect width="1000" height="640" fill="url(#cad-grid-small)"/>}
          {selectionWindow && tool === "select" && <rect x={Math.min(selectionWindow.start.x, selectionWindow.end.x)} y={Math.min(selectionWindow.start.y, selectionWindow.end.y)} width={Math.abs(selectionWindow.end.x - selectionWindow.start.x)} height={Math.abs(selectionWindow.end.y - selectionWindow.start.y)} fill="#2563eb" fillOpacity={0.08} stroke="#2563eb" strokeDasharray="5 3" strokeWidth={1 / view.scale} pointerEvents="none" transform={`translate(${view.x},${view.y}) scale(${view.scale})`} />}
          <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>{doc.entities.map(renderEntity)}{tool==="polyline"&&polylinePoints.length>0&&<polyline points={[...polylinePoints,...(cursor?[cursor]:[])].map((p)=>`${p.x},${p.y}`).join(" ")} fill="none" stroke="#f97316" strokeDasharray="4 3" strokeWidth={1/view.scale}/>}{start&&cursor&&tool!=="select"&&tool!=="move"&&tool!=="copy"&&tool!=="polyline"&&<line x1={start.x} y1={start.y} x2={cursor.x} y2={cursor.y} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1/view.scale}/>}</g>
        </svg>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><span>Tool: {tool.toUpperCase()} · Objects: {doc.entities.length} · Selected: {selected.length} · Units: {doc.units}</span><span>Cursor: {cursor?cursor.x.toFixed(2)+", "+cursor.y.toFixed(2):"—"} · Wheel: zoom · Middle/right drag: pan</span></div>
      </div>
      <aside className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1">
        <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4"/>Layers</h3><div className="space-y-1">{doc.layers.map((l)=><div key={l.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={l.visible} onChange={(e)=>commit({...doc,layers:doc.layers.map((x)=>x.id===l.id?{...x,visible:e.target.checked}:x)})}/><span className="h-3 w-3 rounded-sm border" style={{background:l.color}}/><button className="truncate text-left" onClick={()=>setLayerName(l.name)}>{l.name}</button><span className="ml-auto text-muted-foreground">{doc.entities.filter((e)=>e.layerId===l.id).length}</span></div>)}</div><div className="mt-2 grid grid-cols-2 gap-1.5"><Button size="sm" variant="outline" onClick={addLayer}>+ New layer</Button><Button size="sm" variant="outline" onClick={renameActiveLayer}>Rename</Button><Button size="sm" variant="outline" className="col-span-2" onClick={deleteActiveLayer} disabled={doc.layers.length <= 1 || doc.entities.some((entity) => entity.layerId === activeLayer.id)}>Delete empty active layer</Button></div></div>
        <div><label className="mb-1 block text-xs font-medium">Active layer</label><select className="w-full rounded-md border bg-background p-2 text-sm" value={layerName} onChange={(e)=>setLayerName(e.target.value)}>{doc.layers.map((l)=><option key={l.id}>{l.name}</option>)}</select></div><div><label className="mb-1 block text-xs font-medium">Drawing units</label><select aria-label="Drawing units" className="w-full rounded-md border bg-background p-2 text-sm" value={doc.units} onChange={(e)=>commit({...doc,units:e.target.value as CadDocument["units"]})}><option value="mm">Millimeters (mm)</option><option value="cm">Centimeters (cm)</option><option value="m">Meters (m)</option><option value="in">Inches (in)</option><option value="ft">Feet (ft)</option></select><p className="mt-1 text-[10px] text-muted-foreground">Changes the unit label/interpretation; existing coordinates are not converted.</p></div>
        <div><label className="mb-1 block text-xs font-medium">Grid spacing (visual)</label><Input aria-label="Visual grid spacing" type="number" min=".01" step=".25" value={grid.gridSpacing} onChange={(e)=>setGrid((g)=>({...g,gridSpacing:Math.max(.01,Number(e.target.value)||1)}))}/><label className="mb-1 mt-2 block text-xs font-medium">Snap spacing (drawing units)</label><Input aria-label="Snap spacing" type="number" min=".01" step=".25" value={grid.snapSpacing} onChange={(e)=>setGrid((g)=>({...g,snapSpacing:Math.max(.01,Number(e.target.value)||1)}))}/><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.snapEnabled} onChange={(e)=>setGrid((g)=>({...g,snapEnabled:e.target.checked}))}/> Snap to grid</label><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.ortho} onChange={(e)=>setGrid((g)=>({...g,ortho:e.target.checked}))}/> Ortho mode (horizontal/vertical lock)</label><p className="mt-1 text-[10px] text-muted-foreground">Visual grid and snap spacing can be adjusted independently.</p></div>
        <div><p className="mb-1 text-xs font-medium">Command line</p><form className="flex gap-1" onSubmit={(e)=>{e.preventDefault();runCommand();}}><Input value={command} onChange={(e)=>setCommand(e.target.value)} placeholder="LINE / RECTANG / CIRCLE"/><Button size="sm" type="submit">Run</Button></form><p className="mt-1 text-[10px] text-muted-foreground">Command aliases select the corresponding tool; geometry handlers are enabled for the initial draw tools.</p></div>
      </aside>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">Current working tools: select, measure, line, rectangle, circle, arc, wall, polygon, move, copy, rotate, mirror and erase. Offset supports current geometry entities; Trim and Extend currently support straight lines/walls with guided two-click workflows. Other tools are organized for the planned CAD workflow but are not yet implemented. Drawings auto-save in this browser on this device. Export JSON for a portable editable backup; SVG is for sharing/printing.</p>
  </section>;
}
