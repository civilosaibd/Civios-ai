// RLS / function tests for the 3D visualization tables. Runs ALL real migrations in PGlite.
//   npm i --no-save @electric-sql/pglite && node --test supabase/tests/viz.test.mjs
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "security.test.mjs"), "utf8");
const STUBS = src.match(/const STUBS = `([\s\S]*?)`;/)[1]; // single source of truth for the Supabase stand-ins
const migDir = join(here, "..", "migrations");

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-0000000000c1";
const ENG = "00000000-0000-4000-8000-0000000000c2";
const VIEW = "00000000-0000-4000-8000-0000000000c3";
const OUT = "00000000-0000-4000-8000-0000000000c4";
let db, PROJECT, VIZ;

async function as(role, uid, email, fn) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid ?? ""}',false);
    SELECT set_config('request.jwt.claims','${JSON.stringify(uid ? { sub: uid, email } : {})}',false); SET ROLE ${role};`);
  try { return await fn(); } finally { await db.exec("RESET ROLE"); }
}
const u = (id, email) => (fn) => as("authenticated", id, email, fn);
const owner = u(OWNER, "owner@x.com"), eng = u(ENG, "eng@x.com"), view = u(VIEW, "view@x.com"), out = u(OUT, "out@x.com"), admin = u(ADMIN, "zobaerio24@gmail.com");
const rejects = (p, re) => assert.rejects(Promise.resolve().then(p), re);
const q = async (sql, p) => (await db.query(sql, p)).rows;

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    try { await db.exec(readFileSync(join(migDir, f), "utf8")); } catch (e) { throw new Error(`migration ${f}: ${e.message}`); }
  }
  for (const [id, e] of [[ADMIN, "zobaerio24@gmail.com"], [OWNER, "owner@x.com"], [ENG, "eng@x.com"], [VIEW, "view@x.com"], [OUT, "out@x.com"]])
    await db.query("INSERT INTO auth.users (id,email) VALUES ($1,$2)", [id, e]);
  [{ id: PROJECT }] = await q("INSERT INTO public.projects (user_id,name) VALUES ($1,'Tower A') RETURNING id", [OWNER]);
  await db.query("INSERT INTO public.project_members (project_id,user_id,role,status) VALUES ($1,$2,'engineer','accepted'),($1,$3,'viewer','accepted')", [PROJECT, ENG, VIEW]);
});

test("owner can create a visualization inside their own project", async () => {
  await owner(async () => {
    [{ id: VIZ }] = (await db.query("INSERT INTO public.construction_visualizations (user_id,project_id,name,floor_count) VALUES ($1,$2,'G+3 plan',4) RETURNING id", [OWNER, PROJECT])).rows;
  });
  assert.ok(VIZ);
});

test("validation constraints (floor count, empty name, bad status)", async () => {
  await owner(async () => {
    await rejects(() => db.query("INSERT INTO public.construction_visualizations (user_id,name,floor_count) VALUES ($1,'x',0)", [OWNER]), /check constraint/);
    await rejects(() => db.query("INSERT INTO public.construction_visualizations (user_id,name) VALUES ($1,'   ')", [OWNER]), /check constraint/);
    await rejects(() => db.query("UPDATE public.construction_visualizations SET status='hacked' WHERE id=$1", [VIZ]), /check constraint/);
  });
});

test("outsider cannot see or touch it; cannot create inside someone else's project", async () => {
  await out(async () => {
    assert.equal((await db.query("SELECT 1 FROM public.construction_visualizations WHERE id=$1", [VIZ])).rows.length, 0);
    await db.query("UPDATE public.construction_visualizations SET name='pwn' WHERE id=$1", [VIZ]);
    await db.query("DELETE FROM public.construction_visualizations WHERE id=$1", [VIZ]);
    await rejects(() => db.query("INSERT INTO public.construction_visualizations (user_id,project_id,name) VALUES ($1,$2,'x')", [OUT, PROJECT]), /row-level security/);
    await rejects(() => db.query("INSERT INTO public.construction_visualizations (user_id,name) VALUES ($1,'x')", [OWNER]), /row-level security/); // can't create as someone else
  });
  assert.equal((await q("SELECT name FROM public.construction_visualizations WHERE id=$1", [VIZ]))[0].name, "G+3 plan");
});

test("project engineer can read + write; viewer can only read", async () => {
  await eng(async () => {
    assert.equal((await db.query("SELECT 1 FROM public.construction_visualizations WHERE id=$1", [VIZ])).rows.length, 1);
    await db.query("UPDATE public.construction_visualizations SET status='needs_review', model='{\"floors\":4}' WHERE id=$1", [VIZ]);
    await db.query("INSERT INTO public.detected_elements (visualization_id,element_type,floor,geometry_data,confidence,source) VALUES ($1,'column',0,'{}',0.9,'vision')", [VIZ]);
  });
  await view(async () => {
    assert.equal((await db.query("SELECT 1 FROM public.construction_visualizations WHERE id=$1", [VIZ])).rows.length, 1);
    assert.equal((await db.query("SELECT 1 FROM public.detected_elements WHERE visualization_id=$1", [VIZ])).rows.length, 1);
    await db.query("UPDATE public.construction_visualizations SET name='viewer-edit' WHERE id=$1", [VIZ]);
    await db.query("DELETE FROM public.detected_elements WHERE visualization_id=$1", [VIZ]);
    await rejects(() => db.query("INSERT INTO public.detected_elements (visualization_id,element_type,geometry_data,source) VALUES ($1,'wall','{}','user')", [VIZ]), /row-level security/);
    await rejects(() => db.query("INSERT INTO public.visualization_files (visualization_id,user_id,file_url,file_name,file_type,file_size) VALUES ($1,$2,'a','a.png','image',1)", [VIZ, VIEW]), /row-level security/);
  });
  const [r] = await q("SELECT name,status FROM public.construction_visualizations WHERE id=$1", [VIZ]);
  assert.equal(r.name, "G+3 plan"); assert.equal(r.status, "needs_review");
  assert.equal((await q("SELECT count(*)::int n FROM public.detected_elements WHERE visualization_id=$1", [VIZ]))[0].n, 1);
});

test("ownership can't move; only owner re-homes to a project they can write", async () => {
  await eng(() => rejects(() => db.query("UPDATE public.construction_visualizations SET user_id=$1 WHERE id=$2", [ENG, VIZ]), /Owner cannot be changed/));
  await eng(() => rejects(() => db.query("UPDATE public.construction_visualizations SET project_id=NULL WHERE id=$1", [VIZ]), /Only the owner/));
  await owner(() => db.query("UPDATE public.construction_visualizations SET project_id=NULL WHERE id=$1", [VIZ]));
  await eng(async () => assert.equal((await db.query("SELECT 1 FROM public.construction_visualizations WHERE id=$1", [VIZ])).rows.length, 0)); // now private
  await owner(() => db.query("UPDATE public.construction_visualizations SET project_id=$1 WHERE id=$2", [PROJECT, VIZ]));
});

test("files: engineer may add rows only as themselves", async () => {
  await eng(async () => {
    await db.query("INSERT INTO public.visualization_files (visualization_id,user_id,file_url,file_name,file_type,file_size) VALUES ($1,$2,$3,'plan.png','image',100)", [VIZ, ENG, `${VIZ}/plan.png`]);
    await rejects(() => db.query("INSERT INTO public.visualization_files (visualization_id,user_id,file_url,file_name,file_type,file_size) VALUES ($1,$2,'x','x.exe','image',1)", [VIZ, OWNER]), /row-level security/);
    await rejects(() => db.query("INSERT INTO public.visualization_files (visualization_id,user_id,file_url,file_name,file_type,file_size) VALUES ($1,$2,'x','x.exe','exe',1)", [VIZ, ENG]), /check constraint/);
  });
});

test("jobs: readable by members, NEVER writable by clients; cancel works for writers only", async () => {
  const [{ id: job }] = await q("INSERT INTO public.visualization_jobs (visualization_id,user_id,status) VALUES ($1,$2,'running') RETURNING id", [VIZ, OWNER]);
  await view(async () => assert.equal((await db.query("SELECT 1 FROM public.visualization_jobs WHERE id=$1", [job])).rows.length, 1));
  await out(async () => assert.equal((await db.query("SELECT 1 FROM public.visualization_jobs WHERE id=$1", [job])).rows.length, 0));
  await owner(async () => {
    await rejects(() => db.query("INSERT INTO public.visualization_jobs (visualization_id,user_id,status) VALUES ($1,$2,'succeeded')", [VIZ, OWNER]), /permission denied/);
    await rejects(() => db.query("UPDATE public.visualization_jobs SET status='succeeded' WHERE id=$1", [job]), /permission denied/);
  });
  await view(() => rejects(() => db.query("SELECT public.cancel_viz_job($1)", [job]), /Job not found/));
  await out(() => rejects(() => db.query("SELECT public.cancel_viz_job($1)", [job]), /Job not found/));
  await eng(() => db.query("SELECT public.cancel_viz_job($1)", [job]));
  assert.equal((await q("SELECT status FROM public.visualization_jobs WHERE id=$1", [job]))[0].status, "cancelled");
});

test("settings: members can read viz.* limits, only admins can change them", async () => {
  await owner(async () => {
    const r = (await db.query("SELECT value FROM public.app_settings WHERE key='viz.max_file_mb'")).rows;
    assert.equal(Number(r[0].value), 25);
    await db.query("UPDATE public.app_settings SET value='999' WHERE key='viz.max_file_mb'");
    await rejects(() => db.query("INSERT INTO public.app_settings (key,value) VALUES ('viz.evil','1')"), /row-level security/);
  });
  assert.equal(Number((await q("SELECT value FROM public.app_settings WHERE key='viz.max_file_mb'"))[0].value), 25);
  await admin(() => db.query("UPDATE public.app_settings SET value='40' WHERE key='viz.max_file_mb'"));
  assert.equal(Number((await q("SELECT value FROM public.app_settings WHERE key='viz.max_file_mb'"))[0].value), 40);
});

test("storage: private bucket; object policies follow visualization access", async () => {
  assert.equal((await q("SELECT public FROM storage.buckets WHERE id='visualization-files'"))[0].public, false);
  const path = `${VIZ}/plan.png`, bad = `${OUT}/plan.png`;
  await eng(() => db.query("INSERT INTO storage.objects (bucket_id,name) VALUES ('visualization-files',$1)", [path]));
  await view(() => rejects(() => db.query("INSERT INTO storage.objects (bucket_id,name) VALUES ('visualization-files',$1)", [`${VIZ}/evil.png`]), /row-level security/));
  await out(() => rejects(() => db.query("INSERT INTO storage.objects (bucket_id,name) VALUES ('visualization-files',$1)", [path + "2"]), /row-level security/));
  await eng(() => rejects(() => db.query("INSERT INTO storage.objects (bucket_id,name) VALUES ('visualization-files',$1)", [bad]), /row-level security/)); // random folder
  await eng(() => rejects(() => db.query("INSERT INTO storage.objects (bucket_id,name) VALUES ('visualization-files','not-a-uuid/x.png')"), /row-level security/));
  await view(async () => assert.equal((await db.query("SELECT 1 FROM storage.objects WHERE name=$1", [path])).rows.length, 1));
  await out(async () => assert.equal((await db.query("SELECT 1 FROM storage.objects WHERE name=$1", [path])).rows.length, 0));
});

test("deleting a visualization cascades to files, elements, jobs", async () => {
  await owner(() => db.query("DELETE FROM public.construction_visualizations WHERE id=$1", [VIZ]));
  for (const t of ["visualization_files", "detected_elements", "visualization_jobs"])
    assert.equal((await q(`SELECT count(*)::int n FROM public.${t} WHERE visualization_id=$1`, [VIZ]))[0].n, 0, t);
});
