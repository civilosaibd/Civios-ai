import { describe, expect, it } from "vitest";
import { buildBOQ, buildQuotation, buildTimeline } from "./engineering";
import { generateEstimate } from "./estimateEngine";

const makeEstimate = (overrides: Partial<Parameters<typeof generateEstimate>[0]> = {}) =>
  generateEstimate({
    plotLength: 40,
    plotWidth: 30,
    unit: "feet",
    floors: 2,
    floorHeight: 10,
    wallThickness: 5,
    projectType: "single",
    quality: "standard",
    fileName: "QA Residence",
    ...overrides,
  });

const isFiniteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

describe("estimate export quality invariants", () => {
  it("generates a positive finite project summary", () => {
    const estimate = makeEstimate();
    expect(estimate.totalFloorArea).toBeGreaterThan(0);
    expect(estimate.totalCost).toBeGreaterThan(0);
    expect(estimate.floors).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(estimate.costPerSqft)).toBe(true);
    expect(estimate.projectName).toBe("QA Residence");
  });

  it("keeps material quantity, rate, and amount finite and non-negative", () => {
    const estimate = makeEstimate();
    for (const [name, material] of Object.entries(estimate.materials)) {
      expect(isFiniteNonNegative(material.qty), `${name}: quantity`).toBe(true);
      expect(isFiniteNonNegative(material.rate), `${name}: rate`).toBe(true);
      expect(isFiniteNonNegative(material.total), `${name}: amount`).toBe(true);
      expect(material.total).toBeCloseTo(material.qty * material.rate, 0);
    }
  });

  it("produces BOQ rows with valid numeric fields and row arithmetic", () => {
    const boq = buildBOQ(makeEstimate());
    expect(boq.length).toBeGreaterThan(0);
    for (const row of boq) {
      expect(row.item.trim().length).toBeGreaterThan(0);
      expect(row.unit.trim().length).toBeGreaterThan(0);
      expect(isFiniteNonNegative(row.qty), `${row.item}: quantity`).toBe(true);
      expect(isFiniteNonNegative(row.rate), `${row.item}: rate`).toBe(true);
      expect(isFiniteNonNegative(row.total), `${row.item}: amount`).toBe(true);
      expect(row.total).toBeCloseTo(row.qty * row.rate, 0);
    }
  });

  it("keeps quotation total equal to base cost plus one profit amount", () => {
    const quotation = buildQuotation(makeEstimate());
    expect(isFiniteNonNegative(quotation.baseProjectCost)).toBe(true);
    expect(isFiniteNonNegative(quotation.profit)).toBe(true);
    expect(quotation.total).toBe(quotation.baseProjectCost + quotation.profit);
    expect(quotation.profit).toBe(Math.round(quotation.baseProjectCost * 0.1));
    expect(quotation.justification.some((line) => line.label === "Contractor Profit" && line.amount === quotation.profit)).toBe(true);
  });

  it("generates a usable timeline with finite non-negative phases", () => {
    const timeline = buildTimeline(makeEstimate());
    expect(timeline.length).toBeGreaterThan(0);
    for (const phase of timeline) {
      expect(phase.name.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(phase.startMonth) && phase.startMonth >= 0, phase.name).toBe(true);
      expect(Number.isFinite(phase.durationMonths) && phase.durationMonths > 0, phase.name).toBe(true);
      expect(phase.color.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns deterministic report inputs for identical parameters", () => {
    const first = makeEstimate();
    const second = makeEstimate();
    expect(second.totalCost).toBe(first.totalCost);
    expect(buildBOQ(second)).toEqual(buildBOQ(first));
    expect(buildQuotation(second)).toEqual(buildQuotation(first));
    expect(buildTimeline(second)).toEqual(buildTimeline(first));
  });

  it("applies a supported material rate override to generated costs", () => {
    const baseline = makeEstimate();
    const adjusted = makeEstimate({ rates: { cement: 700 } });
    expect(adjusted.materials.Cement.rate).toBe(700);
    expect(adjusted.materials.Cement.total).toBeGreaterThan(baseline.materials.Cement.total);
    expect(adjusted.totalCost).not.toBe(baseline.totalCost);
  });
});
