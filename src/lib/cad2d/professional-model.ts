/**
 * CivilOS AI Professional 2D CAD domain model.
 *
 * This is the domain contract for the professional drafting workspace.
 * Coordinates are drawing units; UI transforms are kept separate.
 * Geometry/rendering/editing implementations must validate these entities.
 */
import type { Point2D, CadLayer, CadEntity } from "./geometry";

export type CadToolId =
  | "select" | "line" | "polyline" | "mline" | "rectangle" | "circle" | "arc"
  | "ellipse" | "spline" | "polygon" | "point" | "ray" | "xline" | "hatch"
  | "boundary" | "wall" | "door" | "window" | "column" | "beam" | "stair"
  | "move" | "copy" | "rotate" | "mirror" | "scale" | "offset" | "trim"
  | "extend" | "fillet" | "chamfer" | "stretch" | "break" | "join" | "explode"
  | "array" | "align" | "erase" | "measure" | "dimension" | "text" | "leader"
  | "pan" | "zoom";

export type CadSnapMode =
  | "endpoint" | "midpoint" | "center" | "node" | "quadrant"
  | "intersection" | "perpendicular" | "tangent" | "nearest" | "parallel";

export type CadLinetype = "continuous" | "dashed" | "hidden" | "center" | "dot" | "dash-dot";

export type CadLayerStyle = CadLayer & {
  frozen?: boolean;
  plot?: boolean;
  linetype?: CadLinetype;
  transparency?: number;
  description?: string;
};

export type CadTextStyle = {
  id: string;
  name: string;
  fontFamily: string;
  height: number;
  widthFactor: number;
  obliqueAngle: number;
};

export type CadDimensionStyle = {
  id: string;
  name: string;
  textHeight: number;
  arrowSize: number;
  precision: number;
  unit: "decimal" | "architectural" | "engineering";
  scale: number;
  color: string;
};

export type CadAnnotation =
  | { id: string; type: "text"; at: Point2D; text: string; height: number; rotation: number; layerId: string; styleId?: string }
  | { id: string; type: "mtext"; at: Point2D; text: string; width: number; height: number; rotation: number; layerId: string; styleId?: string }
  | { id: string; type: "linear-dimension"; a: Point2D; b: Point2D; offset: number; layerId: string; styleId?: string }
  | { id: string; type: "aligned-dimension"; a: Point2D; b: Point2D; offset: number; layerId: string; styleId?: string }
  | { id: string; type: "angular-dimension"; vertex: Point2D; a: Point2D; b: Point2D; radius: number; layerId: string; styleId?: string }
  | { id: string; type: "radius-dimension"; center: Point2D; radius: number; angle: number; layerId: string; styleId?: string }
  | { id: string; type: "diameter-dimension"; center: Point2D; radius: number; angle: number; layerId: string; styleId?: string }
  | { id: string; type: "leader"; points: Point2D[]; text: string; layerId: string; styleId?: string };

export type CadBlockDefinition = {
  id: string;
  name: string;
  basePoint: Point2D;
  entities: CadEntity[];
  description?: string;
};

export type CadBlockReference = {
  id: string;
  type: "block-reference";
  blockId: string;
  at: Point2D;
  scaleX: number;
  scaleY: number;
  rotation: number;
  layerId: string;
};

export type CadViewport = {
  id: string;
  name: string;
  center: Point2D;
  scale: number;
  rotation: number;
  locked: boolean;
};

export type CadLayout = {
  id: string;
  name: string;
  paper: "A4" | "A3" | "A2" | "A1" | "A0" | "Letter" | "Custom";
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
  units: "mm" | "in";
  scale: number;
  viewports: CadViewport[];
};

export type CadGridSettings = {
  enabled: boolean;
  snapEnabled: boolean;
  gridSpacing: number;
  snapSpacing: number;
  snapModes: CadSnapMode[];
  ortho: boolean;
  polarTracking: boolean;
  polarIncrementDegrees: number;
};

export type CadSelection = {
  entityIds: string[];
  mode: "single" | "window" | "crossing" | "fence" | "all";
};

export type CadCommandDefinition = {
  id: CadToolId;
  label: string;
  aliases: string[];
  category: "draw" | "modify" | "annotate" | "architectural" | "view" | "utility";
  shortcut?: string;
  requiresSelection?: boolean;
};

/** Full professional command palette contract. Commands become available only as their handlers are implemented. */
export const CAD_COMMANDS: CadCommandDefinition[] = [
  { id: "select", label: "Select", aliases: ["SELECT", "S"], category: "utility", shortcut: "S" },
  { id: "line", label: "Line", aliases: ["LINE", "L"], category: "draw", shortcut: "L" },
  { id: "polyline", label: "Polyline", aliases: ["PLINE", "POLYLINE", "PL"], category: "draw", shortcut: "PL" },
  { id: "mline", label: "Multiline", aliases: ["MLINE", "ML"], category: "draw" },
  { id: "rectangle", label: "Rectangle", aliases: ["RECTANG", "RECTANGLE", "REC"], category: "draw", shortcut: "REC" },
  { id: "circle", label: "Circle", aliases: ["CIRCLE", "C"], category: "draw", shortcut: "C" },
  { id: "arc", label: "Arc", aliases: ["ARC", "A"], category: "draw", shortcut: "A" },
  { id: "ellipse", label: "Ellipse", aliases: ["ELLIPSE", "EL"], category: "draw" },
  { id: "spline", label: "Spline", aliases: ["SPLINE", "SPL"], category: "draw" },
  { id: "polygon", label: "Polygon", aliases: ["POLYGON", "POL"], category: "draw" },
  { id: "point", label: "Point", aliases: ["POINT", "PO"], category: "draw" },
  { id: "ray", label: "Ray", aliases: ["RAY"], category: "draw" },
  { id: "xline", label: "Construction line", aliases: ["XLINE", "XL"], category: "draw" },
  { id: "hatch", label: "Hatch / Fill", aliases: ["HATCH", "H"], category: "draw" },
  { id: "boundary", label: "Boundary", aliases: ["BOUNDARY", "BO"], category: "draw" },
  { id: "wall", label: "Wall", aliases: ["WALL", "WA"], category: "architectural" },
  { id: "door", label: "Door", aliases: ["DOOR", "DR"], category: "architectural" },
  { id: "window", label: "Window", aliases: ["WINDOW", "WN"], category: "architectural" },
  { id: "column", label: "Column", aliases: ["COLUMN", "COL"], category: "architectural" },
  { id: "beam", label: "Beam", aliases: ["BEAM", "BM"], category: "architectural" },
  { id: "stair", label: "Staircase", aliases: ["STAIR", "ST"], category: "architectural" },
  { id: "move", label: "Move", aliases: ["MOVE", "M"], category: "modify", shortcut: "M", requiresSelection: true },
  { id: "copy", label: "Copy", aliases: ["COPY", "CO", "CP"], category: "modify", shortcut: "CO", requiresSelection: true },
  { id: "rotate", label: "Rotate", aliases: ["ROTATE", "RO"], category: "modify", shortcut: "RO", requiresSelection: true },
  { id: "mirror", label: "Mirror", aliases: ["MIRROR", "MI"], category: "modify", shortcut: "MI", requiresSelection: true },
  { id: "scale", label: "Scale", aliases: ["SCALE", "SC"], category: "modify", shortcut: "SC", requiresSelection: true },
  { id: "offset", label: "Offset", aliases: ["OFFSET", "O"], category: "modify", shortcut: "O", requiresSelection: true },
  { id: "trim", label: "Trim", aliases: ["TRIM", "TR"], category: "modify", shortcut: "TR" },
  { id: "extend", label: "Extend", aliases: ["EXTEND", "EX"], category: "modify", shortcut: "EX" },
  { id: "fillet", label: "Fillet", aliases: ["FILLET", "F"], category: "modify", shortcut: "F" },
  { id: "chamfer", label: "Chamfer", aliases: ["CHAMFER", "CHA"], category: "modify", shortcut: "CHA" },
  { id: "stretch", label: "Stretch", aliases: ["STRETCH", "STRET"], category: "modify", requiresSelection: true },
  { id: "break", label: "Break", aliases: ["BREAK", "BR"], category: "modify", requiresSelection: true },
  { id: "join", label: "Join", aliases: ["JOIN", "J"], category: "modify", requiresSelection: true },
  { id: "explode", label: "Explode", aliases: ["EXPLODE", "X"], category: "modify", requiresSelection: true },
  { id: "array", label: "Array", aliases: ["ARRAY", "AR"], category: "modify", requiresSelection: true },
  { id: "align", label: "Align", aliases: ["ALIGN", "AL"], category: "modify", requiresSelection: true },
  { id: "erase", label: "Erase", aliases: ["ERASE", "E", "DELETE"], category: "modify", shortcut: "E", requiresSelection: true },
  { id: "measure", label: "Measure", aliases: ["DIST", "DISTANCE", "MEASURE"], category: "utility" },
  { id: "dimension", label: "Dimension", aliases: ["DIM", "DIMENSION"], category: "annotate" },
  { id: "text", label: "Text", aliases: ["TEXT", "DTEXT", "MTEXT"], category: "annotate" },
  { id: "leader", label: "Leader", aliases: ["LEADER", "MLEADER"], category: "annotate" },
  { id: "pan", label: "Pan", aliases: ["PAN", "P"], category: "view", shortcut: "P" },
  { id: "zoom", label: "Zoom", aliases: ["ZOOM", "Z"], category: "view", shortcut: "Z" },
];

export type ProfessionalCadDocument = {
  schemaVersion: 2;
  name: string;
  units: "mm" | "cm" | "m" | "in" | "ft";
  entities: CadEntity[];
  annotations: CadAnnotation[];
  layers: CadLayerStyle[];
  textStyles: CadTextStyle[];
  dimensionStyles: CadDimensionStyle[];
  blocks: CadBlockDefinition[];
  blockReferences: CadBlockReference[];
  layouts: CadLayout[];
  grid: CadGridSettings;
  activeLayerId: string;
  activeLayoutId: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_CAD_GRID: CadGridSettings = {
  enabled: true,
  snapEnabled: true,
  gridSpacing: 1,
  snapSpacing: 1,
  snapModes: ["endpoint", "midpoint", "center", "intersection", "perpendicular", "tangent"],
  ortho: false,
  polarTracking: false,
  polarIncrementDegrees: 90,
};

export function normalizeCommand(input: string): CadCommandDefinition | undefined {
  const token = input.trim().split(/\s+/)[0]?.toUpperCase();
  if (!token) return undefined;
  return CAD_COMMANDS.find((command) =>
    command.id.toUpperCase() === token ||
    command.label.toUpperCase() === token ||
    command.aliases.some((alias) => alias.toUpperCase() === token)
  );
}
