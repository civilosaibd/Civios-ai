// Global unit system helpers. Pure functions, unit tested.
// RULE: engines and saved data stay in their original unit (feet / sft). Units are converted only at the edge
// (what the user types and what is displayed), so changing the setting never corrupts stored numbers.

export type UnitSystem = "metric" | "imperial";
export const UNITS_STORAGE_KEY = "civilos.units";
export const DEFAULT_UNIT_SYSTEM: UnitSystem = "imperial"; // current behaviour of the app (feet)
export const M_PER_FT = 0.3048; // exact by definition
export const M2_PER_SFT = M_PER_FT * M_PER_FT;

export const isUnitSystem = (v: unknown): v is UnitSystem => v === "metric" || v === "imperial";

export const roundTo = (v: number, d: number) => { const k = 10 ** d; return Math.round((v + Number.EPSILON) * k) / k; };

export const ftToDisplay = (ft: number, s: UnitSystem) => (s === "metric" ? ft * M_PER_FT : ft);
export const displayToFt = (v: number, s: UnitSystem) => (s === "metric" ? v / M_PER_FT : v);
export const sftToDisplay = (sft: number, s: UnitSystem) => (s === "metric" ? sft * M2_PER_SFT : sft);

export const lengthUnit = (s: UnitSystem, bn = false) => (s === "metric" ? (bn ? "মি" : "m") : bn ? "ফুট" : "ft");
export const areaUnit = (s: UnitSystem, bn = false) => (s === "metric" ? "m²" : bn ? "বর্গফুট" : "sft");

/** convert a typed length when the user switches system (e.g. 40 ft -> 12.19 m) */
export const convertLength = (v: number, from: UnitSystem, to: UnitSystem, decimals = 2) =>
  from === to ? v : roundTo(ftToDisplay(displayToFt(v, from), to), decimals);

/** "12.19 m" / "40 ft" from a value stored in feet */
export const fmtLengthFt = (ft: number, s: UnitSystem, decimals = 1, bn = false) =>
  `${roundTo(ftToDisplay(ft, s), s === "metric" ? Math.max(decimals, 2) : decimals)} ${lengthUnit(s, bn)}`;
/** "3720 sft" / "345 m²" from a value stored in sft */
export const fmtAreaSft = (sft: number, s: UnitSystem, bn = false) => `${Math.round(sftToDisplay(sft, s))} ${areaUnit(s, bn)}`;
