// Runs the REAL supabase/functions/viz-analyze/index.ts (bundled with esbuild) against an in-memory fake of
// supabase-js and a fake AI gateway. Verifies the function's own logic: auth, validation, job state, error mapping.
// It does NOT call the real AI and does not prove RLS / platform behaviour.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const VIZ = "11111111-1111-4111-8111-111111111111", OWNER = "22222222-2222-4222-8222-222222222222", OTHER = "33333333-3333-4333-8333-333333333333";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(1)]);
const GOOD = { drawing_type: "floor_plan", floors: { value: 2, confidence: 0.8 }, labels: [{ text: "LIVING", at: { x: 0.3, y: 0.4 }, confidence: 0.9 }],
  walls: [[0.1, 0.1, 0.9, 0.1], [0.9, 0.1, 0.9, 0.8], [0.9, 0.8, 0.1, 0.8], [0.1, 0.8, 0.1, 0.1]].map(([x1, y1, x2, y2]) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, exterior: true, confidence: 0.9 })),
  doors: [{ c: { x: 0.5, y: 0.8 }, w_rel: 0.05, confidence: 0.7 }], windows: [], columns: [], stairs: [], balconies: [], dimensions: [], scale_note: null, render_info: null, warnings: [], assumptions: [] };

let handler;
before(async () => {
  const out = join(process.env.TMPDIR ?? "/tmp", `viz-analyze-${process.pid}.mjs`);
  await build({ entryPoints: [join(here, "../functions/viz-analyze/index.ts")], outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent",
    alias: { "npm:@supabase/supabase-js@2": join(here, "helpers/fake-supabase.mjs") } });
  globalThis.Deno = { env: { get: (k) => globalThis.__ENV?.[k] }, serve: (h) => { handler = h; } };
  await import(pathToFileURL(out).href);
});

function setup({ files, ai, canWrite = true, env = {} } = {}) {
  globalThis.__ENV = { SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", LOVABLE_API_KEY: "k", ...env };
  const F = globalThis.__FAKE = {
    users: { "tok-owner": { id: OWNER }, "tok-other": { id: OTHER } }, canWrite: ({ _user }) => canWrite && _user === OWNER,
    db: {
      construction_visualizations: [{ id: VIZ, name: "T", building_type: "Residential", floor_count: 2, unit_system: "metric", status: "draft" }],
      visualization_files: files ?? [{ id: "f1", visualization_id: VIZ, file_type: "image", file_name: "plan.png", file_size: PNG.length, file_url: "p/plan.png", width: 1000, height: 800, role: "source", created_at: "2026-01-01" }],
      visualization_jobs: [], app_settings: [{ key: "viz.max_file_mb", value: 25 }],
    },
    storage: { "p/plan.png": PNG }, aiCalls: [],
  };
  globalThis.fetch = async (url, init) => { F.aiCalls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return ai ? ai(F.aiCalls.length) : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(GOOD) } }] }), { status: 200 }); };
  return F;
}
const call = (body, tok = "tok-owner", method = "POST") => handler(new Request("http://f/viz-analyze", { method, headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined }));
const job = (F) => F.db.visualization_jobs[0], viz = (F) => F.db.construction_visualizations[0];

test("happy path: real job state, normalised analysis saved, status needs_review", async () => {
  const F = setup(); const r = await call({ visualization_id: VIZ });
  assert.equal(r.status, 202); assert.equal((await r.json()).job_id, job(F).id);
  assert.equal(job(F).status, "succeeded"); assert.deepEqual(job(F).steps.map((s) => s.status), ["done", "done", "done"]);
  assert.equal(viz(F).status, "needs_review"); assert.equal(viz(F).source_type, "plan");
  assert.equal(viz(F).analysis.files[0].analysis.walls.length, 4);
  assert.equal(F.aiCalls.length, 1); assert.equal(F.aiCalls[0].auth, "Bearer k");
  assert.match(F.aiCalls[0].body.messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(F.db.visualization_files[0].processing_status, "processed");
});
test("request validation: no auth, bad token, bad method, bad JSON, bad uuid, no AI key", async () => {
  setup(); assert.equal((await call({ visualization_id: VIZ }, null)).status, 401);
  assert.equal((await call({ visualization_id: VIZ }, "tok-nobody")).status, 401);
  assert.equal((await call({}, "tok-owner", "GET")).status, 405);
  assert.equal((await call("{not json")).status, 400);
  assert.equal((await call({ visualization_id: "nope" })).status, 400);
  assert.equal((await call({ visualization_id: "11111111-1111-1111-1111-111111111111" })).status, 400); // bad variant nibble
  setup({ env: { LOVABLE_API_KEY: "" } }); assert.equal((await call({ visualization_id: VIZ })).status, 503);
});
test("a user without write access gets 404 and nothing is created or sent to the AI", async () => {
  const F = setup(); const r = await call({ visualization_id: VIZ }, "tok-other");
  assert.equal(r.status, 404); assert.equal(F.db.visualization_jobs.length, 0); assert.equal(F.aiCalls.length, 0); assert.equal(viz(F).status, "draft");
});
test("an already-running job is returned instead of starting a second one", async () => {
  const F = setup(); F.db.visualization_jobs.push({ id: "J0", visualization_id: VIZ, status: "running", created_at: new Date().toISOString() });
  const r = await call({ visualization_id: VIZ }); const b = await r.json();
  assert.equal(r.status, 202); assert.equal(b.job_id, "J0"); assert.equal(b.already_running, true); assert.equal(F.aiCalls.length, 0);
});
test("AI errors map to friendly messages and mark the job failed (402, 429 twice, 500, garbage, non-JSON)", async () => {
  const cases = [
    [() => new Response("", { status: 402 }), /credits/i, 1], [() => new Response("", { status: 429 }), /busy|rate/i, 2],
    [() => new Response("", { status: 400 }), /returned an error/i, 1],
    [() => new Response(JSON.stringify({ choices: [{ message: { content: "not json at all" } }] }), { status: 200 }), /unreadable/i, 1],
    [() => new Response(JSON.stringify({ nothing: true }), { status: 200 }), /unreadable/i, 1],
  ];
  for (const [mk, re, calls] of cases) {
    const F = setup({ ai: mk }); await call({ visualization_id: VIZ });
    assert.equal(job(F).status, "failed"); assert.match(job(F).error, re); assert.equal(viz(F).status, "failed");
    assert.equal(F.aiCalls.length, calls); assert.equal(F.db.visualization_files[0].processing_status, "failed");
    assert.ok(job(F).steps.some((s) => s.status === "error"));
  }
});
test("a transient 500 is retried once and then succeeds", async () => {
  const F = setup({ ai: (n) => (n === 1 ? new Response("", { status: 503 }) : new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(GOOD) + "\n```" } }] }), { status: 200 })) });
  await call({ visualization_id: VIZ }); assert.equal(job(F).status, "succeeded"); assert.equal(F.aiCalls.length, 2);
});
test("validation failures never reach the AI: DWG only, fake PNG, oversize, missing in storage", async () => {
  const base = { visualization_id: VIZ, created_at: "2026-01-01", role: "source", width: 1000, height: 800 };
  let F = setup({ files: [{ ...base, id: "d", file_type: "dwg", file_name: "a.dwg", file_size: 10, file_url: "p/a.dwg" }] }); await call({ visualization_id: VIZ });
  assert.equal(job(F).status, "failed"); assert.match(job(F).error, /No analysable image/); assert.equal(F.db.visualization_files[0].processing_status, "unsupported"); assert.equal(F.aiCalls.length, 0);
  F = setup(); F.storage["p/plan.png"] = new TextEncoder().encode("MZ this is an exe"); await call({ visualization_id: VIZ });
  assert.match(job(F).error, /corrupted or not a real image/); assert.equal(F.aiCalls.length, 0);
  F = setup({ files: [{ ...base, id: "f1", file_type: "image", file_name: "big.png", file_size: 9 * 1024 * 1024, file_url: "p/plan.png" }] }); await call({ visualization_id: VIZ });
  assert.match(job(F).error, /too large for AI/); assert.equal(F.aiCalls.length, 0);
  F = setup(); delete F.storage["p/plan.png"]; await call({ visualization_id: VIZ });
  assert.match(job(F).error, /could not be read/); assert.equal(F.aiCalls.length, 0);
});
test("a derived (rasterised) copy replaces its source PDF; only the derived image is analysed", async () => {
  const b = { visualization_id: VIZ, created_at: "2026-01-01", width: 1000, height: 800 };
  const F = setup({ files: [{ ...b, id: "pdf1", file_type: "pdf", file_name: "p.pdf", file_size: 5, file_url: "p/p.pdf", role: "source" },
    { ...b, id: "img1", file_type: "image", file_name: "p-page1.png", file_size: PNG.length, file_url: "p/plan.png", role: "derived", derived_from: "pdf1" }] });
  await call({ visualization_id: VIZ }); assert.equal(job(F).status, "succeeded"); assert.equal(F.aiCalls.length, 1);
});
test("hostile model output is clamped, not trusted", async () => {
  const evil = { ...GOOD, walls: [{ a: { x: -50, y: 0.5 }, b: { x: 99, y: 0.5 } }, ...GOOD.walls], floors: { value: 9999, confidence: 5 }, doors: [{ c: { x: 0.5, y: 0.5 }, w_rel: 9 }], labels: [{ text: "x".repeat(500), at: { x: 0.5, y: 0.5 } }] };
  const F = setup({ ai: () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(evil) } }] }), { status: 200 }) });
  await call({ visualization_id: VIZ }); const a = viz(F).analysis.files[0].analysis;
  assert.equal(a.walls.length, 4); assert.equal(a.floors.value, null); assert.ok(a.floors.confidence <= 1); assert.equal(a.doors.length, 0); assert.ok(a.labels[0].text.length <= 60); assert.ok(a.dropped >= 2);
});
