import { describe, expect, it } from "vitest";
import { generateEstimate } from "./estimateEngine";
import { buildBOQ, buildQuotation } from "./engineering";

const estimate = generateEstimate({
  plotLength: 40,
  plotWidth: 30,
  floors: 2,
  floorHeight: 10,
  wallThickness: 5,
  quality: "standard",
  projectType: "single",
  unit: "feet",
  fileName: "BOQ test house",
  rates: { cement: 600, steel: 110, brick: 13, sand: 50, stoneChips: 220, labor: 850 },
});

describe("material BOQ and quotation consistency", () => {
  it("does not combine composite concrete/plaster work packages with constituent material lines", () => {
    const boq = buildBOQ(estimate);
    const names = boq.map((item) => item.item.toLowerCase());
    expect(names.some((name) => name.includes("rcc concrete"))).toBe(false);
    expect(names.some((name) => name === "plaster work")).toBe(false);
    expect(names).toContain("cement (50 kg bag)");
    expect(names).toContain("sand");
  });

  it("keeps every BOQ line total equal to quantity multiplied by rate", () => {
    for (const item of buildBOQ(estimate)) {
      expect(item.total).toBe(item.qty * item.rate);
    }
  });

  it("uses the engine total as the quotation base and applies profit once", () => {
    const quotation = buildQuotation(estimate);
    expect(quotation.baseProjectCost).toBe(estimate.totalCost);
    expect(quotation.profit).toBe(Math.round(estimate.totalCost * 0.1));
    expect(quotation.total).toBe(quotation.baseProjectCost + quotation.profit);
  });

  it("separates labor, civil work, and finishing in the contractor quotation", () => {
    const quotation = buildQuotation(estimate);
    const rows = Object.fromEntries(quotation.justification.map((row) => [row.label, row.amount]));
    expect(rows["Labor"]).toBe(quotation.laborCost);
    expect(rows["Civil Work"]).toBe(quotation.civilWorkCost);
    expect(rows["Finishing"]).toBe(quotation.finishingCost);
    expect(quotation.justification.reduce((sum, row) => sum + row.amount, 0)).toBe(quotation.total);
  });

  it("keeps the estimate breakdown aligned with the total cost", () => {
    const breakdownTotal = estimate.costBreakdown.reduce((sum, item) => sum + item.amount, 0);
    expect(breakdownTotal).toBe(estimate.totalCost);
  });
});
