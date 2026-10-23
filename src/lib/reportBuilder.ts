// Professional report builder. PURE: turns the user's own saved data into a neutral report model that is
// rendered to PDF (reportPdf.ts) or HTML (reportHtml.ts). Nothing is invented: a section whose data does not exist
// is reported as skipped, and estimator numbers are labelled indicative.
import { buildBOQ, buildTimeline } from "./engineering";
import type { EstimateData } from "./estimateEngine";
import { schedule, type QAItem, type Task } from "./scheduler";
import { cashFlowSummary, billDue, billNet, invoiceDue, invoiceTotal, type Finance } from "./finance";

export type SectionId = "summary" | "estimate" | "boq" | "timeline" | "schedule" | "qa" | "defects" | "finance";
export const SECTION_IDS: SectionId[] = ["summary", "estimate", "boq", "timeline", "schedule", "qa", "defects", "finance"];
export const SECTION_LABELS: Record<SectionId, { en: string; bn: string }> = {
  summary: { en: "Project summary", bn: "প্রজেক্ট সারসংক্ষেপ" },
  estimate: { en: "Cost estimate", bn: "খরচ এস্টিমেট" },
  boq: { en: "Bill of quantities", bn: "বিল অব কোয়ান্টিটি" },
  timeline: { en: "Estimated construction timeline", bn: "আনুমানিক নির্মাণ সময়সূচি" },
  schedule: { en: "Project schedule (Scheduler)", bn: "প্রজেক্ট শিডিউল (শিডিউলার)" },
  qa: { en: "QA/QC checklist", bn: "QA/QC চেকলিস্ট" },
  defects: { en: "Defect reports", bn: "ত্রুটি রিপোর্ট" },
  finance: { en: "Finance summary", bn: "ফিন্যান্স সারসংক্ষেপ" },
};

export interface ProjectLike {
  name: string; client_name?: string | null; location?: string | null; project_type?: string | null; status?: string | null;
  start_date?: string | null; end_date?: string | null; budget?: number | string | null; estimate?: unknown;
}
export interface DefectReportLike { id?: string; date: string; summary?: string; overallRisk?: string; defects?: { type: string; severity: string; location?: string; action?: string }[] }
export interface ReportInput {
  title: string; company?: string; preparedBy?: string; notes?: string;
  project: ProjectLike | null;
  tasks: Task[] | null; qa: QAItem[] | null; defects: DefectReportLike[] | null; finance: Finance | null;
  sections: SectionId[]; now?: Date;
}
export type Block =
  | { type: "kv"; rows: [string, string][] }
  | { type: "table"; head: string[]; rows: string[][]; foot?: string[]; right?: number[] }
  | { type: "text"; text: string }
  | { type: "bullets"; items: string[] };
export interface ReportSection { id: SectionId; title: string; blocks: Block[] }
export interface ReportModel {
  title: string; company: string; preparedBy: string; generated: string; projectName: string;
  sections: ReportSection[]; skipped: { id: SectionId; reason: string }[]; disclaimer: string;
}

export const REPORT_DISCLAIMER = "Prepared with CivilOS AI from data entered or saved by the user. Cost and timeline figures from the estimator are indicative and are not a substitute for a site survey, a detailed design, or review by a licensed engineer. Verify all quantities and rates before contracting.";
export const MAX_TITLE = 120; export const MAX_NOTES = 4000; export const MAX_ROWS = 60;

const clean = (s: unknown, max: number) => (typeof s === "string" ? Array.from(s, (c) => (c.charCodeAt(0) < 32 && c !== "\n" ? " " : c)).join("").trim().slice(0, max) : "");
export const bdt = (n: number) => `BDT ${Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-US")}`;
const num = (n: number, d = 0) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: d });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "0%");
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The estimator saves EstimateData; BOQ-hub / rate-set projects store other shapes in the same column. */
export function asEstimate(e: unknown): EstimateData | null {
  const x = e as Partial<EstimateData> | null;
  if (!x || typeof x !== "object") return null;
  if (!isNum(x.totalCost) || !isNum(x.totalFloorArea) || !isNum(x.floors) || !Array.isArray(x.costBreakdown)) return null;
  if (!x.materials || typeof x.materials !== "object") return null;
  return x as EstimateData;
}
const safeBoq = (e: EstimateData) => { try { return buildBOQ(e); } catch { return null; } };

export function availability(i: Pick<ReportInput, "project" | "tasks" | "qa" | "defects" | "finance">): Record<SectionId, { ok: boolean; reason?: string }> {
  const est = i.project ? asEstimate(i.project.estimate) : null;
  const no = (reason: string) => ({ ok: false, reason });
  const boq = est ? safeBoq(est) : null;
  return {
    summary: { ok: true },
    estimate: est ? { ok: true } : no(i.project ? "This project has no saved cost estimate" : "Choose a project with a saved estimate"),
    boq: boq ? { ok: true } : no(est ? "Quantities could not be computed from this estimate" : "Choose a project with a saved estimate"),
    timeline: est ? { ok: true } : no(i.project ? "This project has no saved cost estimate" : "Choose a project with a saved estimate"),
    schedule: i.tasks?.length ? { ok: true } : no("No schedule saved yet (open the Scheduler)"),
    qa: i.qa?.length ? { ok: true } : no("No QA/QC checklist saved yet"),
    defects: i.defects?.length ? { ok: true } : no("No defect reports saved yet"),
    finance: i.finance && (i.finance.invoices.length || i.finance.bills.length || i.finance.cash.length) ? { ok: true } : no("No invoices, bills or cash entries saved yet"),
  };
}

export function buildReport(i: ReportInput): ReportModel {
  const now = i.now ?? new Date();
  const av = availability(i);
  const sections: ReportSection[] = []; const skipped: ReportModel["skipped"] = [];
  const est = i.project ? asEstimate(i.project.estimate) : null;
  const p = i.project;

  const build: Record<SectionId, () => Block[]> = {
    summary: () => {
      const rows: [string, string][] = [];
      if (p) {
        rows.push(["Project", clean(p.name, 200) || "Untitled"]);
        const add = (k: string, v: unknown) => { const t = clean(v, 200); if (t) rows.push([k, t]); };
        add("Client", p.client_name); add("Location", p.location); add("Type", p.project_type); add("Status", p.status);
        add("Start date", p.start_date); add("End date", p.end_date);
        const b = Number(p.budget); if (p.budget != null && Number.isFinite(b) && b > 0) rows.push(["Budget", bdt(b)]);
      } else rows.push(["Scope", "Workspace report (no project selected)"]);
      const blocks: Block[] = [{ type: "kv", rows }];
      const notes = clean(i.notes, MAX_NOTES); if (notes) blocks.push({ type: "text", text: notes });
      return blocks;
    },
    estimate: () => {
      const e = est!; const total = e.costBreakdown.reduce((s, c) => s + (isNum(c.amount) ? c.amount : 0), 0);
      return [
        { type: "kv", rows: [["Plot size", String(e.plotSize ?? "-")], ["Total floor area", `${num(e.totalFloorArea)} sft`], ["Floors", String(e.floors)], ["Quality", String(e.quality ?? "-")],
          ["Cost per sft", bdt(e.costPerSqft)], ["Estimated total cost", bdt(e.totalCost)], ["Estimated completion", `${num(e.completionMonths, 1)} months`]] },
        { type: "table", head: ["Cost category", "Amount", "Share"], right: [1, 2], rows: e.costBreakdown.slice(0, MAX_ROWS).map((c) => [clean(c.category, 80), bdt(c.amount), pct(c.amount, total)]), foot: ["Total", bdt(total), "100%"] },
        { type: "text", text: "Indicative estimator output based on the inputs and rates saved with the project." },
      ];
    },
    boq: () => {
      const items = safeBoq(est!)!; const total = items.reduce((s, b) => s + b.total, 0);
      return [{ type: "table", head: ["#", "Item", "Qty", "Unit", "Rate", "Amount"], right: [0, 2, 4, 5], rows: items.slice(0, MAX_ROWS).map((b, n) => [String(n + 1), b.item, num(b.qty), b.unit, bdt(b.rate), bdt(b.total)]), foot: ["", "Total", "", "", "", bdt(total)] }];
    },
    timeline: () => {
      const ph = buildTimeline(est!);
      return [{ type: "table", head: ["Phase", "Start (month)", "Duration (months)", "End (month)"], right: [1, 2, 3], rows: ph.map((t) => [t.name, num(t.startMonth, 1), num(t.durationMonths, 1), num(t.startMonth + t.durationMonths, 1)]) },
        { type: "text", text: "Typical phase sequence scaled by the number of floors; not a contractor programme." }];
    },
    schedule: () => {
      const { rows, total, cycle } = schedule(i.tasks!);
      const done = rows.reduce((s, r) => s + r.duration * Math.min(100, Math.max(0, r.progress)), 0); const dur = rows.reduce((s, r) => s + r.duration, 0);
      const blocks: Block[] = [{ type: "kv", rows: [["Tasks", String(rows.length)], ["Critical path length", `${num(total)} days`], ["Overall progress (duration-weighted)", dur > 0 ? `${Math.round(done / dur)}%` : "0%"], ["Critical tasks", String(rows.filter((r) => r.critical).length)]] }];
      if (cycle) blocks.push({ type: "text", text: "Warning: the task dependencies contain a loop, so the dates below may be unreliable." });
      blocks.push({ type: "table", head: ["WBS", "Task", "Days", "Start day", "Finish day", "Float", "Critical", "Done"], right: [2, 3, 4, 5, 7],
        rows: rows.slice(0, MAX_ROWS).map((r) => [clean(r.wbs, 20), clean(r.name, 80), num(r.duration), num(r.es), num(r.ef), num(r.float), r.critical ? "Yes" : "-", `${Math.round(r.progress)}%`]) });
      if (rows.length > MAX_ROWS) blocks.push({ type: "text", text: `Showing the first ${MAX_ROWS} of ${rows.length} tasks.` });
      return blocks;
    },
    qa: () => {
      const q = i.qa!; const done = q.filter((x) => x.done).length;
      const stages = [...new Set(q.map((x) => x.stage))];
      const blocks: Block[] = [
        { type: "kv", rows: [["Checklist items", String(q.length)], ["Completed", `${done} (${pct(done, q.length)})`], ["Open", String(q.length - done)]] },
        { type: "table", head: ["Stage", "Done", "Total", "Progress"], right: [1, 2, 3], rows: stages.map((s) => { const g = q.filter((x) => x.stage === s); const d = g.filter((x) => x.done).length; return [clean(s, 60), String(d), String(g.length), pct(d, g.length)]; }) },
      ];
      const open = q.filter((x) => !x.done);
      if (open.length) blocks.push({ type: "bullets", items: open.slice(0, MAX_ROWS).map((x) => `${clean(x.stage, 40)}: ${clean(x.en, 160)}${x.note ? ` (note: ${clean(x.note, 120)})` : ""}`) });
      return blocks;
    },
    defects: () => {
      const reps = [...i.defects!].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10);
      const blocks: Block[] = [{ type: "kv", rows: [["Reports included", `${reps.length} of ${i.defects!.length} (latest first)`]] }];
      for (const r of reps) {
        blocks.push({ type: "text", text: `${clean(String(r.date).slice(0, 10), 12)} - overall risk: ${clean(r.overallRisk, 20) || "n/a"}${r.summary ? ` - ${clean(r.summary, 300)}` : ""}` });
        if (r.defects?.length) blocks.push({ type: "table", head: ["Defect", "Severity", "Location", "Recommended action"], rows: r.defects.slice(0, 20).map((d) => [clean(d.type, 80), clean(d.severity, 20), clean(d.location, 80), clean(d.action, 200)]) });
      }
      blocks.push({ type: "text", text: "Defects were identified by AI from site photos and are AI-inferred. Confirm each finding on site before acting." });
      return blocks;
    },
    finance: () => {
      const f = i.finance!; const s = cashFlowSummary(f);
      const blocks: Block[] = [{ type: "kv", rows: [["Total inflow", bdt(s.inflow)], ["Total outflow", bdt(s.outflow)], ["Net balance", bdt(s.balance)], ["Receivable (invoices due)", bdt(s.receivable)], ["Payable (contractor bills due)", bdt(s.payable)]] }];
      if (f.invoices.length) blocks.push({ type: "table", head: ["Invoice", "Date", "Client", "Total (incl. VAT)", "Paid", "Due", "Status"], right: [3, 4, 5],
        rows: f.invoices.slice(0, MAX_ROWS).map((x) => [clean(x.no, 30), clean(x.date, 12), clean(x.client, 60), bdt(invoiceTotal(x)), bdt(x.paidAmount), bdt(invoiceDue(x)), clean(x.status, 20)]) });
      if (f.bills.length) blocks.push({ type: "table", head: ["Bill", "Date", "Contractor", "Net", "Paid", "Due", "Status"], right: [3, 4, 5],
        rows: f.bills.slice(0, MAX_ROWS).map((x) => [clean(x.no, 30), clean(x.date, 12), clean(x.contractor, 60), bdt(billNet(x)), bdt(x.paidAmount), bdt(billDue(x)), clean(x.status, 20)]) });
      return blocks;
    },
  };

  const wanted = new Set(i.sections);
  for (const id of SECTION_IDS) {
    if (!wanted.has(id)) continue;
    if (!av[id].ok) { skipped.push({ id, reason: av[id].reason ?? "No data" }); continue; }
    sections.push({ id, title: SECTION_LABELS[id].en, blocks: build[id]() });
  }
  return {
    title: clean(i.title, MAX_TITLE) || "Project Report", company: clean(i.company, 100), preparedBy: clean(i.preparedBy, 100),
    generated: now.toISOString().slice(0, 10), projectName: p ? clean(p.name, 200) : "", sections, skipped, disclaimer: REPORT_DISCLAIMER,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Saved workspace values are loose JSON (possibly from older versions or restored backups): keep only what the report can safely use. */
export function normalizeWorkspace(raw: Record<string, unknown>): Pick<ReportInput, "tasks" | "qa" | "defects" | "finance"> {
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : null);
  const tasks = arr("civilos.schedule")?.filter((t): t is Task => isObj(t) && typeof t.id === "string" && isNum(t.duration) && Array.isArray(t.deps) && (t.deps as unknown[]).every((d) => isObj(d) && typeof d.id === "string" && isNum(d.lag) && ["FS", "SS", "FF", "SF"].includes(String(d.type)))).map((t) => ({ ...t, progress: isNum(t.progress) ? t.progress : 0, wbs: String(t.wbs ?? ""), name: String(t.name ?? "") })) ?? null;
  const qa = arr("civilos.qa")?.filter((q): q is QAItem => isObj(q) && typeof q.en === "string" && typeof q.stage === "string").map((q) => ({ ...q, done: q.done === true, note: String(q.note ?? "") })) ?? null;
  const defects = arr("civilos.defects")?.filter((d): d is DefectReportLike => isObj(d) && typeof d.date === "string") ?? null;
  const f = raw["civilos.finance"];
  const list = (k: string) => (isObj(f) && Array.isArray(f[k]) ? (f[k] as unknown[]).filter(isObj) : []);
  const num0 = (o: Record<string, unknown>, ...ks: string[]) => { for (const k of ks) o[k] = isNum(o[k]) ? o[k] : 0; return o; };
  const finance = isObj(f) ? ({
    invoices: list("invoices").map((o) => num0({ no: "", date: "", client: "", status: "draft", ...o }, "amount", "vatPct", "paidAmount")),
    bills: list("bills").map((o) => num0({ no: "", date: "", contractor: "", status: "submitted", ...o }, "gross", "deductionPct", "paidAmount")),
    payments: [], cash: list("cash").map((o) => num0({ kind: "inflow", ...o }, "amount")),
  } as unknown as Finance) : null;
  return { tasks: tasks?.length ? tasks : null, qa: qa?.length ? qa : null, defects: defects?.length ? defects : null, finance };
}
