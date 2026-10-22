// Phase 4 tests: deadline alerts, claim_referral (Google sign-up), legacy privilege hardening.
//   npm i --no-save @electric-sql/pglite && node --test supabase/tests/phase4.test.mjs
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const STUBS = readFileSync(join(here, "security.test.mjs"), "utf8").match(/const STUBS = `([\s\S]*?)`;/)[1];
const migDir = join(here, "..", "migrations");
const id = (n) => `00000000-0000-4000-8000-0000000000${n}`;
const [OWNER, MEMBER, QUIET, OUTSIDER, REFERRER, NEWBIE, OLDIE, PAYER] = ["e1", "e2", "e3", "e4", "f1", "f2", "f3", "f4"].map(id);
let db;

async function as(role, uid, fn) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid ?? ""}',false);
    SELECT set_config('request.jwt.claims','${JSON.stringify(uid ? { sub: uid, email: "x@x.com" } : {})}',false); SET ROLE ${role};`);
  try { return await fn(); } finally { await db.exec("RESET ROLE"); }
}
const user = (uid) => (fn) => as("authenticated", uid, fn);
const rejects = (p, re) => assert.rejects(Promise.resolve().then(p), re);
const q = async (sql, p) => (await db.query(sql, p)).rows;
const day = (offset) => { const d = new Date(Date.now() + 6 * 3600e3); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }; // Dhaka date + offset
const today = () => day(0);
const gen = (u = null, t = today()) => q("SELECT public.generate_deadline_notifications($1::uuid,$2::date) n", [u, t]).then((r) => r[0].n);
const notes = (uid) => q("SELECT type,title,message,link,dedupe_key FROM public.notifications WHERE user_id=$1 AND type='deadline_alert' ORDER BY dedupe_key", [uid]);

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    try { await db.exec(readFileSync(join(migDir, f), "utf8")); } catch (e) { throw new Error(`migration ${f}: ${e.message}`); }
  }
  for (const [u, e] of [[OWNER, "owner"], [MEMBER, "member"], [QUIET, "quiet"], [OUTSIDER, "out"], [REFERRER, "ref"], [NEWBIE, "new"], [PAYER, "payer"]])
    await db.query("INSERT INTO auth.users (id,email) VALUES ($1,$2)", [u, e + "@x.com"]);
  await db.query("INSERT INTO auth.users (id,email,created_at) VALUES ($1,'old@x.com', now() - interval '3 days')", [OLDIE]);
  await db.query("INSERT INTO public.notification_settings (user_id, deadline_alerts) VALUES ($1,false)", [QUIET]);
});

// ------------------------------------------------------------------ deadline alerts
test("7 / 3 / 1 days before the deadline: owner AND accepted members get a Bengali alert; others do not", async () => {
  const [{ id: pid }] = await q("INSERT INTO public.projects (user_id,name,end_date,status) VALUES ($1,'টাওয়ার A',$2,'active') RETURNING id", [OWNER, day(7)]);
  await db.query("INSERT INTO public.project_members (project_id,user_id,role,status) VALUES ($1,$2,'engineer','accepted'),($1,$3,'viewer','accepted'),($1,$4,'viewer','pending')", [pid, MEMBER, QUIET, OUTSIDER]);
  assert.equal(await gen(), 2); // owner + member (QUIET opted out, OUTSIDER only has a pending invite)
  const [n] = await notes(OWNER);
  assert.match(n.title, /প্রজেক্ট ডেডলাইন: টাওয়ার A/);
  assert.match(n.message, /আর 7 দিন বাকি/);
  assert.equal(n.link, `/projects/${pid}`);
  assert.equal((await notes(MEMBER)).length, 1);
  assert.equal((await notes(QUIET)).length, 0);
  assert.equal((await notes(OUTSIDER)).length, 0);
  // simulate the calendar moving on: 3 days left, then 1 day left
  await q("UPDATE public.projects SET end_date=$2 WHERE id=$1", [pid, day(3)]);
  assert.equal(await gen(), 2);
  await q("UPDATE public.projects SET end_date=$2 WHERE id=$1", [pid, day(1)]);
  assert.equal(await gen(), 2);
  const msgs = (await notes(OWNER)).map((x) => x.message);
  assert.equal(msgs.length, 3);
  assert.ok(msgs.some((m) => /আগামীকাল/.test(m)));
});

test("no duplicates: running the job again (cron + app) creates nothing new", async () => {
  assert.equal(await gen(), 0);
  assert.equal(await gen(), 0);
  assert.equal((await notes(OWNER)).length, 3);
});

test("days that are not 7/3/1, completed projects and projects without a deadline are ignored", async () => {
  const before = (await q("SELECT count(*)::int n FROM public.notifications"))[0].n;
  await q("INSERT INTO public.projects (user_id,name,end_date,status) VALUES ($1,'d5',$2,'active'),($1,'d0',$3,'active'),($1,'done',$4,'completed'),($1,'nodate',NULL,'active'),($1,'past',$5,'active')", [OUTSIDER, day(5), day(0), day(3), day(-2)]);
  assert.equal(await gen(), 0);
  assert.equal((await q("SELECT count(*)::int n FROM public.notifications"))[0].n, before);
});

test("the user's own window is respected (deadline_days_before = 3 skips the 7-day alert, keeps 3 and 1)", async () => {
  await db.query("INSERT INTO public.notification_settings (user_id, deadline_days_before) VALUES ($1,3)", [OUTSIDER]);
  await q("INSERT INTO public.projects (user_id,name,end_date,status) VALUES ($1,'win7',$2,'active'),($1,'win3',$3,'active')", [OUTSIDER, day(7), day(3)]);
  assert.equal(await gen(), 1);
  const [n] = await notes(OUTSIDER);
  assert.match(n.title, /win3/);
});

test("a moved deadline produces a fresh alert (dedupe key includes the date)", async () => {
  const [{ id: pid }] = await q("INSERT INTO public.projects (user_id,name,end_date,status) VALUES ($1,'moving',$2,'active') RETURNING id", [REFERRER, day(1)]);
  assert.equal(await gen(), 1);
  await q("UPDATE public.projects SET end_date=$2 WHERE id=$1", [pid, day(3)]);
  assert.equal(await gen(), 1);
});

test("clients: the all-users job is not callable; the per-user function only creates the caller's alerts", async () => {
  await user(OWNER)(() => rejects(() => db.query("SELECT public.generate_deadline_notifications()"), /permission denied/));
  await as("anon", null, () => rejects(() => db.query("SELECT public.generate_my_deadline_notifications()"), /permission denied/));
  const [{ id: pid }] = await q("INSERT INTO public.projects (user_id,name,end_date,status) VALUES ($1,'mine-only',$2,'active') RETURNING id", [PAYER, day(1)]);
  await db.query("INSERT INTO public.project_members (project_id,user_id,role,status) VALUES ($1,$2,'viewer','accepted')", [pid, MEMBER]);
  const n = await user(PAYER)(async () => (await db.query("SELECT public.generate_my_deadline_notifications() n")).rows[0].n);
  assert.equal(n, 1);
  assert.equal((await notes(MEMBER)).filter((x) => /mine-only/.test(x.title)).length, 0); // member's alert waits for their own call / the cron
  assert.equal(await user(MEMBER)(async () => (await db.query("SELECT public.generate_my_deadline_notifications() n")).rows[0].n), 1);
});

// ------------------------------------------------------------------ claim_referral
const code = async (uid) => (await q("SELECT referral_code c FROM public.profiles WHERE id=$1", [uid]))[0].c;
const claim = (who, c) => who(async () => (await db.query("SELECT public.claim_referral($1) r", [c])).rows[0].r);

test("claim_referral: a brand-new Google-style account attaches a valid code once", async () => {
  assert.equal(await claim(user(NEWBIE), "garbage!!"), "invalid_code");
  assert.equal(await claim(user(NEWBIE), "CIVIL-NOPE99"), "invalid_code");
  assert.equal(await claim(user(NEWBIE), (await code(REFERRER)).toLowerCase()), "claimed"); // case-insensitive
  const [r] = await q("SELECT referrer_id, status, commission_amount::numeric c FROM public.referrals WHERE referred_user_id=$1", [NEWBIE]);
  assert.deepEqual({ ref: r.referrer_id, status: r.status, c: Number(r.c) }, { ref: REFERRER, status: "pending", c: 0 });
  assert.equal((await q("SELECT referred_by FROM public.profiles WHERE id=$1", [NEWBIE]))[0].referred_by, REFERRER);
  assert.equal(await claim(user(NEWBIE), await code(OWNER)), "already_referred"); // cannot switch referrer
});

test("claim_referral: old accounts, self-referral and paying customers are refused; anon cannot call it", async () => {
  assert.equal(await claim(user(OLDIE), await code(REFERRER)), "too_late");
  assert.equal(await claim(user(REFERRER), await code(REFERRER)), "self");
  const [{ id: pro }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  await q("INSERT INTO public.payments (user_id,plan_id,billing_cycle,status,transaction_id) VALUES ($1,$2,'yearly','verified','TX-P4')", [PAYER, pro]);
  assert.equal(await claim(user(PAYER), await code(REFERRER)), "too_late");
  await as("anon", null, () => rejects(() => db.query("SELECT public.claim_referral('CIVIL-ABCDEF')"), /permission denied/));
});

test("a claimed referral earns commission like any other (end to end)", async () => {
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'zobaerio24@gmail.com')", [id("a9")]);
  const [{ id: st }] = await q("SELECT id FROM public.plans WHERE code='starter'");
  await user(NEWBIE)(() => db.query("INSERT INTO public.payments (user_id,plan_id,billing_cycle,transaction_id,sender_number) VALUES ($1,$2,'yearly','TX-NEW1','01900000001')", [NEWBIE, st]));
  const [{ id: payId }] = await q("SELECT id FROM public.payments WHERE transaction_id='TX-NEW1'");
  await as("authenticated", id("a9"), () => db.query("SELECT public.approve_payment($1)", [payId]));
  const [c] = await q("SELECT status, referrer_id, commission_amount::numeric c, base_amount::numeric b FROM public.referral_commissions WHERE payment_id=$1", [payId]);
  assert.equal(c.status, "approved"); assert.equal(c.referrer_id, REFERRER);
  assert.ok(Math.abs(Number(c.c) - Number(c.b) * 0.1) < 0.005);
});

// ------------------------------------------------------------------ privileges
test("legacy money tables: anon has no access; nobody on the client can TRUNCATE", async () => {
  for (const t of ["payments", "withdrawals", "subscriptions", "referrals"])
    await as("anon", null, () => rejects(() => db.query(`SELECT * FROM public.${t} LIMIT 1`), /permission denied/));
  for (const t of ["payments", "withdrawals", "subscriptions", "referrals", "profiles"]) {
    await user(OWNER)(() => rejects(() => db.query(`TRUNCATE public.${t}`), /permission denied/));
    await as("anon", null, () => rejects(() => db.query(`TRUNCATE public.${t}`), /permission denied/));
  }
});

test("hardening did not break normal use: own payments / profile still work through RLS", async () => {
  const [{ id: st }] = await q("SELECT id FROM public.plans WHERE code='starter'");
  await user(OWNER)(() => db.query("INSERT INTO public.payments (user_id,plan_id,billing_cycle,transaction_id) VALUES ($1,$2,'yearly','TX-OWNER')", [OWNER, st]));
  assert.equal(await user(OWNER)(async () => (await db.query("SELECT count(*)::int n FROM public.payments")).rows[0].n), 1);
  await user(OWNER)(() => db.query("UPDATE public.profiles SET display_name='Owner' WHERE id=$1", [OWNER]));
  assert.equal((await q("SELECT display_name d FROM public.profiles WHERE id=$1", [OWNER]))[0].d, "Owner");
});
