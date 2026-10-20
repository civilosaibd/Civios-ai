// Supabase access for the visualization module. All writes go through RLS; the analysis job is
// started via the `viz-analyze` edge function and is READ-ONLY from the browser.
import { supabase } from "@/integrations/supabase/client";
import type { BuildingModel } from "./types";
import { DEFAULT_LIMITS, type UploadLimits } from "./validate";
import type { StoredAnalysis } from "./workflow";

// The generated Database types predate these tables → use an untyped handle in ONE place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export const BUCKET = "visualization-files";

export type VizStatus = "draft" | "analyzing" | "needs_review" | "verified" | "generated" | "failed";
export interface VizRow {
  id: string; project_id: string | null; user_id: string; name: string; status: VizStatus;
  building_type: string | null; floor_count: number | null; approx_area_sqft: number | null; location: string | null;
  unit_system: "metric" | "imperial"; source_type: string | null; analysis: StoredAnalysis | null; model: BuildingModel | null;
  settings: Record<string, unknown>; created_at: string; updated_at: string;
}
export interface VizFile {
  id: string; visualization_id: string; file_url: string; file_name: string; file_type: "image" | "pdf" | "dxf" | "dwg";
  file_size: number; width: number | null; height: number | null; role: "source" | "derived"; derived_from: string | null;
  processing_status: string; error: string | null; created_at: string;
}
export interface JobStep { key: string; label: string; status: "pending" | "running" | "done" | "error" | "skipped"; detail?: string; at?: string }
export interface VizJob { id: string; visualization_id: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; steps: JobStep[]; error: string | null; attempt: number; created_at: string; finished_at: string | null }

const fail = (e: { message?: string } | null, fallback: string): never => { throw new Error(e?.message || fallback); };

export async function getLimits(): Promise<UploadLimits> {
  const { data } = await db.from("app_settings").select("key,value").like("key", "viz.%");
  const m = new Map<string, unknown>((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const n = (k: string, d: number) => { const v = Number(m.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
  return { maxFileMb: Math.min(50, n("viz.max_file_mb", DEFAULT_LIMITS.maxFileMb)), maxFiles: n("viz.max_files", DEFAULT_LIMITS.maxFiles) };
}

export async function listVisualizations(projectId?: string | null): Promise<VizRow[]> {
  let q = db.from("construction_visualizations").select("id,project_id,user_id,name,status,building_type,floor_count,source_type,unit_system,created_at,updated_at,settings,approx_area_sqft,location").order("updated_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q; if (error) fail(error, "Could not load visualizations");
  return data as VizRow[];
}
export async function getVisualization(id: string): Promise<VizRow> {
  const { data, error } = await db.from("construction_visualizations").select("*").eq("id", id).single();
  if (error) fail(error, "Visualization not found"); return data as VizRow;
}
export async function createVisualization(v: { name: string; project_id?: string | null; building_type?: string | null; floor_count?: number | null; approx_area_sqft?: number | null; location?: string | null; unit_system?: "metric" | "imperial" }): Promise<VizRow> {
  const { data: u } = await supabase.auth.getUser(); if (!u.user) throw new Error("Please sign in.");
  const { data, error } = await db.from("construction_visualizations").insert({ ...v, user_id: u.user.id }).select("*").single();
  if (error) fail(error, "Could not create visualization"); return data as VizRow;
}
export async function updateVisualization(id: string, patch: Partial<Omit<VizRow, "id" | "user_id" | "created_at" | "updated_at">>) {
  const { error } = await db.from("construction_visualizations").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error, "Could not save changes");
}
export async function deleteVisualization(id: string) {
  const files = await listFiles(id);
  if (files.length) await supabase.storage.from(BUCKET).remove(files.map((f) => f.file_url));
  const { error } = await db.from("construction_visualizations").delete().eq("id", id);
  if (error) fail(error, "Could not delete");
}
/** Duplicate settings + the verified model (not the uploaded files). */
export async function duplicateVisualization(id: string): Promise<VizRow> {
  const src = await getVisualization(id);
  const copy = await createVisualization({ name: `${src.name} (copy)`, project_id: src.project_id, building_type: src.building_type, floor_count: src.floor_count, approx_area_sqft: src.approx_area_sqft, location: src.location, unit_system: src.unit_system });
  if (src.model) await updateVisualization(copy.id, { model: src.model, status: "generated", source_type: src.source_type, settings: src.settings });
  return copy;
}

export async function listFiles(vizId: string): Promise<VizFile[]> {
  const { data, error } = await db.from("visualization_files").select("*").eq("visualization_id", vizId).order("created_at");
  if (error) fail(error, "Could not load files"); return data as VizFile[];
}

export async function uploadFile(vizId: string, blob: Blob, meta: { name: string; type: VizFile["file_type"]; width?: number | null; height?: number | null; role?: "source" | "derived"; derivedFrom?: string | null }): Promise<VizFile> {
  const { data: u } = await supabase.auth.getUser(); if (!u.user) throw new Error("Please sign in.");
  const ext = meta.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${vizId}/${crypto.randomUUID()}.${meta.role === "derived" ? "jpg" : ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined, upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await db.from("visualization_files").insert({
    visualization_id: vizId, user_id: u.user.id, file_url: path, file_name: meta.name, file_type: meta.type, file_size: blob.size,
    width: meta.width ?? null, height: meta.height ?? null, role: meta.role ?? "source", derived_from: meta.derivedFrom ?? null,
  }).select("*").single();
  if (error) { await supabase.storage.from(BUCKET).remove([path]); fail(error, "Could not register file"); }
  return data as VizFile;
}
export async function removeFile(f: VizFile) {
  // derived copies are cascade-deleted with their source row; remove their blobs too
  const all = await listFiles(f.visualization_id);
  const doomed = [f, ...all.filter((x) => x.derived_from === f.id)];
  const { error } = await db.from("visualization_files").delete().eq("id", f.id); if (error) fail(error, "Could not remove file");
  await supabase.storage.from(BUCKET).remove(doomed.map((d) => d.file_url));
}
export async function signedUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(error?.message || "Could not open file"); return data.signedUrl;
}
export async function downloadText(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Could not read file"); return await data.text();
}

// ---- jobs ------------------------------------------------------------------------------------
export async function startAnalysis(vizId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("viz-analyze", { body: { visualization_id: vizId } });
  if (error) {
    // surface the function's own message when it sent one
    try { const j = await (error as { context?: Response }).context?.json?.(); if (j?.error) throw new Error(j.error); } catch (e) { if (e instanceof Error && e.message) throw e; }
    throw new Error("Could not start analysis. The analysis service may not be deployed yet.");
  }
  if (!data?.job_id) throw new Error("Analysis did not start."); return data.job_id as string;
}
export async function getJob(id: string): Promise<VizJob> {
  const { data, error } = await db.from("visualization_jobs").select("*").eq("id", id).single();
  if (error) fail(error, "Job not found"); return data as VizJob;
}
export async function latestJob(vizId: string): Promise<VizJob | null> {
  const { data } = await db.from("visualization_jobs").select("*").eq("visualization_id", vizId).order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as VizJob) ?? null;
}
export async function cancelJob(id: string) { const { error } = await db.rpc("cancel_viz_job", { _job: id }); if (error) fail(error, "Could not cancel"); }

/** Poll the real job row until it ends. Cancel with the returned AbortController. */
export function watchJob(id: string, onUpdate: (j: VizJob) => void, intervalMs = 1500): () => void {
  let stop = false;
  (async () => {
    let misses = 0;
    while (!stop) {
      try { const j = await getJob(id); misses = 0; onUpdate(j); if (["succeeded", "failed", "cancelled"].includes(j.status)) return; }
      catch { if (++misses > 5) return; }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();
  return () => { stop = true; };
}

// ---- verified model → rows ---------------------------------------------------------------------
export function elementRows(vizId: string, m: BuildingModel) {
  const fl = (f: number | "all") => (f === "all" ? null : f);
  const out: { visualization_id: string; element_type: string; floor: number | null; geometry_data: unknown; confidence: number; source: string; user_verified: boolean }[] = [];
  const add = (type: string, arr: { floor?: number | "all"; confidence: number; source: string; verified: boolean }[]) =>
    arr.forEach((e) => out.push({ visualization_id: vizId, element_type: type, floor: e.floor === undefined ? null : fl(e.floor), geometry_data: e, confidence: Math.min(1, Math.max(0, e.confidence)), source: e.source, user_verified: !!e.verified }));
  add("wall", m.walls); add("door", m.doors); add("window", m.windows); add("column", m.columns);
  add("stair", m.stairs); add("balcony", m.balconies); add("room", m.rooms);
  return out;
}

/** Save the user-verified model + replace the detected_elements snapshot. */
export async function saveVerifiedModel(vizId: string, m: BuildingModel, patch: Partial<VizRow> = {}) {
  await updateVisualization(vizId, { model: m, status: "generated", floor_count: m.floors, building_type: m.buildingType, unit_system: m.unitSystem, source_type: m.sourceType, ...patch });
  const { error: de } = await db.from("detected_elements").delete().eq("visualization_id", vizId); if (de) fail(de, "Could not refresh elements");
  const rows = elementRows(vizId, m);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("detected_elements").insert(rows.slice(i, i + 200)); if (error) fail(error, "Could not save elements");
  }
}
