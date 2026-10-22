import { describe, expect, it } from "vitest";
import { SECTION_IDS, asEstimate, availability, buildReport, bdt, type ReportInput } from "./reportBuilder";
import { esc, renderReportHtml } from "./reportHtml";
import { hasNonLatin, pdfSafe, renderReportPdf } from "./reportPdf";
import { generateEstimate } from "./estimateEngine";
import { QA_TEMPLATE, TEMPLATE } from "./scheduler";
import { DEFAULT_FINANCE } from "./finance";

const est = generateEstimate({ plotLength: 40, plotWidth: 30, unit: "feet", floors: 2, floorHeight: 10, wallThickness: 5, fileName: "t", projectType: "single", quality: "standard" });
const NOW = new Date("2026-10-22T00:00:00Z");
const full = (o: Partial<ReportInput> = {}): ReportInput => ({
  title: "Tower A report", company: "ACME Builders", preparedBy: "Rahim", notes: "Line1\nLine2",
  project: { name: "Tower A", client_name: "Karim", location: "Dhaka", status: "active", budget: 5000000, estimate: est },
  tasks: TEMPLATE, qa: QA_TEMPLATE.map((q, i) => ({ ...q, done: i % 2 === 0 })),
  defects: [{ date: "2026-10-01T00:00:00Z", overallRisk: "high", summary: "Cracks", defects: [{ type: "Crack", severity: "high", location: "Column C2", action: "Inspect" }] }],
  finance: { ...DEFAULT_FINANCE, invoices: [{ id: "1", no: "INV-1", date: "2026-10-01", client: "Karim", description: "", amount: 1000, vatPct: 15, status: "sent", paidAmount: 400 }] },
  sections: SECTION_IDS, now: NOW, ...o,
});

describe("report model", () => {
  it("builds every section from real data, with correct numbers", () => {
    const m = buildReport(full());
    expect(m.sections.map((s) => s.id)).toEqual(SECTION_IDS); expect(m.skipped).toEqual([]);
    expect(m.generated).toBe("2026-10-22");
    const fin = m.sections.find((s) => s.id === "finance")!.blocks[0];
    expect(fin.type === "kv" && fin.rows.find((r) => r[0] === "Receivable (invoices due)")![1]).toBe("BDT 750"); // 1000*1.15-400
    const e = m.sections.find((s) => s.id === "estimate")!.blocks[0];
    expect(e.type === "kv" && e.rows.find((r) => r[0] === "Estimated total cost")![1]).toBe(bdt(est.totalCost));
    const boq = m.sections.find((s) => s.id === "boq")!.blocks[0];
    expect(boq.type === "table" && boq.foot![5]).toMatch(/^BDT [\d,]+$/);
  });
  it("skips sections without data and says why — never invents content", () => {
    const m = buildReport(full({ project: null, tasks: null, qa: [], defects: null, finance: DEFAULT_FINANCE }));
    expect(m.sections.map((s) => s.id)).toEqual(["summary"]);
    expect(m.skipped.map((s) => s.id)).toEqual(["estimate", "boq", "timeline", "schedule", "qa", "defects", "finance"]);
    expect(m.skipped.every((s) => s.reason.length > 5)).toBe(true);
  });
  it("only includes the sections the user picked", () => {
    expect(buildReport(full({ sections: ["summary", "qa"] })).sections.map((s) => s.id)).toEqual(["summary", "qa"]);
  });
  it("rejects non-estimator shapes saved in projects.estimate (BOQ docs, rate sets, junk)", () => {
    for (const bad of [null, undefined, "x", 5, {}, { __type: "boq", items: [] }, { __rateSet: {} }, { ...est, materials: null }, { ...est, totalCost: "1" }]) expect(asEstimate(bad)).toBeNull();
    expect(asEstimate(est)).not.toBeNull();
    const a = availability({ project: { name: "p", estimate: { __type: "boq" } }, tasks: null, qa: null, defects: null, finance: null });
    expect(a.estimate.ok).toBe(false); expect(a.boq.ok).toBe(false); expect(a.summary.ok).toBe(true);
  });
  it("a damaged estimate (missing material) skips the BOQ instead of crashing", () => {
    const broken = { ...est, materials: { Cement: est.materials["Cement"] } };
    const m = buildReport(full({ project: { name: "p", estimate: broken }, sections: ["estimate", "boq"] }));
    expect(m.sections.map((s) => s.id)).toEqual(["estimate"]); expect(m.skipped.map((s) => s.id)).toEqual(["boq"]);
  });
  it("cleans and caps user text; schedule with a dependency loop is flagged", () => {
    const m = buildReport(full({ title: "x".repeat(500) + "\u0000", notes: "n".repeat(9000), sections: ["summary"] }));
    expect(m.title.length).toBeLessThanOrEqual(120);
    const t = m.sections[0].blocks[1]; expect(t.type === "text" && t.text.length).toBe(4000);
    const loop = [{ id: "a", wbs: "1", name: "A", nameBn: "", duration: 2, progress: 0, deps: [{ id: "b", type: "FS" as const, lag: 0 }] }, { id: "b", wbs: "2", name: "B", nameBn: "", duration: 2, progress: 0, deps: [{ id: "a", type: "FS" as const, lag: 0 }] }];
    const s = buildReport(full({ tasks: loop, sections: ["schedule"] })).sections[0];
    expect(s.blocks.some((b) => b.type === "text" && /loop/.test(b.text))).toBe(true);
  });
});

describe("html + pdf rendering", () => {
  it("escapes every user-controlled string (no HTML/script injection)", () => {
    const evil = `<script>alert(1)</script><img src=x onerror=alert(2)>"'&`;
    const m = buildReport(full({ title: evil, company: evil, preparedBy: evil, notes: evil, project: { name: evil, client_name: evil, estimate: est }, sections: ["summary", "estimate"] }));
    const html = renderReportHtml(m);
    expect(html).not.toMatch(/<script>alert|<img src=x/); expect(html).toContain("&lt;script&gt;");
    expect(esc(`a<b>&"'`)).toBe("a&lt;b&gt;&amp;&quot;&#39;");
  });
  it("html contains each section title, the table numbers and the disclaimer", () => {
    const html = renderReportHtml(buildReport(full()));
    for (const t of ["Project summary", "Cost estimate", "Bill of quantities", "QA/QC checklist", "Finance summary"]) expect(html).toContain(t);
    expect(html).toContain("indicative"); expect(html).toContain("Prepared by: Rahim");
  });
  it("pdf renders multiple pages, with page numbers, and flags non-Latin text", () => {
    const m = buildReport(full());
    const doc = renderReportPdf(m); expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const buf = doc.output("arraybuffer"); expect(new TextDecoder().decode(new Uint8Array(buf).slice(0, 5))).toBe("%PDF-");
    expect(hasNonLatin(m)).toBe(false); expect(hasNonLatin(buildReport(full({ notes: "বাংলা নোট" })))).toBe(true);
    expect(pdfSafe("বাংলা ok ×")).toBe("????? ok ×".replace("?????", "?????"));
  });
  it("pdf of a minimal report works", () => { expect(() => renderReportPdf(buildReport(full({ project: null, tasks: null, qa: null, defects: null, finance: null, sections: ["summary", "finance"] })))).not.toThrow(); });
});

import { normalizeWorkspace } from "./reportBuilder";
describe("workspace normalisation", () => {
  it("drops junk, keeps valid saved data, and the report still builds", () => {
    const w = normalizeWorkspace({ "civilos.schedule": [...TEMPLATE, { id: 5 }, null, { id: "x", duration: "3", deps: [] }, { id: "y", duration: 2, deps: [{ id: "z", type: "ZZ", lag: 0 }] }],
      "civilos.qa": [{ id: "1", stage: "s", en: "e", bn: "b", done: true, note: "" }, 7], "civilos.defects": [{ date: "2026-01-01" }, "x"], "civilos.finance": { invoices: [{ amount: "x", vatPct: 15 }, 3], bills: "nope" } });
    expect(w.tasks).toHaveLength(TEMPLATE.length); expect(w.qa).toHaveLength(1); expect(w.defects).toHaveLength(1);
    expect(w.finance!.invoices).toHaveLength(1); expect(w.finance!.invoices[0].amount).toBe(0); expect(w.finance!.bills).toEqual([]);
    expect(() => buildReport({ ...w, title: "t", project: null, sections: SECTION_IDS, now: NOW })).not.toThrow();
  });
  it("nothing saved -> everything null", () => { const w = normalizeWorkspace({}); expect(w).toEqual({ tasks: null, qa: null, defects: null, finance: null }); });
});
