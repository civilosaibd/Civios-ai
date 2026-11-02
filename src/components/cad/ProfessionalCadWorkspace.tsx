import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CAD_COMMANDS, DEFAULT_CAD_GRID, normalizeCommand,
  type CadToolId, type CadGridSettings,
} from "@/lib/cad2d/professional-model";
import {
  createEmptyDocument, normalizeRect, snapToGrid, translateEntity, rotateEntity, mirrorEntity, entityBounds, offsetEntity, trimLineAtPoint, extendLineToBoundary, scaleEntity, filletLines, chamferLines, polygonVertices, dimensionLength, deserializeCadDocument, type CadEntity, type CadDocument, type Point2D,
} from "@/lib/cad2d/geometry";
import { snapPoint } from "@/lib/cad2d/snap";
import { snapPointToWallNetwork } from "@/lib/cad2d/wall-network";
import { documentToDxf, documentToSvg } from "@/lib/cad2d/export";
import { importDxfDocument } from "@/lib/cad2d/dxf-import";
import { Download, Grid3X3, MousePointer2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Layers3, Wrench, DraftingCompass, Ruler, Shapes, House, Save, FileJson, Eye, CheckCircle2, Command, Move, Hand, Upload, Box } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import CadSelectionInspector from "@/components/cad/CadSelectionInspector";
import CadRoomSchedule from "@/components/cad/CadRoomSchedule";
import Cad3DPreview from "@/components/cad/Cad3DPreview";
import AutoPlanGenerator from "@/components/cad/AutoPlanGenerator";

import { useIsMobile } from "@/hooks/use-mobile";
import { createIndoCadTemplate, type IndoCadTemplateId } from "@/lib/cad2d/templates";

type DraftEntity = CadEntity & { id: string; layerId: string };

type FurnitureKind = "bed" | "sofa" | "dining-table" | "toilet" | "kitchen-counter" | "wardrobe" | "refrigerator" | "shower" | "bathtub" | "washbasin";
const furnitureLabels: { id: FurnitureKind; label: string; size: string }[] = [
  { id: "bed", label: "Bed", size: "6.5 × 5 ft" },
  { id: "sofa", label: "Sofa", size: "7 × 3 ft" },
  { id: "dining-table", label: "Dining set", size: "5 × 3 ft" },
  { id: "toilet", label: "Toilet", size: "2.5 × 4 ft" },
  { id: "kitchen-counter", label: "Kitchen counter", size: "8 × 2 ft" },
  { id: "wardrobe", label: "Wardrobe", size: "6 × 2 ft" },
  { id: "refrigerator", label: "Refrigerator", size: "2.5 × 2.5 ft" },
  { id: "shower", label: "Shower", size: "3 × 3 ft" },
  { id: "bathtub", label: "Bathtub", size: "5.5 × 2.5 ft" },
  { id: "washbasin", label: "Washbasin", size: "2 × 1.5 ft" },
];
function buildFurniture(kind: FurnitureKind, at: Point2D, layerId: string, units: CadDocument["units"]): CadEntity[] {
  const unitScale = ({ ft: 1, in: 12, m: 0.3048, cm: 30.48, mm: 304.8 } as const)[units];
  const id = () => globalThis.crypto?.randomUUID?.() ?? `furniture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const rect = (cx: number, cy: number, w: number, h: number): CadEntity => ({
    id: id(), layerId, type: "rectangle",
    min: { x: at.x + (cx - w / 2) * unitScale, y: at.y + (cy - h / 2) * unitScale },
    max: { x: at.x + (cx + w / 2) * unitScale, y: at.y + (cy + h / 2) * unitScale },
  });
  const ellipse = (cx: number, cy: number, rx: number, ry: number): CadEntity => ({
    id: id(), layerId, type: "ellipse",
    center: { x: at.x + cx * unitScale, y: at.y + cy * unitScale },
    rx: rx * unitScale, ry: ry * unitScale,
  });
  const line = (x1: number, y1: number, x2: number, y2: number): CadEntity => ({
    id: id(), layerId, type: "line",
    start: { x: at.x + x1 * unitScale, y: at.y + y1 * unitScale },
    end: { x: at.x + x2 * unitScale, y: at.y + y2 * unitScale },
  });
  switch (kind) {
    case "bed": return [rect(0, 0, 6.5, 5), rect(0, 0.15, 5.9, 4.1), rect(-1.7, -1.55, 1.8, 0.8), rect(0.2, -1.55, 1.8, 0.8), line(-3.25, -2.1, 3.25, -2.1)];
    case "sofa": return [rect(0, 0, 7, 3), rect(0, -0.9, 5.8, 1), rect(0, 0.15, 5.8, 1.2), rect(-3.05, 0, 0.9, 2.5), rect(3.05, 0, 0.9, 2.5), line(-2, -0.35, -2, 0.55), line(0, -0.35, 0, 0.55), line(2, -0.35, 2, 0.55)];
    case "dining-table": return [rect(0, 0, 5, 3), ...[[-2.7,-1.5],[0,-1.5],[2.7,-1.5],[-2.7,1.5],[0,1.5],[2.7,1.5]].map(([x,y]) => ellipse(x,y,0.42,0.42))];
    case "toilet": return [rect(0, -1.45, 2.5, 0.85), ellipse(0, 0.25, 1.05, 1.45), ellipse(0, 0.25, 0.68, 1.05)];
    case "kitchen-counter": return [rect(0, 0, 8, 2), rect(-2.3, 0, 1.5, 1.2), ellipse(-2.3, 0, 0.55, 0.4), line(-3.8, -0.75, 3.8, -0.75), line(-3.8, 0.75, 3.8, 0.75)];
    case "wardrobe": return [rect(0, 0, 6, 2), line(0, -1, 0, 1), ellipse(-0.2, 0, 0.06, 0.06), ellipse(0.2, 0, 0.06, 0.06)];
    case "refrigerator": return [rect(0, 0, 2.5, 2.5), line(-1.25, -0.35, 1.25, -0.35), line(0.8, -0.95, 0.8, -0.55), line(0.8, 0.05, 0.8, 0.4)];
    case "shower": return [rect(0, 0, 3, 3), line(-1.5, -1.5, 1.5, 1.5), line(1.5, -1.5, -1.5, 1.5), ellipse(0, 0, 0.18, 0.18)];
    case "bathtub": return [rect(0, 0, 5.5, 2.5), rect(0, 0, 4.9, 1.9), ellipse(2.35, 0, 0.12, 0.12)];
    case "washbasin": return [rect(0, 0, 2, 1.5), ellipse(0, 0, 0.68, 0.48), ellipse(0, 0, 0.08, 0.08)];
  }
}

type View = { x: number; y: number; scale: number };
const palette: { id: CadToolId; label: string; group: string }[] = [
  { id: "select", label: "Select", group: "Common" }, { id: "measure", label: "Measure", group: "Common" },
  { id: "line", label: "Line", group: "Draw" }, { id: "polyline", label: "Polyline", group: "Draw" },
  { id: "rectangle", label: "Rectangle", group: "Draw" }, { id: "circle", label: "Circle", group: "Draw" },
  { id: "arc", label: "Arc", group: "Draw" }, { id: "ellipse", label: "Ellipse", group: "Draw" },
  { id: "polygon", label: "Polygon", group: "Draw" },
  { id: "move", label: "Move", group: "Modify" }, { id: "copy", label: "Copy", group: "Modify" }, { id: "erase", label: "Erase", group: "Modify" },
  { id: "rotate", label: "Rotate", group: "Modify" }, { id: "mirror", label: "Mirror", group: "Modify" }, { id: "scale", label: "Scale", group: "Modify" },
  { id: "offset", label: "Offset", group: "Modify" }, { id: "trim", label: "Trim", group: "Modify" },
  { id: "extend", label: "Extend", group: "Modify" }, { id: "fillet", label: "Fillet", group: "Modify" }, { id: "chamfer", label: "Chamfer", group: "Modify" },
  { id: "dimension", label: "Dimension", group: "Annotate" }, { id: "text", label: "Text", group: "Annotate" },
  { id: "wall", label: "Wall", group: "Architecture" }, { id: "door", label: "Door", group: "Architecture" },
  { id: "window", label: "Window", group: "Architecture" }, { id: "column", label: "Column", group: "Architecture" },
];

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `cad-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ProfessionalCadWorkspace({ storageKey = "civilos-cad-document-v2" }: { storageKey?: string }) {
  const [doc, setDoc] = useState<CadDocument>(() => {
    if (typeof window === "undefined") return createEmptyDocument("ft");
    try {
      const saved = window.localStorage.getItem(storageKey) ?? (storageKey === "civilos-cad-document-v2" ? window.localStorage.getItem("civilos-cad-document-v1") : null);
      if (!saved) return createEmptyDocument("ft");
      const parsed = deserializeCadDocument(saved);
      if (Array.isArray(parsed.entities) && Array.isArray(parsed.layers) && parsed.layers.length > 0) return parsed;
    } catch {
      // Ignore invalid or unavailable local storage and start with an empty drawing.
    }
    return createEmptyDocument("ft");
  });
  const [tool, setTool] = useState<CadToolId>("select");
  const [show3D, setShow3D] = useState(false);
  const [buildingFloors, setBuildingFloors] = useState(1);
  const [grid, setGrid] = useState<CadGridSettings>(DEFAULT_CAD_GRID);
  const [wallThickness, setWallThickness] = useState(0.5);
  const [view, setView] = useState<View>({ x: 60, y: 50, scale: 1 });
  const [start, setStart] = useState<Point2D | null>(null);
  const [polylinePoints, setPolylinePoints] = useState<Point2D[]>([]);
  const [modifyTargetId, setModifyTargetId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point2D | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionWindow, setSelectionWindow] = useState<{ start: Point2D; end: Point2D } | null>(null);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<CadDocument[]>([]);
  const [future, setFuture] = useState<CadDocument[]>([]);
  const [layerName, setLayerName] = useState("0");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [furnitureKind, setFurnitureKind] = useState<FurnitureKind | null>(null);
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ clientX: number; clientY: number; viewX: number; viewY: number } | null>(null);
  const transformStartRef = useRef<Point2D | null>(null);
  const transformTargetIdsRef = useRef<string[]>([]);
  const transformToolRef = useRef<"move" | "copy" | null>(null);
  const activeLayer = doc.layers.find((layer) => layer.name === layerName) ?? doc.layers[0];

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ...doc, version: 2 }));
    } catch {
      toast.error("Could not auto-save this drawing locally. Please export a JSON backup.");
    }
  }, [doc, storageKey]);

  const commit = useCallback((next: CadDocument) => {
    setHistory((h) => [...h.slice(-99), doc]);
    setFuture([]);
    setDoc({ ...next });
  }, [doc]);

  const toWorld = (event: ReactPointerEvent<SVGSVGElement>, orthoAnchorOverride?: Point2D): Point2D => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Convert CSS pixels into SVG viewBox coordinates before applying the world transform.
    const canvasX = (event.clientX - rect.left) * (1000 / Math.max(rect.width, 1));
    const canvasY = (event.clientY - rect.top) * (640 / Math.max(rect.height, 1));
    let p = { x: (canvasX - view.x) / view.scale, y: (canvasY - view.y) / view.scale };
    const objectSnap = snapPoint(p, doc.entities, ["endpoint", "midpoint", "intersection", "center", "perpendicular"], 8 / view.scale);
    if (objectSnap) p = objectSnap.point;
    else if (grid.snapEnabled) p = snapToGrid(p, grid.snapSpacing);
    // Architectural walls additionally snap to existing wall endpoints, centerlines, and intersections.
    if (tool === "wall") p = snapPointToWallNetwork(p, doc.entities, 8 / view.scale) ?? p;
    // Ortho uses the previous polyline vertex, or the first point for other tools.
    const orthoAnchor = orthoAnchorOverride ?? (tool === "polyline" && polylinePoints.length
      ? polylinePoints[polylinePoints.length - 1]
      : tool === "move" || tool === "copy"
        ? null
        : start);
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
    if (e.type === "ellipse") { const t=Math.atan2((p.y-e.center.y)/Math.max(e.ry,.001),(p.x-e.center.x)/Math.max(e.rx,.001)); const q={x:e.center.x+e.rx*Math.cos(t),y:e.center.y+e.ry*Math.sin(t)}; return Math.hypot(p.x-q.x,p.y-q.y)<7/view.scale; }
    if (e.type === "polyline" || e.type === "polygon") {
      const points = e.type === "polygon" ? polygonVertices(e) : e.points;
      const segments = points.slice(1).map((point, index) => [points[index], point] as const);
      if ((e.type === "polygon" || e.closed) && points.length > 2) segments.push([points[points.length - 1], points[0]]);
      return segments.some(([a, b]) => distanceToSegment(p, a, b) < 7 / view.scale);
    }
    if (e.type === "door" || e.type === "window") {
      const half = e.width / 2;
      const dx = Math.cos(e.rotation) * half;
      const dy = Math.sin(e.rotation) * half;
      const a = { x: e.at.x - dx, y: e.at.y - dy };
      const b = { x: e.at.x + dx, y: e.at.y + dy };
      if (distanceToSegment(p, a, b) < 8 / view.scale) return true;
      // Match the visible quarter-circle swing arc, not an imaginary full circle.
      if (e.type === "door") {
        const radius = Math.hypot(p.x - e.at.x, p.y - e.at.y);
        if (Math.abs(radius - e.width) >= 8 / view.scale) return false;
        const normalize = (angle: number) => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const startAngle = normalize(e.rotation + Math.PI);
        const endAngle = normalize(e.rotation + (e.swing === "left" ? 1 : -1) * Math.PI / 2);
        const angle = normalize(Math.atan2(p.y - e.at.y, p.x - e.at.x));
        const span = e.swing === "left"
          ? normalize(startAngle - endAngle)
          : normalize(endAngle - startAngle);
        const progress = e.swing === "left"
          ? normalize(startAngle - angle)
          : normalize(angle - startAngle);
        return progress <= span + 0.02;
      }
      return false;
    }
    if (e.type === "column") {
      const bounds = entityBounds(e);
      const tolerance = 7 / view.scale;
      return p.x >= bounds.min.x - tolerance && p.x <= bounds.max.x + tolerance
        && p.y >= bounds.min.y - tolerance && p.y <= bounds.max.y + tolerance;
    }
    if (e.type === "text") {
      const bounds = entityBounds(e);
      const tolerance = 7 / view.scale;
      return p.x >= bounds.min.x - tolerance && p.x <= bounds.max.x + tolerance
        && p.y >= bounds.min.y - tolerance && p.y <= bounds.max.y + tolerance;
    }
    if (e.type === "dimension") {
      const tolerance = 8 / view.scale;
      return distanceToSegment(p, e.a, e.b) < tolerance;
    }
    return false;
  })?.id;
  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    transformStartRef.current = null;
    transformTargetIdsRef.current = [];
    transformToolRef.current = null;
    // Middle/right mouse drag pans the drawing without changing the active tool.
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      panRef.current = { clientX: event.clientX, clientY: event.clientY, viewX: view.x, viewY: view.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const p = toWorld(event);
    if (furnitureKind) {
      const placed = buildFurniture(furnitureKind, p, activeLayer.id, doc.units);
      commit({ ...doc, entities: [...doc.entities, ...placed] });
      setSelected(placed.map((entity) => entity.id));
      toast.success(`${furnitureLabels.find((item) => item.id === furnitureKind)?.label ?? "Furniture"} placed. Select and move individual parts as needed.`);
      return;
    }
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
    if (tool === "fillet" || tool === "chamfer") {
      const id = findHit(p);
      const entity = doc.entities.find((item) => item.id === id);
      if (!modifyTargetId) {
        if (!entity || entity.type !== "line") { toast.info("Click the first straight line."); return; }
        setModifyTargetId(entity.id);
        toast.info(tool === "fillet" ? "Click the second line to fillet." : "Click the second line to chamfer.");
        return;
      }
      const first = doc.entities.find((item) => item.id === modifyTargetId);
      if (!first || first.type !== "line" || !entity || entity.type !== "line" || entity.id === first.id) {
        toast.info("Click a different straight line.");
        return;
      }
      try {
        if (tool === "fillet") {
          const result = filletLines(first, entity, Math.max(grid.snapSpacing, 1));
          const arc: CadEntity = { ...result.arc, id: makeId() };
          commit({ ...doc, entities: doc.entities.map((item) => item.id === first.id ? result.first : item.id === entity.id ? result.second : item).concat(arc) });
          toast.success("Fillet created.");
        } else {
          const result = chamferLines(first, entity, Math.max(grid.snapSpacing, 1));
          const connector: CadEntity = { ...result.connector, id: makeId() };
          commit({ ...doc, entities: doc.entities.map((item) => item.id === first.id ? result.first : item.id === entity.id ? result.second : item).concat(connector) });
          toast.success("Chamfer created.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not edit these lines.");
      }
      setModifyTargetId(null);
      return;
    }
    if (tool === "scale") {
      const id = findHit(p);
      if (!id) { toast.info("Click an object to scale about this point."); return; }
      const factor = Number(window.prompt("Scale factor", "2"));
      if (!Number.isFinite(factor) || factor <= 0) { toast.error("Scale factor must be a positive number."); return; }
      const targets = selected.includes(id) ? selected : [id];
      const targetSet = new Set(targets);
      try {
        commit({ ...doc, entities: doc.entities.map((entity) => targetSet.has(entity.id) ? scaleEntity(entity, factor, p) : entity) });
        toast.success(`Scaled ${targets.length} object(s) by ${factor}.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not scale.");
      }
      return;
    }
    if (tool === "text") {
      const value = window.prompt("Text", "Label");
      if (!value?.trim()) return;
      const entity: CadEntity = { id: makeId(), layerId: activeLayer.id, type: "text", at: p, text: value.trim(), height: Math.max(grid.snapSpacing, 1), rotation: 0 };
      commit({ ...doc, entities: [...doc.entities, entity] });
      toast.success("Text created.");
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
      const targets = selected.includes(id) ? selected : [id];
      setSelected(targets);
      transformStartRef.current = p;
      transformTargetIdsRef.current = targets;
      transformToolRef.current = tool;
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!start) { setStart(p); setCursor(p); return; }
    const a=start, b=p;
    const deltaX = Math.abs(b.x - a.x), deltaY = Math.abs(b.y - a.y);
    if ((tool === "line" || tool === "wall") && Math.hypot(deltaX, deltaY) < 1e-8) {
      toast.info("Choose two different points to create a line or wall.");
      setStart(null); setCursor(null);
      return;
    }
    if (tool === "rectangle" && (deltaX < 1e-8 || deltaY < 1e-8)) {
      toast.info("A rectangle needs both a width and a height.");
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
    if (tool==="line") entity={...base,type:"line",start:a,end:b};
    else if (tool==="rectangle" || tool==="wall") {
      const r=normalizeRect(a,b);
      entity=tool==="wall" ? {...base,type:"wall",start:a,end:b,thickness:wallThickness} : {...base,type:"rectangle",...r};
    } else if (tool==="circle") entity={...base,type:"circle",center:a,radius:Math.hypot(b.x-a.x,b.y-a.y)};
    else if (tool==="polyline") entity={...base,type:"polyline",points:[a,b],closed:false};
    else if (tool==="polygon") {
      const radius=Math.hypot(b.x-a.x,b.y-a.y);
      if (radius > 0) entity={...base,type:"polygon",center:a,radius,sides:6,rotation:Math.atan2(b.y-a.y,b.x-a.x)};
    }
    else if (tool==="door" || tool==="window") {
      const width=Math.hypot(b.x-a.x,b.y-a.y);
      if (width > 1e-8) {
        const requestedAt={x:(a.x+b.x)/2,y:(a.y+b.y)/2}, requestedRotation=Math.atan2(b.y-a.y,b.x-a.x);
        const fitted=fitOpeningToNearestWall(requestedAt,width,doc.entities,8/view.scale);
        const at=fitted?.at ?? requestedAt, rotation=fitted?.rotation ?? requestedRotation, fittedWidth=fitted?.width ?? width;
        entity=tool==="door" ? {...base,type:"door",at,width:fittedWidth,rotation,swing:"left"} : {...base,type:"window",at,width:fittedWidth,rotation};
        if(fitted) toast.success(`${tool==="door"?"Door":"Window"} aligned to wall ${fitted.wallId}.${fittedWidth<width-1e-6?" Opening width adjusted to fit the wall.":""}`);
      }
    }
    else if (tool==="column") {
      const r=normalizeRect(a,b);
      const width=r.max.x-r.min.x, depth=r.max.y-r.min.y;
      if (width>1e-8 && depth>1e-8) entity={...base,type:"column",at:{x:(r.min.x+r.max.x)/2,y:(r.min.y+r.max.y)/2},width,depth,rotation:0};
    }
    else if (tool==="dimension") {
      if (Math.hypot(b.x-a.x,b.y-a.y) > 1e-8) entity={...base,type:"dimension",a,b,offset:Math.max(grid.snapSpacing,1)};
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
    const pendingStart = transformStartRef.current;
    const targetIds = transformTargetIdsRef.current;
    const transformTool = transformToolRef.current;
    transformStartRef.current = null;
    transformTargetIdsRef.current = [];
    transformToolRef.current = null;
    if (pendingStart && targetIds.length && transformTool) {
      const end = toWorld(event, pendingStart), dx = end.x - pendingStart.x, dy = end.y - pendingStart.y;
      if (dx !== 0 || dy !== 0) {
        const targetSet = new Set(targetIds);
        const entities = transformTool === "copy"
          ? [...doc.entities, ...doc.entities.filter((entity) => targetSet.has(entity.id)).map((entity) => ({ ...translateEntity(entity, dx, dy), id: makeId() } as CadEntity))]
          : doc.entities.map((entity) => targetSet.has(entity.id) ? translateEntity(entity, dx, dy) : entity);
        commit({ ...doc, entities });
      }
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

  };

  const handlePointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    panRef.current = null;
    transformStartRef.current = null;
    transformTargetIdsRef.current = [];
    transformToolRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleLostPointerCapture = () => {
    panRef.current = null;
    transformStartRef.current = null;
    transformTargetIdsRef.current = [];
    transformToolRef.current = null;
  };

  const runCommand = () => {
    const raw=command.trim(); if(!raw) return;
    if (/^(UNDO|U)$/i.test(raw)) { undo(); setCommand(""); return; }
    if (/^(REDO|RE)$/i.test(raw)) { redo(); setCommand(""); return; }
    if (/^(ERASE|DELETE|E)$/i.test(raw)) { setTool("erase"); setCommand(""); return; }
    const def=normalizeCommand(raw);
    if (!def) { toast.error(`Unknown command: ${raw.split(/\s+/)[0]}`); return; }
    setTool(def.id);
    setCommand("");
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
        setFurnitureKind(null);
        setModifyTargetId(null);
        setSelectionWindow(null);
        transformStartRef.current = null;
        transformTargetIdsRef.current = [];
        transformToolRef.current = null;
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
    if (!doc.entities.length) { setView({ x: 60, y: 50, scale: 1 }); return; }
    const bounds = doc.entities.map(entityBounds);
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
  const exportFile = (kind:"json"|"svg"|"dxf") => {
    const content=kind==="json" ? JSON.stringify({ ...doc, version: 2 },null,2) : kind==="dxf" ? documentToDxf(doc) : documentToSvg(doc);
    const blob=new Blob([content],{type:kind==="json"?"application/json":kind==="dxf"?"application/dxf":"image/svg+xml"});
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
        if ((candidate.version !== 1 && candidate.version !== 2) || !Array.isArray(candidate.entities) || !Array.isArray(candidate.layers) || candidate.layers.length === 0) {
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
            case "polygon": return isFinitePoint(entity.center) && entity.radius > 0 && entity.sides >= 3;
            case "door": return isFinitePoint(entity.at) && entity.width > 0 && (entity.swing === "left" || entity.swing === "right");
            case "window": return isFinitePoint(entity.at) && entity.width > 0;
            case "column": return isFinitePoint(entity.at) && entity.width > 0 && entity.depth > 0;
            case "text": return isFinitePoint(entity.at) && typeof entity.text === "string" && entity.height > 0;
            case "dimension": return isFinitePoint(entity.a) && isFinitePoint(entity.b);
            default: return false;
          }
        });
        if (!validLayers || !validEntities) throw new Error("The drawing contains invalid layer or object data.");
        const layerIds = new Set(candidate.layers.map((layer) => layer.id));
        if (candidate.entities.some((entity) => !layerIds.has(entity.layerId))) {
          throw new Error("Some objects refer to layers that are missing from this file.");
        }
        const imported = { ...(candidate as CadDocument), version: 2 as const };
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
  const importDxf = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".dxf,application/dxf,text/plain";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const imported = importDxfDocument(await file.text(), doc.units);
        if (doc.entities.length > 0 && !window.confirm(`Import ${imported.document.entities.length} DXF object(s) and replace the current drawing?`)) return;
        commit(imported.document);
        setLayerName(imported.document.layers[0]?.name ?? "0");
        setSelected([]);
        setStart(null);
        setPolylinePoints([]);
        setModifyTargetId(null);
        setView({ x: 60, y: 50, scale: 1 });
        const skipped = imported.notes.length ? ` Unsupported entities: ${imported.notes.slice(0, 6).join(", ")}${imported.notes.length > 6 ? "…" : ""}.` : "";
        toast.success(`Imported ${imported.document.entities.length} DXF object(s) across ${imported.document.layers.length} layer(s). Units: ${imported.document.units}.${skipped}`, { duration: 7000 });
        const bounds = imported.document.entities.map(entityBounds);
        const minX = Math.min(...bounds.map((item) => item.min.x));
        const minY = Math.min(...bounds.map((item) => item.min.y));
        const maxX = Math.max(...bounds.map((item) => item.max.x));
        const maxY = Math.max(...bounds.map((item) => item.max.y));
        const width = Math.max(maxX - minX, 1), height = Math.max(maxY - minY, 1);
        const scale = Math.max(0.2, Math.min(8, 900 / width, 540 / height));
        setView({ x: (1000 - width * scale) / 2 - minX * scale, y: (640 - height * scale) / 2 - minY * scale, scale });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not import this DXF file.");
      }
    };
    input.click();
  };
  const loadTemplate = (templateId: IndoCadTemplateId) => {
    if (doc.entities.length > 0 && !window.confirm("Load this starter plan? It will replace the current drawing. Export a JSON backup first if you need to keep it.")) return;
    const next = createIndoCadTemplate(templateId);
    commit(next);
    setLayerName(next.layers[0].name);
    setSelected([]);
    setStart(null);
    setPolylinePoints([]);
    setFuture([]);
    setView({ x: 210, y: 105, scale: 14 });
    setGrid((current) => ({ ...current, enabled: true, gridSpacing: 1, snapSpacing: 0.5, snapEnabled: true }));
    toast.success(templateId === "two-bedroom-home" ? "2-bedroom home template loaded." : "Compact office template loaded.");
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
      <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-2.5"><p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800"><House className="h-3.5 w-3.5"/>Furniture library</p><p className="mb-2 text-[10px] text-orange-700">Choose an item, then click once on the drawing to place it. Sizes follow the drawing units.</p><div className="grid grid-cols-2 gap-1.5">{furnitureLabels.map((item)=>{const active=furnitureKind===item.id;return <Button key={item.id} size="sm" variant="outline" className={`h-auto min-h-10 flex-col items-start gap-0 px-2 py-1.5 text-left ${active?"border-orange-500 bg-orange-100 text-orange-900":"border-orange-200 bg-white text-slate-700"}`} onClick={()=>{setFurnitureKind(active?null:item.id);setStart(null);setPolylinePoints([]);}} aria-pressed={active}><span className="text-xs font-semibold">{item.label}</span><span className="text-[9px] opacity-70">{item.size}</span></Button>})}</div>{furnitureKind&&<Button size="sm" variant="ghost" className="mt-2 h-7 w-full text-xs text-orange-800" onClick={()=>setFurnitureKind(null)}>Cancel placement (Esc)</Button>}</div>
      {groups.map((group)=>{const GroupIcon = group === "Draw" ? Shapes : group === "Modify" ? Move : group === "Annotate" ? Ruler : group === "Architecture" ? House : MousePointer2; return <div key={group} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm"><p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"><GroupIcon className="h-3.5 w-3.5 text-orange-500"/>{group === "Common" ? "Essentials" : group === "Architecture" ? "Architecture" : group === "Draw" ? "Draw objects" : group === "Modify" ? "Edit objects" : group}</p><div className="grid grid-cols-2 gap-1.5">{palette.filter((p)=>p.group===group).map((p)=>{const active=tool===p.id;return <Button key={p.id} size="sm" variant="outline" className={`h-10 min-w-0 justify-start rounded-lg border px-2 text-xs transition-all ${active?"border-orange-400 bg-orange-50 text-orange-800 shadow-sm ring-1 ring-orange-200 hover:bg-orange-50":"border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300 hover:bg-white"}`} onClick={()=>selectTool(p.id)} title={p.label} aria-pressed={active}><span className={`mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${active?"bg-orange-500 text-white":"bg-white text-slate-500 shadow-sm"}`}><MousePointer2 className="h-3 w-3"/></span><span className="truncate">{p.label}</span></Button>})}</div></div>})}
    </div>
  );
  const renderEntity = (e: CadEntity) => {
    const layer=doc.layers.find((l)=>l.id===e.layerId); if(layer && !layer.visible)return null;
    const color=selected.includes(e.id)?"#f97316":layer?.color ?? "#111827";
    const common={stroke:color,strokeWidth:selected.includes(e.id)?2.5:1.6,fill:"none" as const,vectorEffect:"non-scaling-stroke" as const};
    if(e.type==="line")return <line key={e.id} x1={e.start.x} y1={e.start.y} x2={e.end.x} y2={e.end.y} {...common}/>;
    if(e.type==="wall")return <g key={e.id}>{getWallVisibleSegments(e,doc.entities).map((segment,index)=><line key={index} x1={segment.start.x} y1={segment.start.y} x2={segment.end.x} y2={segment.end.y} {...common} strokeWidth={Math.max(2,e.thickness)}/>)}</g>;;
    if(e.type==="rectangle")return <rect key={e.id} x={e.min.x} y={e.min.y} width={e.max.x-e.min.x} height={e.max.y-e.min.y} {...common}/>;
    if(e.type==="circle")return <circle key={e.id} cx={e.center.x} cy={e.center.y} r={e.radius} {...common}/>;
    if(e.type==="ellipse")return <ellipse key={e.id} cx={e.center.x} cy={e.center.y} rx={e.rx} ry={e.ry} {...common}/>;
    if(e.type==="polyline")return <polyline key={e.id} points={e.points.map((p)=>`${p.x},${p.y}`).join(" ")} {...common}/>;
    if(e.type==="arc")return <path key={e.id} d={`M ${e.center.x+e.radius*Math.cos(e.startAngle)} ${e.center.y+e.radius*Math.sin(e.startAngle)} A ${e.radius} ${e.radius} 0 1 1 ${e.center.x+e.radius*Math.cos(e.endAngle)} ${e.center.y+e.radius*Math.sin(e.endAngle)}`} {...common}/>;
    if(e.type==="polygon"){ const pts=polygonVertices(e); return <polygon key={e.id} points={pts.map((pt)=>`${pt.x},${pt.y}`).join(" ")} {...common}/>; }
    if(e.type==="door"||e.type==="window"){
      const dx=Math.cos(e.rotation)*e.width/2, dy=Math.sin(e.rotation)*e.width/2;
      const x1=e.at.x-dx, y1=e.at.y-dy, x2=e.at.x+dx, y2=e.at.y+dy;
      const normalX=-Math.sin(e.rotation), normalY=Math.cos(e.rotation);
      const jambLength=Math.max(0.08,e.width*0.06);
      return <g key={e.id}>
        {e.type==="door" ? <><line x1={x1} y1={y1} x2={x2} y2={y2} {...common}/><path d={`M ${x1} ${y1} A ${e.width} ${e.width} 0 0 ${e.swing==="left"?0:1} ${e.at.x+Math.cos(e.rotation+(e.swing==="left"?1:-1)*Math.PI/2)*e.width/2} ${e.at.y+Math.sin(e.rotation+(e.swing==="left"?1:-1)*Math.PI/2)*e.width/2}`} {...common}/></> : <>
          <line x1={x1+normalX*jambLength/2} y1={y1+normalY*jambLength/2} x2={x2+normalX*jambLength/2} y2={y2+normalY*jambLength/2} {...common}/>
          <line x1={x1-normalX*jambLength/2} y1={y1-normalY*jambLength/2} x2={x2-normalX*jambLength/2} y2={y2-normalY*jambLength/2} {...common}/>
          <line x1={x1-normalX*jambLength} y1={y1-normalY*jambLength} x2={x1+normalX*jambLength} y2={y1+normalY*jambLength} {...common}/>
          <line x1={x2-normalX*jambLength} y1={y2-normalY*jambLength} x2={x2+normalX*jambLength} y2={y2+normalY*jambLength} {...common}/>
        </>}
      </g>;
    }
    if(e.type==="column") return <rect key={e.id} x={e.at.x-e.width/2} y={e.at.y-e.depth/2} width={e.width} height={e.depth} {...common} fill={color} fillOpacity={0.25}/>;
    if(e.type==="text") return <text key={e.id} x={e.at.x} y={e.at.y} fontSize={e.height} fill={color}>{e.text}</text>;
    if(e.type==="dimension") return <g key={e.id}><line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} {...common}/><text x={(e.a.x+e.b.x)/2} y={(e.a.y+e.b.y)/2 - e.offset} fontSize={Math.max(1, 8/view.scale)} fill={color}>{dimensionLength(e).toFixed(3)} {doc.units}</text></g>;
    return null;
  };

  return <section className="flex h-full min-h-0 flex-col gap-2 overflow-hidden bg-slate-100 p-2 md:p-3">
    <div className="shrink-0 overflow-hidden rounded-xl bg-slate-950 text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 shadow-md shadow-orange-950/30"><DraftingCompass className="h-6 w-6 text-white"/></div><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold tracking-tight md:text-xl">Professional 2D Studio</h2><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300"><CheckCircle2 className="mr-1 inline h-3 w-3"/>Workspace ready</span></div><p className="text-xs text-slate-400">CivilOS AI · precision drafting workspace</p></div></div><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"><span className="h-2 w-2 rounded-full bg-emerald-400"/><span className="text-slate-300">Auto-save</span><span className="font-semibold text-white">On this device</span></div></div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-slate-400 md:px-4"><span className="inline-flex items-center gap-1.5"><Command className="h-3.5 w-3.5"/>Shortcuts: L line · C circle · R rectangle · P polyline · S select · E erase</span><span className="hidden text-slate-600 sm:inline">•</span><span className="inline-flex items-center gap-1.5"><Hand className="h-3.5 w-3.5"/>Wheel zoom · middle/right drag pan</span></div>
    </div>
    <AutoPlanGenerator units={doc.units} onGenerate={(generated, floors) => {
      if (doc.entities.length > 0 && !window.confirm("Generate a new AI floor plan and replace the current drawing? Export a JSON backup first if needed.")) return false;
      setBuildingFloors(floors);
      commit(generated);
      setLayerName(generated.layers[0]?.name ?? "AI Generated Walls");
      setSelected([]); setStart(null); setPolylinePoints([]); setModifyTargetId(null); setFurnitureKind(null);
      setTool("select"); setShow3D(false);
      const bounds = generated.entities.map(entityBounds);
      const minX = Math.min(...bounds.map((item) => item.min.x)); const minY = Math.min(...bounds.map((item) => item.min.y));
      const maxX = Math.max(...bounds.map((item) => item.max.x)); const maxY = Math.max(...bounds.map((item) => item.max.y));
      const width = Math.max(maxX - minX, 1); const height = Math.max(maxY - minY, 1);
      const scale = Math.max(0.2, Math.min(8, 900 / width, 540 / height));
      setView({ x: (1000 - width * scale) / 2 - minX * scale, y: (640 - height * scale) / 2 - minY * scale, scale });
      return true;
    }} />
    <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="flex items-center gap-2 px-1"><div className="rounded-lg bg-orange-50 p-2 text-orange-600"><Wrench className="h-4 w-4"/></div><div><p className="text-xs font-semibold text-slate-800">Quick controls</p><p className="text-[10px] text-slate-500">Manage your drawing</p></div></div>
      <div className="flex flex-wrap items-center gap-1">
        <label className="sr-only" htmlFor="indocad-template">Load a starter drawing template</label>
        <select
          id="indocad-template"
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value as IndoCadTemplateId | "";
            if (value) loadTemplate(value);
            event.target.value = "";
          }}
          className="h-9 max-w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
          title="Start a drawing from an architectural template"
        >
          <option value="" disabled>Starter templates…</option>
          <option value="two-bedroom-home">2-bedroom home · 40 × 30 ft</option>
          <option value="compact-office">Compact office · 36 × 24 ft</option>
        </select>
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
        <Button size="sm" variant="outline" className="rounded-lg" onClick={importDxf} title="Import common 2D entities from an ASCII DXF file"><Upload className="mr-1.5 h-4 w-4"/>Import DXF</Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={()=>exportFile("svg")}><Download className="mr-1.5 h-4 w-4"/>Export SVG</Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={()=>exportFile("dxf")}><Download className="mr-1.5 h-4 w-4"/>Export DXF</Button>
        <Button size="sm" className="rounded-lg bg-orange-500 text-white hover:bg-orange-600" onClick={()=>exportFile("json")}><FileJson className="mr-1.5 h-4 w-4"/>Backup JSON</Button>
      </div>
    </div>
    <div className="grid min-h-0 min-w-0 flex-1 gap-2 overflow-y-auto md:grid-cols-[176px_minmax(0,1fr)] xl:grid-cols-[196px_minmax(0,1fr)_248px] xl:overflow-hidden">
      <aside className="hidden min-h-0 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 md:block">{ToolPalette}</aside>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5"><div className="flex items-center gap-2"><div className="rounded-md bg-orange-50 p-1.5 text-orange-600"><Ruler className="h-4 w-4"/></div><div><p className="text-xs font-semibold text-slate-800">Drawing canvas</p><p className="text-[10px] text-slate-500">Infinite-feel workspace · grid & precision controls</p></div></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{doc.entities.length} objects</span><Button size="sm" variant={show3D ? "default" : "outline"} className="h-8 text-xs" onClick={() => setShow3D((value) => !value)} disabled={!show3D && doc.entities.length === 0} title={doc.entities.length === 0 ? "Generate or draw a 2D plan before viewing its 3D model" : "View the current 2D drawing as a 3D architectural massing model"}><Box className="mr-1.5 h-3.5 w-3.5"/>{show3D ? "Back to 2D" : "View 3D Model"}</Button></div></div>
        {show3D ? <Cad3DPreview document={doc} floorCount={buildingFloors}/> : (
        <svg ref={svgRef} viewBox="0 0 1000 640" className="min-h-[360px] w-full flex-1 touch-none bg-slate-50" role="img" aria-label="2D CAD drafting canvas" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={handleLostPointerCapture} onDoubleClick={(event)=>{if(tool==="polyline"){event.preventDefault();finishPolyline();}}} onWheel={handleWheel} onContextMenu={(event)=>event.preventDefault()}>
          <defs><pattern id="cad-grid-small" width={Math.max(2,grid.gridSpacing*view.scale)} height={Math.max(2,grid.gridSpacing*view.scale)} patternUnits="userSpaceOnUse" x={view.x%Math.max(2,grid.gridSpacing*view.scale)} y={view.y%Math.max(2,grid.gridSpacing*view.scale)}><path d={`M ${Math.max(2,grid.gridSpacing*view.scale)} 0 L 0 0 0 ${Math.max(2,grid.gridSpacing*view.scale)}`} fill="none" stroke="#e5e7eb" strokeWidth=".7"/></pattern></defs>
          {grid.enabled&&<rect width="1000" height="640" fill="url(#cad-grid-small)"/>}
          {selectionWindow && tool === "select" && <rect x={Math.min(selectionWindow.start.x, selectionWindow.end.x)} y={Math.min(selectionWindow.start.y, selectionWindow.end.y)} width={Math.abs(selectionWindow.end.x - selectionWindow.start.x)} height={Math.abs(selectionWindow.end.y - selectionWindow.start.y)} fill="#2563eb" fillOpacity={0.08} stroke="#2563eb" strokeDasharray="5 3" strokeWidth={1 / view.scale} pointerEvents="none" transform={`translate(${view.x},${view.y}) scale(${view.scale})`} />}
          <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>{doc.entities.map(renderEntity)}{tool==="polyline"&&polylinePoints.length>0&&<polyline points={[...polylinePoints,...(cursor?[cursor]:[])].map((p)=>`${p.x},${p.y}`).join(" ")} fill="none" stroke="#f97316" strokeDasharray="4 3" strokeWidth={1/view.scale}/>}{start&&cursor&&tool!=="select"&&tool!=="move"&&tool!=="copy"&&tool!=="polyline"&&<line x1={start.x} y1={start.y} x2={cursor.x} y2={cursor.y} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1/view.scale}/>}</g>
        </svg>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><span>{show3D ? "3D Preview" : `Tool: ${tool.toUpperCase()}`} · Objects: {doc.entities.length} · Selected: {selected.length} · Units: {doc.units}</span><span>{show3D ? "Drag to orbit · Scroll to zoom · Right-drag to pan" : `Cursor: ${cursor?cursor.x.toFixed(2)+", "+cursor.y.toFixed(2):"—"} · Wheel: zoom · Middle/right drag: pan`}</span></div>
      </div>
      <aside className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:col-span-2 xl:col-span-1 xl:row-start-1 xl:max-h-full xl:overflow-y-auto">
        <CadSelectionInspector
          entities={doc.entities.filter((entity) => selected.includes(entity.id))}
          layers={doc.layers}
          units={doc.units}
          onMoveToLayer={(layerId) => {
            const selectedSet = new Set(selected);
            commit({ ...doc, entities: doc.entities.map((entity) => selectedSet.has(entity.id) ? { ...entity, layerId } : entity) });
            toast.success(`Moved ${selected.length} selected object(s) to the chosen layer.`);
          }}
        />
        <CadRoomSchedule entities={doc.entities.filter((entity) => doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false)} units={doc.units} />
        
        <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4"/>Layers</h3><div className="space-y-1">{doc.layers.map((l)=><div key={l.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={l.visible} onChange={(e)=>commit({...doc,layers:doc.layers.map((x)=>x.id===l.id?{...x,visible:e.target.checked}:x)})}/><span className="h-3 w-3 rounded-sm border" style={{background:l.color}}/><button className="truncate text-left" onClick={()=>setLayerName(l.name)}>{l.name}</button><span className="ml-auto text-muted-foreground">{doc.entities.filter((e)=>e.layerId===l.id).length}</span></div>)}</div><div className="mt-2 grid grid-cols-2 gap-1.5"><Button size="sm" variant="outline" onClick={addLayer}>+ New layer</Button><Button size="sm" variant="outline" onClick={renameActiveLayer}>Rename</Button><Button size="sm" variant="outline" className="col-span-2" onClick={deleteActiveLayer} disabled={doc.layers.length <= 1 || doc.entities.some((entity) => entity.layerId === activeLayer.id)}>Delete empty active layer</Button></div></div>
        <div><label className="mb-1 block text-xs font-medium">Active layer</label><select className="w-full rounded-md border bg-background p-2 text-sm" value={layerName} onChange={(e)=>setLayerName(e.target.value)}>{doc.layers.map((l)=><option key={l.id}>{l.name}</option>)}</select></div><div><label className="mb-1 block text-xs font-medium">Drawing units</label><select aria-label="Drawing units" className="w-full rounded-md border bg-background p-2 text-sm" value={doc.units} onChange={(e)=>commit({...doc,units:e.target.value as CadDocument["units"]})}><option value="mm">Millimeters (mm)</option><option value="cm">Centimeters (cm)</option><option value="m">Meters (m)</option><option value="in">Inches (in)</option><option value="ft">Feet (ft)</option></select><p className="mt-1 text-[10px] text-muted-foreground">Changes the unit label/interpretation; existing coordinates are not converted.</p></div>
        <div><label className="mb-1 block text-xs font-medium">Wall thickness ({doc.units})</label><Input aria-label="Wall thickness" type="number" min="0.01" step="0.05" value={wallThickness} onChange={(e)=>setWallThickness(Math.max(0.01,Number(e.target.value)||0.01))}/><p className="mt-1 text-[10px] text-muted-foreground">Used for newly drawn walls. Existing wall thickness remains unchanged.</p></div><div><label className="mb-1 block text-xs font-medium">Grid spacing (visual)</label><Input aria-label="Visual grid spacing" type="number" min=".01" step=".25" value={grid.gridSpacing} onChange={(e)=>setGrid((g)=>({...g,gridSpacing:Math.max(.01,Number(e.target.value)||1)}))}/><label className="mb-1 mt-2 block text-xs font-medium">Snap spacing (drawing units)</label><Input aria-label="Snap spacing" type="number" min=".01" step=".25" value={grid.snapSpacing} onChange={(e)=>setGrid((g)=>({...g,snapSpacing:Math.max(.01,Number(e.target.value)||1)}))}/><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.snapEnabled} onChange={(e)=>setGrid((g)=>({...g,snapEnabled:e.target.checked}))}/> Snap to grid</label><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.ortho} onChange={(e)=>setGrid((g)=>({...g,ortho:e.target.checked}))}/> Ortho mode (horizontal/vertical lock)</label><p className="mt-1 text-[10px] text-muted-foreground">Visual grid and snap spacing can be adjusted independently.</p></div>
        <div><p className="mb-1 text-xs font-medium">Command line</p><form className="flex gap-1" onSubmit={(e)=>{e.preventDefault();runCommand();}}><Input value={command} onChange={(e)=>setCommand(e.target.value)} placeholder="LINE / RECTANG / CIRCLE"/><Button size="sm" type="submit">Run</Button></form><p className="mt-1 text-[10px] text-muted-foreground">Command aliases select the corresponding tool; geometry handlers are enabled for the initial draw tools.</p></div>
      </aside>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">Working tools include selection, measurement, line/rectangle/circle/arc, wall, door/window openings, columns, dimensions, furniture symbols, move/copy/rotate/mirror/erase, offset, and guided Trim/Extend for straight lines and walls. Furniture and architectural symbols are editable CAD primitives/entities. Drawings auto-save in this browser on this device. Export JSON for an editable backup; SVG is for sharing/printing.</p>
  </section>;
}