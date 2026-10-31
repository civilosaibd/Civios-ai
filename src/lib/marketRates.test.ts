import { describe, expect, it } from "vitest";
import { DISTRICTS, getTodayRates, getYesterdayRates } from "./marketRates";

describe("indicative district market rates", () => {
  it("returns the same reference values for today and yesterday until verified history exists", () => {
    for (const district of DISTRICTS) {
      expect(getTodayRates(district)).toEqual(getYesterdayRates(district));
    }
  });

  it("returns a defensive copy so callers cannot mutate the baseline", () => {
    const first = getTodayRates("Dhaka");
    first.cement = -999;
    expect(getTodayRates("Dhaka").cement).toBeGreaterThan(0);
  });

  it("falls back to Dhaka for unknown district names", () => {
    expect(getTodayRates("Unknown district")).toEqual(getTodayRates("Dhaka"));
  });

  it("provides finite, non-negative values for every listed district", () => {
    for (const district of DISTRICTS) {
      for (const value of Object.values(getTodayRates(district))) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
