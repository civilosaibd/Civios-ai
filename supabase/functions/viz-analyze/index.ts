import { checkAiEndpointRateLimit } from "../_shared/aiRateLimit.ts";
import { consumeAiCredit } from "../_shared/aiUsageQuota.ts";
import { requirePlanFeature } from "../_shared/planFeatureAccess.ts";
// viz-analyze — asynchronous drawing analysis job for the 3D Construction Visualization module.
//
//   POST { visualization_id }  →  202 { job_id }   (work continues in the background)
//
// * JWT is verified by the platform AND re-checked here; the caller must have WRITE access to the visualization
//   (owner, or Admin/Engineer of the linked project) — enforced through the same SQL helpers as RLS.
// * The browser can only READ the `visualization_jobs` row; every state change below is written with the
//   service role, so the progress the UI shows is the real job state.
// * AI output is untrusted: it is normalised/clamped by ./normalize.ts. Nothing is invented here.
// * DXF files are parsed deterministically in the browser; DWG is unsupported (convert to DXF). PDFs are
//   rasterised in the browser (role='derived') so the model always sees an image of known pixel size.
import { createClient } from "npm:@supabase/supabase-js@2";
import { RASTER_SYSTEM_PROMPT, normalizeRasterAnalysis, sniffMatches, type RasterAnalysis } from "./normalize.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: cors });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MODEL = "google/gemini-2.5-pro";
const AI_TIMEOUT_MS = 100_000;
const MAX_AI_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILES_PER_JOB = 4;

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
interface Step { key: string; label: string; status: StepStatus; detail?: string; at?: string }

const FRIENDLY: Record<string, string> = {
  timeout: "The AI analysis timed out. Try again, or upload a smaller / clearer image.",
  rate: "The AI service is busy (rate limit). Please retry in a minute.",
  credits: "AI credits are exhausted. Please contact the administrator.",
  gateway: "The AI service returned an error. Please retry.",
  json: "The AI returned an unreadable result. Please retry or use a clearer drawing.",
};
class JobError extends Error { constructor(public code: string, msg?: string) { super(msg ?? FRIENDLY[code] ?? code); } }

const b64 = (buf: Uint8Array) => { let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };

async function callModel(apiKey: string, dataUrl: string, hint: string): Promise<unknown> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), AI_TIMEOUT_MS);
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST", signal: ctl.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: RASTER_SYSTEM_PROMPT },
            { role: "user", content: [{ type: "text", text: hint }, { type: "image_url", image_url: { url: dataUrl } }] },
          ],
        }),
      });
      if (resp.status === 402) throw new JobError("credits");
      if ((resp.status === 429 || resp.status >= 500) && attempt === 1) { await new Promise((r) => setTimeout(r, 2500)); continue; }
      if (resp.status === 429) throw new JobError("rate");
      if (!resp.ok) throw new JobError("gateway");
      const data = await resp.json();
      const raw = data?.choices?.[0]?.message?.content;
      if (typeof raw !== "string") throw new JobError("json");
      try { return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { throw new JobError("json"); }
    } catch (e) {
      if (e instanceof JobError) throw e;
      if ((e as Error).name === "AbortError") { if (attempt === 1) continue; throw new JobError("timeout"); }
      throw new JobError("gateway");
    } finally { clearTimeout(t); }
  }
  throw new JobError("gateway");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!, anonKey = Deno.env.get("SUPABASE_ANON_KEY")!, svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI service is not configured" }, 503);

  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Please sign in." }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const vizId = body?.visualization_id;
  if (typeof vizId !== "string" || !UUID.test(vizId)) return json({ error: "visualization_id (uuid) required" }, 400);

  const planAccess = await requirePlanFeature(user.id, "ai_drawing");
  if (planAccess) return json({ error: planAccess.message }, planAccess.status);

  const db = createClient(url, svcKey);
  const { data: canWrite } = await db.rpc("viz_can_write", { _viz: vizId, _user: user.id });
  if (!canWrite) return json({ error: "Visualization not found" }, 404); // don't reveal existence

  // one running job per visualization
  const { data: running } = await db.from("visualization_jobs").select("id, created_at").eq("visualization_id", vizId).in("status", ["queued", "running"]).gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString()).limit(1);
  if (running?.length) return json({ job_id: running[0].id, already_running: true }, 202);

  const rateLimit = await checkAiEndpointRateLimit(user.id, "viz-analyze");
  if (rateLimit) return json({ error: rateLimit.message }, rateLimit.status);
    const creditQuota = await consumeAiCredit(user.id);
    if (creditQuota) return json({ error: creditQuota.message }, creditQuota.status);


  const { count: prev } = await db.from("visualization_jobs").select("id", { count: "exact", head: true }).eq("visualization_id", vizId);
  const steps: Step[] = [
    { key: "validate", label: "Validate files", status: "pending" },
    { key: "analyze", label: "Detect elements, labels & dimensions", status: "pending" },
    { key: "assemble", label: "Assemble analysis for review", status: "pending" },
  ];
  const { data: job, error: jobErr } = await db.from("visualization_jobs").insert({ visualization_id: vizId, user_id: user.id, status: "running", steps, attempt: (prev ?? 0) + 1 }).select("id").single();
  if (jobErr || !job) return json({ error: "Could not start job" }, 500);
  await db.from("construction_visualizations").update({ status: "analyzing" }).eq("id", vizId);

  const jobId = job.id as string;
  const isCancelled = async () => (await db.from("visualization_jobs").select("status").eq("id", jobId).single()).data?.status === "cancelled";
  const setStep = async (key: string, status: StepStatus, detail?: string) => {
    const s = steps.find((x) => x.key === key)!; s.status = status; s.detail = detail; s.at = new Date().toISOString();
    await db.from("visualization_jobs").update({ steps }).eq("id", jobId).neq("status", "cancelled");
  };
  const fail = async (e: unknown) => {
    const msg = e instanceof JobError ? e.message : "Analysis failed unexpectedly. Please retry.";
    if (!(e instanceof JobError)) console.error("viz-analyze", (e as Error)?.message);
    const cur = steps.find((s) => s.status === "running"); if (cur) { cur.status = "error"; cur.detail = msg; }
    await db.from("visualization_jobs").update({ status: "failed", error: msg, steps, finished_at: new Date().toISOString() }).eq("id", jobId).neq("status", "cancelled");
    await db.from("construction_visualizations").update({ status: "failed" }).eq("id", vizId);
  };

  const run = async () => {
    try {
      // 1 — validate
      await setStep("validate", "running");
      const [{ data: viz }, { data: files }, { data: setting }] = await Promise.all([
        db.from("construction_visualizations").select("name, building_type, floor_count, unit_system").eq("id", vizId).single(),
        db.from("visualization_files").select("*").eq("visualization_id", vizId).order("created_at"),
        db.from("app_settings").select("value").eq("key", "viz.max_file_mb").maybeSingle(),
      ]);
      const maxBytes = (Number(setting?.value) || 25) * 1024 * 1024;
      const all = files ?? [];
      const hasDerived = new Set(all.filter((f) => f.role === "derived").map((f) => f.derived_from));
      // an image that has a derived (downscaled / rasterised) copy is represented by that copy
      const candidates = all.filter((f) => f.file_type === "image" && !hasDerived.has(f.id));
      const unsupported = all.filter((f) => f.file_type === "dwg" || (f.file_type === "pdf" && !hasDerived.has(f.id)));
      for (const f of unsupported) await db.from("visualization_files").update({ processing_status: "unsupported", error: f.file_type === "dwg" ? "DWG cannot be read. Export the drawing as ASCII DXF and upload that." : "PDF page could not be rasterised." }).eq("id", f.id);
      if (!candidates.length) throw new JobError("validate", "No analysable image was found. Upload a JPG/PNG/WEBP plan, a PDF, or a DXF (DXF is analysed in the browser).");
      const use = candidates.slice(0, MAX_FILES_PER_JOB);
      const warnings: string[] = [];
      if (candidates.length > use.length) warnings.push(`Only the first ${MAX_FILES_PER_JOB} images were analysed.`);
      if (unsupported.some((f) => f.file_type === "dwg")) warnings.push("DWG files were skipped — export to DXF to use CAD geometry.");

      const blobs: { f: any; bytes: Uint8Array }[] = [];
      for (const f of use) {
        if (f.file_size > maxBytes) throw new JobError("validate", `"${f.file_name}" is larger than the allowed ${Math.round(maxBytes / 1048576)} MB.`);
        if (f.file_size > MAX_AI_IMAGE_BYTES) throw new JobError("validate", `"${f.file_name}" is too large for AI analysis (max 8 MB). Export a smaller image.`);
        if (f.width && f.height && Math.min(f.width, f.height) < 500) warnings.push(`"${f.file_name}" is low resolution (${f.width}×${f.height}); detection may be unreliable.`);
        const { data: blob, error } = await db.storage.from("visualization-files").download(f.file_url);
        if (error || !blob) throw new JobError("validate", `"${f.file_name}" could not be read from storage.`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!sniffMatches("image", bytes)) { await db.from("visualization_files").update({ processing_status: "failed", error: "File content does not match an image format." }).eq("id", f.id); throw new JobError("validate", `"${f.file_name}" is corrupted or not a real image.`); }
        blobs.push({ f, bytes });
      }
      await setStep("validate", "done", `${blobs.length} image(s) OK`);
      if (await isCancelled()) return;

      // 2 — analyse (real model call per image)
      await setStep("analyze", "running", `0/${blobs.length}`);
      const results: { file_id: string; name: string; width: number | null; height: number | null; analysis: RasterAnalysis }[] = [];
      let i = 0;
      for (const { f, bytes } of blobs) {
        if (await isCancelled()) return;
        await db.from("visualization_files").update({ processing_status: "processing" }).eq("id", f.id);
        const mime = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : "image/webp";
        const hint = `Drawing "${f.file_name}" (${f.width ?? "?"}×${f.height ?? "?"} px). Building type: ${viz?.building_type ?? "unknown"}. User says floors: ${viz?.floor_count ?? "unknown"}. Units preferred: ${viz?.unit_system}. Analyse per the schema.`;
        try {
          const raw = await callModel(apiKey, `data:${mime};base64,${b64(bytes)}`, hint);
          results.push({ file_id: f.id, name: f.file_name, width: f.width, height: f.height, analysis: normalizeRasterAnalysis(raw) });
          await db.from("visualization_files").update({ processing_status: "processed", error: null }).eq("id", f.id);
        } catch (e) {
          await db.from("visualization_files").update({ processing_status: "failed", error: e instanceof Error ? e.message : "failed" }).eq("id", f.id);
          throw e;
        }
        i++; await setStep("analyze", "running", `${i}/${blobs.length}`);
      }
      await setStep("analyze", "done", `${results.length} drawing(s) analysed`);
      if (await isCancelled()) return;

      // 3 — assemble
      await setStep("assemble", "running");
      const score = (r: (typeof results)[number]) => (r.analysis.drawingType === "floor_plan" ? 1000 : 0) + r.analysis.walls.length;
      const primary = [...results].sort((a, b) => score(b) - score(a))[0];
      const types = new Set(results.map((r) => r.analysis.drawingType));
      const source_type = types.size > 1 ? "mixed" : types.has("render") || types.has("elevation") ? "render" : "plan";
      const analysis = { model: MODEL, generated_at: new Date().toISOString(), primary_file_id: primary.file_id, files: results, warnings };
      await db.from("construction_visualizations").update({ analysis, source_type, status: "needs_review" }).eq("id", vizId);
      await setStep("assemble", "done");
      await db.from("visualization_jobs").update({ status: "succeeded", finished_at: new Date().toISOString() }).eq("id", jobId).neq("status", "cancelled");
    } catch (e) { await fail(e); }
  };

  const p = run();
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p); else await p; // local fallback keeps the contract
  return json({ job_id: jobId }, 202);
});
