// Backup & restore of the user's OWN workspace data. Pure functions (no network), unit tested.
// Export = the user's saved tool data (`user_workspace`, keys civilos.*) + their projects.
// Import = parse + validate + sanitise; the page then writes it as the signed-in user (RLS decides what is allowed).
// A backup file is untrusted input: unknown keys are skipped, sizes are capped, and it can never carry
// ownership, sharing tokens, roles, plans, payments or referral data.

export const BACKUP_APP = "civilos-ai";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_VALUE_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECTS = 50;

type Shape = "array" | "object" | "date";
/** the only workspace sections a backup may restore, and the JSON shape each must have */
export const WORKSPACE_KEYS: Record<string, { shape: Shape; en: string; bn: string }> = {
  "civilos.plan": { shape: "object", en: "Plan generator input", bn: "প্ল্যান জেনারেটর ইনপুট" },
  "civilos.schedule": { shape: "array", en: "Schedule tasks", bn: "শিডিউল টাস্ক" },
  "civilos.qa": { shape: "array", en: "QA/QC checklist", bn: "QA/QC চেকলিস্ট" },
  "civilos.scheduleStart": { shape: "date", en: "Schedule start date", bn: "শিডিউল শুরুর তারিখ" },
  "civilos.sitePts": { shape: "array", en: "Site map points", bn: "সাইট ম্যাপ পয়েন্ট" },
  "civilos.inventory": { shape: "object", en: "Inventory & procurement", bn: "ইনভেন্টরি ও ক্রয়" },
  "civilos.equipment": { shape: "object", en: "Equipment", bn: "যন্ত্রপাতি" },
  "civilos.finance": { shape: "object", en: "Invoices & finance", bn: "ইনভয়েস ও ফিন্যান্স" },
  "civilos.defects": { shape: "array", en: "Defect reports", bn: "ত্রুটি রিপোর্ট" },
};

export interface BackupProject {
  name: string; client_name: string | null; location: string | null; project_type: string | null; status: string;
  start_date: string | null; end_date: string | null; budget: number | null; file_name: string | null;
  inputs: unknown; estimate: unknown; bnbc_loads: unknown;
}
export interface Backup {
  app: typeof BACKUP_APP; version: number; exportedAt: string;
  workspace: Record<string, unknown>; projects: BackupProject[];
}
export interface ParseResult {
  ok: boolean; error?: string; backup?: Backup;
  /** what was dropped and why (shown to the user) */
  skipped: string[];
}

const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
/** deep copy of plain JSON without prototype-pollution keys; depth and node count are capped */
export function sanitizeJson(v: unknown, depth = 0, budget = { n: 200_000 }): unknown {
  if (--budget.n < 0 || depth > 40) throw new Error("too complex");
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) return v.map((x) => sanitizeJson(x, depth + 1, budget));
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as object)) if (!DANGEROUS.has(k)) o[k] = sanitizeJson(x, depth + 1, budget);
    return o;
  }
  return null; // undefined / functions never come from JSON.parse, drop anyway
}

const jsonBytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? Array.from(v, (c) => (c.charCodeAt(0) < 32 ? " " : c)).join("").trim().slice(0, max) : null);
const dateOk = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z"); return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};
const jsonField = (v: unknown, skipped: string[], label: string): unknown => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") { skipped.push(`${label}: not an object`); return null; }
  try { const c = sanitizeJson(v); if (jsonBytes(c) > MAX_VALUE_BYTES) { skipped.push(`${label}: too large`); return null; } return c; }
  catch { skipped.push(`${label}: too complex`); return null; }
};

export function buildBackup(workspace: { key: string; value: unknown }[], projects: Record<string, unknown>[], now = new Date()): Backup {
  const ws: Record<string, unknown> = {};
  for (const r of workspace) if (r.key in WORKSPACE_KEYS) ws[r.key] = r.value;
  const out: BackupProject[] = projects.slice(0, MAX_PROJECTS * 4).map((p) => ({
    name: String(p.name ?? "Untitled"), client_name: (p.client_name as string) ?? null, location: (p.location as string) ?? null,
    project_type: (p.project_type as string) ?? null, status: String(p.status ?? "active"),
    start_date: (p.start_date as string) ?? null, end_date: (p.end_date as string) ?? null,
    budget: typeof p.budget === "number" ? p.budget : p.budget != null ? Number(p.budget) : null, file_name: (p.file_name as string) ?? null,
    inputs: p.inputs ?? null, estimate: p.estimate ?? null, bnbc_loads: p.bnbc_loads ?? null,
  }));
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), workspace: ws, projects: out };
}

export function parseBackup(text: string): ParseResult {
  const skipped: string[] = [];
  const fail = (error: string): ParseResult => ({ ok: false, error, skipped });
  if (typeof text !== "string" || !text.trim()) return fail("The file is empty.");
  if (text.length > MAX_BACKUP_BYTES) return fail("The file is too large (max 5 MB).");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text) as Record<string, unknown>; } catch { return fail("This is not a valid backup file (not JSON)."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.app !== BACKUP_APP) return fail("This file is not a CivilOS AI backup.");
  if (raw.version !== BACKUP_VERSION) return fail(`Unsupported backup version (${String(raw.version)}). Expected ${BACKUP_VERSION}.`);

  const workspace: Record<string, unknown> = {};
  const wsIn = (raw.workspace && typeof raw.workspace === "object" && !Array.isArray(raw.workspace) ? raw.workspace : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(wsIn)) {
    const spec = Object.prototype.hasOwnProperty.call(WORKSPACE_KEYS, k) ? WORKSPACE_KEYS[k] : undefined;
    if (!spec) { skipped.push(`"${k.slice(0, 40)}": not a restorable section`); continue; }
    const okShape = spec.shape === "array" ? Array.isArray(v) : spec.shape === "date" ? dateOk(v) !== null : !!v && typeof v === "object" && !Array.isArray(v);
    if (!okShape) { skipped.push(`${k}: wrong format`); continue; }
    try {
      const c = spec.shape === "date" ? v : sanitizeJson(v);
      if (jsonBytes(c) > MAX_VALUE_BYTES) { skipped.push(`${k}: too large`); continue; }
      workspace[k] = c;
    } catch { skipped.push(`${k}: too complex`); }
  }

  const projects: BackupProject[] = [];
  const pIn: unknown[] = Array.isArray(raw.projects) ? raw.projects : [];
  if (pIn.length > MAX_PROJECTS) skipped.push(`Only the first ${MAX_PROJECTS} of ${pIn.length} projects are imported.`);
  pIn.slice(0, MAX_PROJECTS).forEach((pr, i) => {
    const p = (pr && typeof pr === "object" ? pr : {}) as Record<string, unknown>;
    const name = str(p.name, 200);
    if (!name) { skipped.push(`Project #${i + 1}: no name`); return; }
    const b = typeof p.budget === "number" && Number.isFinite(p.budget) && p.budget >= 0 && p.budget < 1e13 ? p.budget : null;
    const sd = dateOk(p.start_date), ed = dateOk(p.end_date);
    if (p.start_date && !sd) skipped.push(`${name}: invalid start date ignored`);
    if (p.end_date && !ed) skipped.push(`${name}: invalid end date ignored`);
    projects.push({
      name, client_name: str(p.client_name, 200), location: str(p.location, 300), project_type: str(p.project_type, 100),
      status: typeof p.status === "string" && /^[a-z_-]{1,30}$/i.test(p.status) ? p.status.toLowerCase() : "active",
      start_date: sd, end_date: ed, budget: b, file_name: str(p.file_name, 200),
      inputs: jsonField(p.inputs, skipped, `${name} / inputs`), estimate: jsonField(p.estimate, skipped, `${name} / estimate`), bnbc_loads: jsonField(p.bnbc_loads, skipped, `${name} / loads`),
    });
  });
  if (!Object.keys(workspace).length && !projects.length) return { ok: false, error: "The backup contains nothing that can be restored.", skipped };
  return { ok: true, skipped, backup: { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt.slice(0, 40) : "", workspace, projects } };
}
