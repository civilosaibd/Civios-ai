import { describe, expect, it } from "vitest";
import { calculateConstructionTakeoff, type TakeoffInputs } from "./constructionTakeoff";

const base: TakeoffInputs = {
  excavationLength: 10, excavationWidth: 1, excavationDepth: 1,
  footingCount: 4, footingLength: 2, footingWidth: 2, footingDepth: 0.5,
  slabArea: 100, slabThickness: 0.15,
  wallLength: 20, wallHeight: 3, wallThickness: 0.2, openingArea: 5,
  plasterArea: 80, floorArea: 100, paintArea: 160, steelKgPerM3: 100,
  rates: { excavationM3: 500, concreteM3: 8000, brickworkM3: 6000, plasterM2: 250, flooringM2: 1200, paintingM2: 180, steelKg: 90 },
};

describe("construction trade takeoff", () => {
  it("calculates excavation, concrete, steel and net masonry using metric dimensions", () => {
    const result = calculateConstructionTakeoff(base);
    expect(result.lines[0].quantity).toBe(10);
    expect(result.lines[1].quantity).toBe(35);
    expect(result.lines[2].quantity).toBe(3500);
    expect(result.lines[3].quantity).toBe(11);
  });

  it("prices each BOQ line using editable rates and returns the sum", () => {
    const result = calculateConstructionTakeoff(base);
    expect(result.lines[0].amount).toBe(5000);
    expect(result.total).toBe(result.lines.reduce((sum, line) => sum + line.amount, 0));
  });

  it("rejects invalid dimensions, rates and fractional footing counts", () => {
    expect(() => calculateConstructionTakeoff({ ...base, wallHeight: -1 })).toThrow(/non-negative/);
    expect(() => calculateConstructionTakeoff({ ...base, footingCount: 2.5 })).toThrow(/whole number/);
    expect(() => calculateConstructionTakeoff({ ...base, rates: { ...base.rates, concreteM3: Number.NaN } })).toThrow(/rate/);
  });

  it("does not return negative wall quantity when openings exceed gross wall area", () => {
    const result = calculateConstructionTakeoff({ ...base, openingArea: 500 });
    expect(result.lines[3].quantity).toBe(0);
  });
});
