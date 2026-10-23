// Shared data model for the 2D/Render → 3D Construction Visualization module.
// All geometry is stored in METRES, plan coordinates: x → east, y → north (three.js: x, -z).
// Every item records WHERE it came from so the UI can separate verified data from AI inference.

export type UnitSystem = "metric" | "imperial";
export type LinearUnit = "mm" | "cm" | "m" | "in" | "ft";
export type AreaUnit = "sqm" | "sqft";

/** reference = read from a CAD/dimension in the upload; user = typed/confirmed by the user; estimated = AI inferred or defaulted */
export type Basis = "reference" | "user" | "estimated";
export type ElementSource = "dxf" | "vision" | "user" | "inferred";
export type ConfidenceLabel = "high" | "medium" | "low";

export interface Pt { x: number; y: number }

export interface Tracked {
  id: string;
  /** 0..1 */
  confidence: number;
  source: ElementSource;
  basis: Basis;
  verified: boolean;
}

export type FloorRef = number | "all"; // 0-based floor index, or the same element on every floor

export interface Wall extends Tracked { a: Pt; b: Pt; thickness: number; exterior: boolean; floor: FloorRef }
export interface Opening extends Tracked { c: Pt; width: number; height: number; sill: number; floor: FloorRef }
export interface Column extends Tracked { c: Pt; size: number; floor: FloorRef }
export interface Stair extends Tracked { c: Pt; w: number; d: number; rotation: number; floor: FloorRef }
export interface Balcony extends Tracked { c: Pt; w: number; d: number; rotation: number; floor: FloorRef }
export interface Room extends Tracked { name: string; c: Pt; floor: FloorRef; areaM2?: number }

export type ScaleSource = "dxf" | "dimensions" | "manual" | "area-assumed" | "none";

export interface BuildingModel {
  version: 1;
  name: string;
  buildingType: string;
  unitSystem: UnitSystem;
  sourceType: "plan" | "render" | "dxf" | "mixed" | "manual";
  /** true when exact geometry could not be recovered (render / inferred massing) */
  conceptual: boolean;
  floors: number;
  floorHeight: { value: number; basis: Basis };
  slabThickness: number;
  scale: { source: ScaleSource; metersPerPixel?: number; spreadPct?: number };
  footprint: { points: Pt[]; basis: Basis };
  walls: Wall[];
  doors: Opening[];
  windows: Opening[];
  columns: Column[];
  stairs: Stair[];
  balconies: Balcony[];
  rooms: Room[];
  roof: { type: "flat" | "gable"; parapet: number; basis: Basis };
  materials: { structure: string; exterior: string };
  /** every inferred / defaulted item, shown on the verify screen and in reports */
  assumptions: string[];
  warnings: string[];
}

export const confidenceLabel = (c: number): ConfidenceLabel => (c >= 0.85 ? "high" : c >= 0.6 ? "medium" : "low");

export const BUILDING_TYPES = [
  "Residential", "Commercial", "Office", "Apartment", "School", "Hospital", "Industrial", "Mixed Use", "Other",
] as const;

// Bangladesh-typical defaults (BNBC / common practice) — always flagged "estimated" when used.
export const DEFAULTS = {
  floorHeight: 3.05, // 10 ft
  slab: 0.15, // 6"
  extWall: 0.254, // 10" brick
  intWall: 0.127, // 5" brick
  column: 0.3, // 12" square
  doorW: 0.9, doorH: 2.1,
  winW: 1.2, winH: 1.2, winSill: 0.9,
  parapet: 0.9,
} as const;
