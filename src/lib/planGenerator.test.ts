import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT, generatePlan, parsePrompt } from "./planGenerator";

describe("parsePrompt", () => {
  it("parses English plot size, room counts, floors and road direction", () => {
    expect(parsePrompt("40x60 plot, south road, 3 bedrooms, 2 bathrooms, 5 floors"))
      .toMatchObject({ plotWidth: 40, plotDepth: 60, road: "south", bedrooms: 3, bathrooms: 2, floors: 5 });
  });
  it("parses Bangla digits and room keywords", () => {
    expect(parsePrompt("৪০x৬০ ফুট প্লট, উত্তর রাস্তা, ৩ বেডরুম, ২ বাথরুম, ৫ তলা"))
      .toMatchObject({ plotWidth: 40, plotDepth: 60, road: "north", bedrooms: 3, bathrooms: 2, floors: 5 });
  });
  it("supports metric-sized prompts and optional room preferences", () => {
    expect(parsePrompt("12 x 18 meter plot, east road, 2 bed, no kitchen, no parking"))
      .toMatchObject({ plotWidth: 12, plotDepth: 18, road: "east", bedrooms: 2, kitchen: false, parking: false });
  });
  it("clamps unreasonable values to supported ranges", () => {
    expect(parsePrompt("999x999 plot, 99 bedrooms, 99 bathrooms, 99 floors"))
      .toMatchObject({ plotWidth: 200, plotDepth: 200, bedrooms: 8, bathrooms: 8, floors: 20 });
  });
  it("preserves defaults when the brief has no recognized values", () => {
    expect(parsePrompt("make a nice family home")).toEqual(DEFAULT_INPUT);
  });
});
describe("generatePlan", () => {
  it("returns finite geometry and area metrics for the default brief", () => {
    const result = generatePlan(DEFAULT_INPUT);
    expect(result.rooms.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.footprint)).toBe(true);
    expect(Number.isFinite(result.totalBuilt)).toBe(true);
    expect(result.rooms.every((room) => [room.x, room.y, room.w, room.h].every(Number.isFinite))).toBe(true);
  });
});
