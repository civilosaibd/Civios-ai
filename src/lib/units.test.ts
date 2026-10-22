import { describe, expect, it } from "vitest";
import { M_PER_FT, areaUnit, convertLength, displayToFt, fmtAreaSft, fmtLengthFt, ftToDisplay, isUnitSystem, lengthUnit, roundTo, sftToDisplay } from "./units";

describe("units", () => {
  it("uses the exact foot definition", () => { expect(M_PER_FT).toBe(0.3048); expect(ftToDisplay(100, "metric")).toBeCloseTo(30.48, 10); });
  it("imperial is the identity", () => { expect(ftToDisplay(40, "imperial")).toBe(40); expect(displayToFt(40, "imperial")).toBe(40); expect(sftToDisplay(1200, "imperial")).toBe(1200); });
  it("round-trips without drift", () => {
    for (const ft of [15, 30, 40, 60, 72.1, 199.9]) expect(roundTo(displayToFt(roundTo(ftToDisplay(ft, "metric"), 3), "metric"), 1)).toBeCloseTo(ft, 1);
    expect(convertLength(convertLength(40, "imperial", "metric", 4), "metric", "imperial", 3)).toBeCloseTo(40, 3);
  });
  it("known values", () => {
    expect(convertLength(40, "imperial", "metric")).toBe(12.19);
    expect(convertLength(12.19, "metric", "imperial")).toBe(39.99);
    expect(convertLength(10, "imperial", "imperial")).toBe(10);
    expect(convertLength(convertLength(40, "imperial", "metric", 3), "metric", "imperial", 2)).toBe(40); // no drift on a switch and back
    expect(sftToDisplay(2400, "metric")).toBeCloseTo(222.97, 2); // 40x60 ft plot
  });
  it("area is length squared (not length)", () => { expect(sftToDisplay(100, "metric")).toBeCloseTo(ftToDisplay(10, "metric") ** 2, 10); });
  it("labels and formatting", () => {
    expect(lengthUnit("metric")).toBe("m"); expect(lengthUnit("imperial")).toBe("ft"); expect(lengthUnit("metric", true)).toBe("মি"); expect(areaUnit("metric")).toBe("m²"); expect(areaUnit("imperial")).toBe("sft");
    expect(fmtLengthFt(10, "metric")).toBe("3.05 m"); expect(fmtLengthFt(10.04, "imperial")).toBe("10 ft"); expect(fmtAreaSft(2400, "metric")).toBe("223 m²"); expect(fmtAreaSft(2400, "imperial")).toBe("2400 sft");
  });
  it("validates a stored value", () => { expect(isUnitSystem("metric")).toBe(true); for (const v of ["", "feet", null, undefined, 1, "METRIC"]) expect(isUnitSystem(v)).toBe(false); });
});
