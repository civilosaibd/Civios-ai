import { describe, expect, it } from "vitest";
import { generateEstimate } from "./estimateEngine";

const valid = {
  plotLength: 40,
  plotWidth: 30,
  floors: 2,
  floorHeight: 10,
  wallThickness: 5,
  quality: "standard",
  projectType: "residential",
  unit: "feet",
  fileName: "test-plan.dwg",
};

describe("generateEstimate input validation", () => {
  it.each([
    ["zero plot length", { plotLength: 0 }],
    ["negative plot width", { plotWidth: -30 }],
    ["NaN floor height", { floorHeight: Number.NaN }],
    ["infinite wall thickness", { wallThickness: Number.POSITIVE_INFINITY }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => generateEstimate({ ...valid, ...overrides })).toThrow();
  });

  it.each([
    ["fractional floors", 1.5],
    ["zero floors", 0],
    ["negative floors", -1],
    ["excessive floors", 101],
  ])("rejects invalid floor count: %s", (_label, floors) => {
    expect(() => generateEstimate({ ...valid, floors })).toThrow(/Floors must be a whole number/);
  });

  it("rejects unsupported units instead of silently treating them as feet", () => {
    expect(() => generateEstimate({ ...valid, unit: "yards" })).toThrow(/Unit must be either feet or meters/);
  });

  it.each([
    ["negative cement rate", { cement: -1 }],
    ["NaN steel rate", { steel: Number.NaN }],
    ["infinite labor rate", { labor: Number.POSITIVE_INFINITY }],
  ])("rejects %s", (_label, rates) => {
    expect(() => generateEstimate({ ...valid, rates })).toThrow(/rate must be a finite, non-negative number/);
  });

  it("accepts valid inputs and returns finite positive totals", () => {
    const estimate = generateEstimate({ ...valid, rates: { cement: 0, steel: 100, labor: 800 } });
    expect(estimate.totalFloorArea).toBeGreaterThan(0);
    expect(Number.isFinite(estimate.totalCost)).toBe(true);
    expect(Number.isFinite(estimate.costPerSqft)).toBe(true);
    expect(estimate.totalCost).toBeGreaterThan(0);
  });
});
