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

  it("does not duplicate separately itemized paint materials in the finishing allowance", () => {
    expect(estimate.materials["Paint (Interior)"]).toBeDefined();
    expect(estimate.materials["Paint (Exterior)"]).toBeDefined();
    expect(estimate.finishing).not.toHaveProperty("Interior Paint");
    expect(estimate.finishing).not.toHaveProperty("Exterior Paint");
  });

  it("applies the quality tier to itemized paint rates without creating a second paint allowance", () => {
    const makeQualityEstimate = (quality: string) => generateEstimate({
      plotLength: 40, plotWidth: 30, floors: 2, floorHeight: 10, wallThickness: 5,
      quality, projectType: "single", unit: "feet", fileName: quality,
    });
    const economy = makeQualityEstimate("economy");
    const standard = makeQualityEstimate("standard");
    const premium = makeQualityEstimate("premium");

    expect(economy.materials["Paint (Interior)"].rate).toBeLessThan(standard.materials["Paint (Interior)"].rate);
    expect(premium.materials["Paint (Interior)"].rate).toBeGreaterThan(standard.materials["Paint (Interior)"].rate);
    expect(economy.materials["Paint (Exterior)"].rate).toBeLessThan(standard.materials["Paint (Exterior)"].rate);
    expect(premium.materials["Paint (Exterior)"].rate).toBeGreaterThan(standard.materials["Paint (Exterior)"].rate);
    for (const estimate of [economy, standard, premium]) {
      expect(estimate.finishing).not.toHaveProperty("Interior Paint");
      expect(estimate.finishing).not.toHaveProperty("Exterior Paint");
      for (const key of ["Paint (Interior)", "Paint (Exterior)"]) {
        const paint = estimate.materials[key];
        expect(paint.total).toBe(paint.qty * paint.rate);
      }
    }
  });

  it("does not repeat tile installation or wall/ceiling painting as broad finishing packages", () => {
    expect(estimate.materials["Tiles"]).toBeDefined();
    expect(estimate.labor["Tiles Worker"]).toBeDefined();
    expect(estimate.materials["Paint (Interior)"]).toBeDefined();
    expect(estimate.materials["Paint (Exterior)"]).toBeDefined();
    expect(estimate.labor["Painter"]).toBeDefined();

    expect(estimate.finishing).not.toHaveProperty("Floor Finish");
    expect(estimate.finishing).not.toHaveProperty("Wall Finish");
    expect(estimate.finishing).not.toHaveProperty("Ceiling Finish");
    expect(estimate.finishing).not.toHaveProperty("Interior Paint");
    expect(estimate.finishing).not.toHaveProperty("Exterior Paint");
  });

  it("keeps the estimate breakdown aligned with the total cost", () => {
    const breakdownTotal = estimate.costBreakdown.reduce((sum, item) => sum + item.amount, 0);
    expect(breakdownTotal).toBe(estimate.totalCost);
  });

  it("keeps the material BOQ total equal to the estimator's material subtotal, not the full project cost", () => {
    const boqTotal = buildBOQ(estimate).reduce((sum, item) => sum + item.total, 0);
    const materialSubtotal = Object.values(estimate.materials).reduce((sum, item) => sum + item.total, 0);
    expect(boqTotal).toBe(materialSubtotal);
    expect(boqTotal).toBeLessThan(estimate.totalCost);
  });

  it("applies selected material and mason rate overrides to the generated estimate", () => {
    expect(estimate.materials["Cement"].rate).toBe(600);
    expect(estimate.materials["Steel Rods"].rate).toBe(110);
    expect(estimate.materials["Bricks"].rate).toBe(13);
    expect(estimate.materials["Sand"].rate).toBe(50);
    expect(estimate.materials["Stone Chips"].rate).toBe(220);
    expect(estimate.labor["Mason"].rate).toBe(850);
    expect(estimate.materials["Cement"].total).toBe(estimate.materials["Cement"].qty * 600);
  });

  it("normalizes equivalent feet and meter inputs to the same built-up area", () => {
    const feetEstimate = generateEstimate({
      plotLength: 40, plotWidth: 30, floors: 2, floorHeight: 10, wallThickness: 5,
      quality: "standard", projectType: "single", unit: "feet", fileName: "feet",
    });
    const meterEstimate = generateEstimate({
      plotLength: 12.192, plotWidth: 9.144, floors: 2, floorHeight: 3.048, wallThickness: 5,
      quality: "standard", projectType: "single", unit: "meters", fileName: "meters",
    });
    expect(meterEstimate.totalFloorArea).toBe(feetEstimate.totalFloorArea);
    expect(meterEstimate.totalCost).toBe(feetEstimate.totalCost);
  });
});
