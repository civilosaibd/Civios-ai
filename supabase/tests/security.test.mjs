// Runs the REAL migrations in supabase/migrations against an in-memory Postgres
// (PGlite) with minimal Supabase stubs (auth.*, storage.*, roles), then checks
// that the money / referral RLS holes are closed.
//
//   npm i --no-save @electric-sql/pglite
//   node --test supabase/tests/security.test.mjs
//
// This is a policy/function test, NOT a replacement for testing on a Supabase
// staging project (PostgREST, Realtime and Storage are not exercised here).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, "..", "migrations");

const STUBS = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN; CREATE ROLE supabase_auth_admin NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin;
-- Supabase default privileges for objects later created in public:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects, storage.buckets TO authenticated, service_role;
CREATE PUBLICATION supabase_realtime;
`;

let db;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const ALICE = "00000000-0000-4000-8000-0000000000b1";
const BOB   = "00000000-0000-4000-8000-0000000000b2";

async function as(role, uid, email, fn) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${uid ?? ""}', false);
    SELECT set_config('request.jwt.claims', '${JSON.stringify(uid ? { sub: uid, email } : {}).replace(/'/g, "''")}', false);
    SET ROLE ${role};`);
  try { return await fn(); } finally {
    // Do not leak a previous test user's JWT claims into later owner-level assertions.
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); SELECT set_config('request.jwt.claims', '{}', false);");
  }
}
const alice = (fn) => as("authenticated", ALICE, "alice@example.com", fn);
const bob   = (fn) => as("authenticated", BOB, "bob@example.com", fn);
const admin = (fn) => as("authenticated", ADMIN, "zobaerio24@gmail.com", fn);
const anon  = (fn) => as("anon", null, null, fn);
const rejects = (p, re) => assert.rejects(Promise.resolve().then(p), re);
const q = async (sql, params) => (await db.query(sql, params)).rows;

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (f === "20261030130000_super_admin_rbac_foundation.sql") {
      await db.exec(`INSERT INTO auth.users (id,email,email_confirmed_at)
        VALUES ('${ADMIN}','zobaerio24@gmail.com',now());`);
    }
    try { await db.exec(readFileSync(join(migDir, f), "utf8")); }
    catch (e) { throw new Error(`migration ${f} failed: ${e.message}`); }
  }
  await db.exec(`INSERT INTO auth.users (id,email,email_confirmed_at) VALUES
    ('${ALICE}','alice@example.com',null),('${BOB}','bob@example.com',null);`);
  // Bootstrap the test owner explicitly; public signup must never auto-grant admin.
  await db.query("INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT (user_id, role) DO NOTHING", [ADMIN]);
});

test("sanity: users, profiles and admin role exist after migrations", async () => {
  assert.equal((await q("SELECT count(*)::int n FROM public.profiles")).at(0).n, 3);
  assert.equal((await q("SELECT public.has_role($1,'admin') a", [ADMIN])).at(0).a, true);
  assert.equal((await q("SELECT public.has_role($1,'admin') a", [ALICE])).at(0).a, false);
});

test("subscriptions: user cannot self-grant a paid plan (INSERT)", async () => {
  const [{ id: biz }] = await q("SELECT id FROM public.plans WHERE code='business'");
  const [{ id: free }] = await q("SELECT id FROM public.plans WHERE code='free'");
  await alice(() => rejects(() => db.query("INSERT INTO public.subscriptions (user_id,plan_id,status) VALUES ($1,$2,'active')", [ALICE, biz]), /row-level security/));
  await alice(() => db.query("INSERT INTO public.subscriptions (user_id,plan_id,status) VALUES ($1,$2,'active')", [ALICE, free]));
});

test("subscriptions: client role has no UPDATE privilege", async () => {
  const [{ id: biz }] = await q("SELECT id FROM public.plans WHERE code='business'");
  await alice(() => rejects(
    () => db.query("UPDATE public.subscriptions SET plan_id=$1, status='active' WHERE user_id=$2", [biz, ALICE]),
    /permission denied/
  ));
  const [{ code }] = await q("SELECT p.code FROM public.subscriptions s JOIN public.plans p ON p.id=s.plan_id WHERE s.user_id=$1", [ALICE]);
  assert.equal(code, "free");
  const [{ update_allowed }] = await q(
    "SELECT has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE') AS update_allowed"
  );
  assert.equal(update_allowed, false);
});

test("payments: client-supplied amount/status are overridden server-side", async () => {
  const [{ id: pro, price_yearly }] = await q("SELECT id, price_yearly FROM public.plans WHERE code='professional'");
  await alice(() => db.query(
    "INSERT INTO public.payments (user_id,plan_id,amount,billing_cycle,status,verified_at,transaction_id) VALUES ($1,$2,1,'yearly','pending',now(),'TX-ALICE-1')",
    [ALICE, pro]));
  const [row] = await q("SELECT amount::numeric a, status, verified_at FROM public.payments WHERE transaction_id='TX-ALICE-1'");
  assert.equal(Number(row.a), Number(price_yearly));
  assert.equal(row.status, "pending");
  assert.equal(row.verified_at, null);
});

test("payments: forged 'verified' status is neutralised to 'pending'", async () => {
  const [{ id: pro }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  await alice(() => db.query(
    "INSERT INTO public.payments (user_id,plan_id,amount,billing_cycle,status,verified_at,transaction_id) VALUES ($1,$2,1,'yearly','verified',now(),'TX-FORGED')", [ALICE, pro]));
  const [r] = await q("SELECT status, verified_at FROM public.payments WHERE transaction_id='TX-FORGED'");
  assert.equal(r.status, "pending"); assert.equal(r.verified_at, null);
  await alice(() => rejects(() => db.query(
    "INSERT INTO public.payments (user_id,plan_id,billing_cycle,transaction_id) VALUES ($1,$2,'yearly','TX-OTHER') RETURNING 1", [BOB, pro]), /row-level security/)); // cannot pay as someone else
});

test("approve_payment: non-admin and anon are refused", async () => {
  const [{ id }] = await q("SELECT id FROM public.payments WHERE transaction_id='TX-ALICE-1'");
  await alice(() => rejects(() => db.query("SELECT public.approve_payment($1)", [id]), /Admin only|Billing: Manage permission required/));
  await anon(() => rejects(() => db.query("SELECT public.approve_payment($1)", [id]), /permission denied/));
});

test("approve_payment: admin activates the paid plan once; replay is refused", async () => {
  const [{ id }] = await q("SELECT id FROM public.payments WHERE transaction_id='TX-ALICE-1'");
  await admin(() => db.query("SELECT public.approve_payment($1)", [id]));
  const [s] = await q("SELECT p.code, s.status, s.billing_cycle FROM public.subscriptions s JOIN public.plans p ON p.id=s.plan_id WHERE s.user_id=$1", [ALICE]);
  assert.deepEqual({ ...s }, { code: "professional", status: "active", billing_cycle: "yearly" });
  const [pay] = await q("SELECT status, verified_at FROM public.payments WHERE id=$1", [id]);
  assert.equal(pay.status, "verified"); assert.ok(pay.verified_at);
  await admin(() => rejects(() => db.query("SELECT public.approve_payment($1)", [id]), /already verified/));
});

test("cancel_my_subscription works for the owner only on their own row", async () => {
  await bob(() => db.query("SELECT public.cancel_my_subscription()"));
  assert.equal((await q("SELECT status FROM public.subscriptions WHERE user_id=$1", [ALICE])).at(0).status, "active");
  await alice(() => db.query("SELECT public.cancel_my_subscription()"));
  assert.equal((await q("SELECT status FROM public.subscriptions WHERE user_id=$1", [ALICE])).at(0).status, "cancelled");
});

test("withdrawals: direct INSERT (e.g. status='paid') is blocked", async () => {
  await alice(() => rejects(() => db.query(
    "INSERT INTO public.withdrawals (user_id,amount,method,account_number,status) VALUES ($1,99999,'bKash','01700000000','paid')", [ALICE]), /permission denied/));
});

test("withdrawals: minimum, balance, method and account validation", async () => {
  await alice(() => rejects(() => db.query("SELECT public.request_withdrawal(499,'bKash','01700000000')"), /Minimum withdrawal/));
  await alice(() => rejects(() => db.query("SELECT public.request_withdrawal(500,'bKash','01700000000')"), /exceeds available balance/));
  await db.query("INSERT INTO public.referrals (referrer_id, referred_user_id, status, commission_amount) VALUES ($1,$2,'converted',1000)", [ALICE, BOB]);
  // Phase 3: the withdrawable balance is the approved commission LEDGER (written only server-side)
  await db.query("INSERT INTO public.referral_commissions (referral_id,referrer_id,referred_user_id,base_amount,rate,commission_amount,status) SELECT id,referrer_id,referred_user_id,10000,0.10,1000,'approved' FROM public.referrals WHERE referrer_id=$1", [ALICE]);
  await alice(() => rejects(() => db.query("SELECT public.request_withdrawal(500,'paypal','01700000000')"), /Unsupported payment method/));
  await alice(() => rejects(() => db.query("SELECT public.request_withdrawal(500,'bKash','1')"), /Invalid account number/));
});

test("withdrawals: valid request works, balance is enforced, no double-spend", async () => {
  await alice(() => db.query("SELECT public.request_withdrawal(600,'bKash','01700000000')"));
  const [w] = await q("SELECT status, amount::numeric a FROM public.withdrawals WHERE user_id=$1", [ALICE]);
  assert.equal(w.status, "pending"); assert.equal(Number(w.a), 600);
  await alice(() => rejects(() => db.query("SELECT public.request_withdrawal(600,'Nagad','01700000000')"), /exceeds available balance/));
  await alice(() => rejects(() => db.query("SELECT public.request_withdrawal(400,'Nagad','01700000000')"), /Minimum withdrawal/)); // remaining 400 < 500
});

test("withdrawals: only admin changes status, strict transitions, server timestamps", async () => {
  const [{ id }] = await q("SELECT id FROM public.withdrawals WHERE user_id=$1 AND amount=600", [ALICE]);
  await alice(() => db.query("UPDATE public.withdrawals SET status='paid' WHERE id=$1", [id]));
  assert.equal((await q("SELECT status FROM public.withdrawals WHERE id=$1", [id])).at(0).status, "pending"); // RLS: 0 rows
  await admin(() => rejects(() => db.query("UPDATE public.withdrawals SET status='paid' WHERE id=$1", [id]), /Invalid withdrawal status change/));
  await admin(() => rejects(() => db.query("UPDATE public.withdrawals SET amount=1 WHERE id=$1", [id]), /immutable/));
  await admin(() => db.query("UPDATE public.withdrawals SET status='approved' WHERE id=$1", [id]));
  let [w] = await q("SELECT status, approved_at, paid_at FROM public.withdrawals WHERE id=$1", [id]);
  assert.equal(w.status, "approved"); assert.ok(w.approved_at); assert.equal(w.paid_at, null);
  await admin(() => db.query("UPDATE public.withdrawals SET status='paid', paid_at='2000-01-01' WHERE id=$1", [id]));
  [w] = await q("SELECT status, paid_at FROM public.withdrawals WHERE id=$1", [id]);
  assert.equal(w.status, "paid"); assert.ok(new Date(w.paid_at).getFullYear() >= 2025); // client timestamp ignored
  await admin(() => rejects(() => db.query("UPDATE public.withdrawals SET status='rejected' WHERE id=$1", [id]), /Invalid withdrawal status change/));
});

test("profiles: referral_code / referred_by cannot be changed by the user", async () => {
  const [before] = await q("SELECT referral_code, referred_by FROM public.profiles WHERE id=$1", [ALICE]);
  await alice(() => db.query("UPDATE public.profiles SET referral_code='CIVIL-HACKED', referred_by=$1, display_name='Alice' WHERE id=$2", [BOB, ALICE]));
  const [after] = await q("SELECT referral_code, referred_by, display_name FROM public.profiles WHERE id=$1", [ALICE]);
  assert.equal(after.referral_code, before.referral_code);
  assert.equal(after.referred_by, before.referred_by);
  assert.equal(after.display_name, "Alice"); // normal edits still work
});

test("profiles: client-side INSERT cannot pre-set a referrer", async () => {
  const CAROL = "00000000-0000-4000-8000-0000000000b3";
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'carol@example.com')", [CAROL]);
  await db.query("DELETE FROM public.profiles WHERE id=$1", [CAROL]);
  await as("authenticated", CAROL, "carol@example.com", () =>
    db.query("INSERT INTO public.profiles (id, referral_code, referred_by) VALUES ($1,'CIVIL-FAKE',$2)", [CAROL, BOB]));
  const [p] = await q("SELECT referral_code, referred_by FROM public.profiles WHERE id=$1", [CAROL]);
  assert.equal(p.referred_by, null);
  assert.notEqual(p.referral_code, "CIVIL-FAKE");
});

test("referrals: users can't edit referral rows (commission is server/admin only)", async () => {
  await alice(() => db.query("UPDATE public.referrals SET commission_amount=999999, status='converted' WHERE referrer_id=$1", [ALICE]));
  assert.equal(Number((await q("SELECT commission_amount::numeric c FROM public.referrals WHERE referrer_id=$1", [ALICE])).at(0).c), 1000);
  await alice(() => rejects(() => db.query("INSERT INTO public.referrals (referrer_id, referred_user_id, status, commission_amount) VALUES ($1,$2,'converted',500)", [ALICE, ADMIN]), /row-level security/));
});

// ---------------------------------------------------------------------------
// Phase 2 — yearly-only billing, price preserved exactly
// ---------------------------------------------------------------------------
test("PRICE RULE: every plan's yearly amount equals its original monthly amount (no x12)", async () => {
  const rows = await q("SELECT code, price_monthly::numeric m, price_yearly::numeric y FROM public.plans ORDER BY sort_order");
  assert.ok(rows.length >= 4);
  for (const r of rows) assert.equal(Number(r.y), Number(r.m), `${r.code}: yearly ${r.y} must equal monthly ${r.m}`);
  // the seeded amounts must be unchanged (499 / 1,999 / 4,999) — never 5,988 / 23,988 / 59,988
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.code, Number(r.y)])),
    { free: 0, starter: 499, professional: 1999, business: 4999 });
});

test("monthly billing is gone: a monthly payment request is stored as yearly at the plan's price", async () => {
  const [{ id: st, price_yearly }] = await q("SELECT id, price_yearly FROM public.plans WHERE code='starter'");
  await bob(() => db.query(
    "INSERT INTO public.payments (user_id,plan_id,amount,billing_cycle,transaction_id) VALUES ($1,$2,1,'monthly','TX-BOB-M')", [BOB, st]));
  const [r] = await q("SELECT billing_cycle, amount::numeric a FROM public.payments WHERE transaction_id='TX-BOB-M'");
  assert.equal(r.billing_cycle, "yearly");
  assert.equal(Number(r.a), Number(price_yearly)); // 499 — not 5,988
});

test("approve_payment grants a 1-year subscription and refuses legacy monthly payments", async () => {
  const [{ id }] = await q("SELECT id FROM public.payments WHERE transaction_id='TX-BOB-M'");
  await admin(() => db.query("SELECT public.approve_payment($1)", [id]));
  const [s] = await q("SELECT billing_cycle, renewal_date, start_date FROM public.subscriptions WHERE user_id=$1", [BOB]);
  assert.equal(s.billing_cycle, "yearly");
  const days = (new Date(s.renewal_date) - new Date(s.start_date)) / 86400000;
  assert.ok(days >= 364 && days <= 366, `renewal should be ~1 year out, got ${days} days`);

  // legacy pending monthly row (created as a superuser, as it would exist from before)
  const [{ id: biz }] = await q("SELECT id FROM public.plans WHERE code='business'");
  const [{ id: legacy }] = await q(
    "INSERT INTO public.payments (user_id,plan_id,amount,billing_cycle,status,transaction_id) VALUES ($1,$2,4999,'monthly','pending','TX-LEGACY') RETURNING id", [ALICE, biz]);
  await db.query("UPDATE public.payments SET billing_cycle='monthly' WHERE id=$1", [legacy]); // trigger forces yearly on INSERT; simulate old data
  await admin(() => rejects(() => db.query("SELECT public.approve_payment($1)", [legacy]), /Legacy monthly payment/));
});

test("new subscription/payment rows default to yearly", async () => {
  const rows = await q(`SELECT table_name, column_default FROM information_schema.columns
    WHERE table_schema='public' AND column_name='billing_cycle' AND table_name IN ('subscriptions','payments')`);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.match(r.column_default, /yearly/);
});


test("AI endpoint rate limiter: only service_role can invoke it", async () => {
  await alice(() => rejects(() => db.query("SELECT * FROM public.consume_ai_endpoint_rate_limit($1, 'ai-chat')", [ALICE]), /permission denied/));
  await anon(() => rejects(() => db.query("SELECT * FROM public.consume_ai_endpoint_rate_limit($1, 'ai-chat')", [ALICE]), /permission denied/));
});

test("AI endpoint rate limiter: caps one endpoint at ten requests per minute", async () => {
  const results = [];
  for (let i = 0; i < 10; i++) {
    results.push(await as("service_role", ALICE, "alice@example.com", () =>
      q("SELECT * FROM public.consume_ai_endpoint_rate_limit($1, 'ai-chat')", [ALICE])));
  }
  assert.ok(results.every((r) => r[0].allowed === true));
  const [blocked] = await as("service_role", ALICE, "alice@example.com", () =>
    q("SELECT * FROM public.consume_ai_endpoint_rate_limit($1, 'ai-chat')", [ALICE]));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "minute");
  assert.equal(blocked.minute_count, 10);
});

test("AI endpoint rate limiter: applies separate limits per endpoint and a daily cap", async () => {
  await db.query("DELETE FROM public.ai_endpoint_rate_limit_events WHERE user_id=$1", [BOB]);
  await db.query(
    "INSERT INTO public.ai_endpoint_rate_limit_events (user_id, endpoint, created_at) SELECT $1, 'ai-chat', now() - (n || ' minutes')::interval FROM generate_series(2, 101) n",
    [BOB]
  );
  const [limited] = await as("service_role", BOB, "bob@example.com", () =>
    q("SELECT * FROM public.consume_ai_endpoint_rate_limit($1, 'ai-chat')", [BOB]));
  assert.equal(limited.allowed, false);
  assert.equal(limited.reason, "day");
  assert.equal(limited.day_count, 100);
  const [otherEndpoint] = await as("service_role", BOB, "bob@example.com", () =>
    q("SELECT * FROM public.consume_ai_endpoint_rate_limit($1, 'ai-structured')", [BOB]));
  assert.equal(otherEndpoint.allowed, true);
});


const AI_FREE = "00000000-0000-4000-8000-0000000000c1";
const AI_STARTER = "00000000-0000-4000-8000-0000000000c2";

test("AI credit quota RPC is server-only", async () => {
  await alice(() => rejects(() => db.query("SELECT * FROM public.consume_ai_credit($1)", [ALICE]), /permission denied/));
  await anon(() => rejects(() => db.query("SELECT * FROM public.consume_ai_credit($1)", [ALICE]), /permission denied/));
});

test("AI credit quota: Free plan caps monthly usage at 50", async () => {
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'ai-free@example.com')", [AI_FREE]);
  const allowed = await as("service_role", AI_FREE, "ai-free@example.com", async () => {
    const out = [];
    for (let i = 0; i < 50; i++) {
      out.push((await q("SELECT * FROM public.consume_ai_credit($1)", [AI_FREE]))[0]);
    }
    return out;
  });
  assert.ok(allowed.every((r) => r.allowed === true));
  assert.equal(allowed[0].plan_code, "free");
  assert.equal(allowed[49].used, 50);
  assert.equal(allowed[49].quota, 50);
  const [blocked] = await as("service_role", AI_FREE, "ai-free@example.com", () =>
    q("SELECT * FROM public.consume_ai_credit($1)", [AI_FREE]));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "ai_credits");
  assert.equal(blocked.used, 50);
});

test("AI credit quota: active subscription uses plan quota and expires back to Free", async () => {
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'ai-starter@example.com')", [AI_STARTER]);
  const [{ id: starter }] = await q("SELECT id FROM public.plans WHERE code='starter'");
  await db.query(
    "INSERT INTO public.subscriptions (user_id,plan_id,status,billing_cycle,renewal_date) VALUES ($1,$2,'active','yearly',now() + interval '1 year')",
    [AI_STARTER, starter]
  );
  const [starterResult] = await as("service_role", AI_STARTER, "ai-starter@example.com", () =>
    q("SELECT * FROM public.consume_ai_credit($1)", [AI_STARTER]));
  assert.equal(starterResult.allowed, true);
  assert.equal(starterResult.plan_code, "starter");
  assert.equal(starterResult.quota, 1000);

  await db.query("UPDATE public.subscriptions SET renewal_date=now() - interval '1 day' WHERE user_id=$1", [AI_STARTER]);
  const [expiredResult] = await as("service_role", AI_STARTER, "ai-starter@example.com", () =>
    q("SELECT * FROM public.consume_ai_credit($1)", [AI_STARTER]));
  assert.equal(expiredResult.allowed, true);
  assert.equal(expiredResult.plan_code, "free");
  assert.equal(expiredResult.quota, 50);
});

test("BOQ generation quota is enforced atomically with AI credits", async () => {
  const AI_BOQ_FREE = "00000000-0000-4000-8000-0000000000c8";
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'ai-boq-free@example.com')", [AI_BOQ_FREE]);
  const allowed = await as("service_role", AI_BOQ_FREE, "ai-boq-free@example.com", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push((await q("SELECT * FROM public.consume_ai_credit($1, 'boq_generations')", [AI_BOQ_FREE]))[0]);
    }
    return results;
  });
  assert.ok(allowed.every((r) => r.allowed === true));
  const [blocked] = await as("service_role", AI_BOQ_FREE, "ai-boq-free@example.com", () =>
    q("SELECT * FROM public.consume_ai_credit($1, 'boq_generations')", [AI_BOQ_FREE]));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "boq_generations");
  assert.equal(blocked.used, 5);
  assert.equal(blocked.quota, 5);
  const [usage] = await q("SELECT ai_credits, boq_generations FROM public.usage_records WHERE user_id=$1", [AI_BOQ_FREE]);
  assert.equal(usage.ai_credits, 5);
  assert.equal(usage.boq_generations, 5);
});

test("AI credit quota: administrators remain operational without a subscription", async () => {
  const [result] = await as("service_role", ADMIN, "zobaerio24@gmail.com", () =>
    q("SELECT * FROM public.consume_ai_credit($1)", [ADMIN]));
  assert.equal(result.allowed, true);
  assert.equal(result.plan_code, "admin");
  assert.equal(result.quota, -1);
});


test("premium plan feature checks are server-only and follow current, unexpired plan limits", async () => {
  const AI_FEATURE_FREE = "00000000-0000-4000-8000-0000000000c6";
  const AI_FEATURE_STARTER = "00000000-0000-4000-8000-0000000000c7";
  const AI_PRO = "00000000-0000-4000-8000-0000000000c5";
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'ai-feature-free@example.com'),($2,'ai-feature-starter@example.com'),($3,'ai-feature-pro@example.com')", [AI_FEATURE_FREE, AI_FEATURE_STARTER, AI_PRO]);

  await alice(() => rejects(
    () => db.query("SELECT public.user_has_plan_feature($1, 'ai_writer')", [ALICE]),
    /permission denied/
  ));
  await anon(() => rejects(
    () => db.query("SELECT public.user_has_plan_feature($1, 'ai_writer')", [AI_FREE]),
    /permission denied/
  ));

  const [freeWriter] = await as("service_role", AI_FEATURE_FREE, "ai-feature-free@example.com", () =>
    q("SELECT public.user_has_plan_feature($1, 'ai_writer') AS allowed", [AI_FEATURE_FREE]));
  assert.equal(freeWriter.allowed, false);

  const [{ id: starter }] = await q("SELECT id FROM public.plans WHERE code='starter'");
  await db.query(
    "INSERT INTO public.subscriptions (user_id,plan_id,status,billing_cycle,renewal_date) VALUES ($1,$2,'active','yearly',now() + interval '1 year')",
    [AI_FEATURE_STARTER, starter]
  );
  const [starterTender] = await as("service_role", AI_FEATURE_STARTER, "ai-feature-starter@example.com", () =>
    q("SELECT public.user_has_plan_feature($1, 'tender') AS allowed", [AI_FEATURE_STARTER]));
  const [starterWriter] = await as("service_role", AI_FEATURE_STARTER, "ai-feature-starter@example.com", () =>
    q("SELECT public.user_has_plan_feature($1, 'ai_writer') AS allowed", [AI_FEATURE_STARTER]));
  assert.equal(starterTender.allowed, true);
  assert.equal(starterWriter.allowed, false);

  const [{ id: professional }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  await db.query(
    "INSERT INTO public.subscriptions (user_id,plan_id,status,billing_cycle,renewal_date) VALUES ($1,$2,'active','yearly',now() + interval '1 year')",
    [AI_PRO, professional]
  );
  const [proWriter] = await as("service_role", AI_PRO, "ai-feature-pro@example.com", () =>
    q("SELECT public.user_has_plan_feature($1, 'ai_writer') AS allowed", [AI_PRO]));
  assert.equal(proWriter.allowed, true);

  await db.query("UPDATE public.subscriptions SET renewal_date=now() - interval '1 day' WHERE user_id=$1", [AI_PRO]);
  const [expiredWriter] = await as("service_role", AI_PRO, "ai-feature-pro@example.com", () =>
    q("SELECT public.user_has_plan_feature($1, 'ai_writer') AS allowed", [AI_PRO]));
  assert.equal(expiredWriter.allowed, false);
});

test("signup never automatically grants admin to an allowlisted email", async () => {
  const candidate = "00000000-0000-4000-8000-0000000000c4";
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'zobaerhasan431@gmail.com')", [candidate]);
  const [{ role }] = await q("SELECT role::text AS role FROM public.user_roles WHERE user_id=$1", [candidate]);
  assert.equal(role, "user");
  assert.equal((await q("SELECT public.has_role($1,'admin') AS admin", [candidate]))[0].admin, false);
});

test("existing explicitly bootstrapped admin role is preserved", async () => {
  assert.equal((await q("SELECT public.has_role($1,'admin') AS admin", [ADMIN]))[0].admin, true);
});

test("security: mutable trigger/helper functions have a pinned search_path", async () => {
  const names = [
    "viz_guard_update",
    "try_uuid",
    "profiles_protect_referral_fields",
    "withdrawals_guard_update",
  ];
  const rows = await q(
    `SELECT p.proname, p.proconfig
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [names]
  );
  assert.equal(rows.length, names.length);
  for (const row of rows) {
    assert.ok(Array.isArray(row.proconfig), `${row.proname} must have explicit function configuration`);
    assert.ok(
      row.proconfig.some((value) => value === "search_path=pg_catalog, public, pg_temp" || value === "search_path=pg_catalog,public,pg_temp"),
      `${row.proname} must pin search_path to pg_catalog, public, pg_temp; got ${JSON.stringify(row.proconfig)}`
    );
  }
});

test("agent rate limiter: only service_role can invoke it", async () => {
  await alice(() => rejects(() => db.query("SELECT * FROM public.consume_agent_rate_limit($1)", [ALICE]), /permission denied/));
  await anon(() => rejects(() => db.query("SELECT * FROM public.consume_agent_rate_limit($1)", [ALICE]), /permission denied/));
});

test("agent rate limiter: atomically caps requests at five per minute", async () => {
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await as("service_role", ALICE, "alice@example.com", () =>
      q("SELECT * FROM public.consume_agent_rate_limit($1)", [ALICE])));
  }
  assert.ok(results.every((r) => r[0].allowed === true));
  const [blocked] = await as("service_role", ALICE, "alice@example.com", () =>
    q("SELECT * FROM public.consume_agent_rate_limit($1)", [ALICE]));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "minute");
  assert.equal(blocked.minute_count, 5);
});

test("agent rate limiter: enforces the 24-hour cap", async () => {
  await db.query("DELETE FROM public.agent_rate_limit_events WHERE user_id=$1", [BOB]);
  await db.query(
    "INSERT INTO public.agent_rate_limit_events (user_id, created_at) SELECT $1, now() - (n || ' minutes')::interval FROM generate_series(2, 41) n",
    [BOB]
  );
  const [limited] = await as("service_role", BOB, "bob@example.com", () =>
    q("SELECT * FROM public.consume_agent_rate_limit($1)", [BOB]));
  assert.equal(limited.allowed, false);
  assert.equal(limited.reason, "day");
  assert.equal(limited.day_count, 40);
});

test("agent core schema: client roles can read only their own task history", async () => {
  const [{ id: aliceTask }] = await db.query(
    "INSERT INTO public.agent_tasks (agent_type,user_id,objective,status) VALUES ('user',$1,'alice task','completed') RETURNING id",
    [ALICE]
  ).then(r => r.rows);
  await db.query(
    "INSERT INTO public.agent_tasks (agent_type,user_id,objective,status) VALUES ('user',$1,'bob task','completed')",
    [BOB]
  );
  const aliceRows = await alice(() => q("SELECT objective FROM public.agent_tasks ORDER BY objective"));
  assert.deepEqual(aliceRows.map((r) => r.objective), ["alice task"]);
  const adminRows = await admin(() => q("SELECT objective FROM public.agent_tasks ORDER BY objective"));
  assert.deepEqual(adminRows.map((r) => r.objective), ["alice task", "bob task"]);
  await alice(() => rejects(
    () => db.query("INSERT INTO public.agent_tasks (agent_type,user_id,objective) VALUES ('user',$1,'forged task')", [ALICE]),
    /permission denied/
  ));
  assert.ok(aliceTask);
});

test("agent core schema: audit and approval rows are read-restricted", async () => {
  const [{ id: taskId }] = (await db.query(
    "INSERT INTO public.agent_tasks (agent_type,user_id,objective) VALUES ('user',$1,'approval fixture') RETURNING id",
    [ALICE]
  )).rows;
  await db.query(
    "INSERT INTO public.agent_steps (task_id,agent_type,actor_user_id,kind,status) VALUES ($1,'user',$2,'received','ok')",
    [taskId, ALICE]
  );
  await db.query(
    "INSERT INTO public.agent_approvals (task_id,requested_by,tool,tool_input,risk_level,status) VALUES ($1,$2,'dangerous_tool','{}','HIGH','pending')",
    [taskId, ALICE]
  );
  const aliceSteps = await alice(() => q("SELECT count(*)::int n FROM public.agent_steps WHERE task_id=$1", [taskId]));
  assert.equal(aliceSteps[0].n, 1);
  const aliceApprovals = await alice(() => q("SELECT id FROM public.agent_approvals"));
  assert.equal(aliceApprovals.length, 0);
  const adminApprovals = await admin(() => q("SELECT count(*)::int n FROM public.agent_approvals"));
  assert.equal(adminApprovals[0].n, 1);
});

test("agent core schema: cron key and automation mutations are server-only", async () => {
  await alice(() => rejects(() => q("SELECT key FROM public.agent_cron_key"), /permission denied/));
  await alice(() => rejects(
    () => db.query("INSERT INTO public.agent_automations (owner_id,name,kind,frequency) VALUES ($1,'x','health_check','daily')", [ALICE]),
    /permission denied/
  ));
  assert.equal((await q("SELECT count(*)::int n FROM public.agent_cron_key")).at(0).n, 1);
});


test("SECURITY DEFINER authorization helpers reject caller-selected target users", async () => {
  const projectId = "00000000-0000-4000-8000-0000000000e1";
  const vizId = "00000000-0000-4000-8000-0000000000e2";
  await db.query(
    "INSERT INTO public.projects (id,user_id,name) VALUES ($1,$2,'Bob private project')",
    [projectId, BOB]
  );
  await db.query(
    "INSERT INTO public.construction_visualizations (id,user_id,name) VALUES ($1,$2,'Bob private visualization')",
    [vizId, BOB]
  );

  const [roleProbe] = await alice(() =>
    q("SELECT public.has_role($1,'admin'::public.app_role) AS allowed", [ADMIN]));
  assert.equal(roleProbe.allowed, false);

  const [projectRole] = await alice(() =>
    q("SELECT public.get_project_role($1,$2) AS role", [projectId, BOB]));
  assert.equal(projectRole.role, null);

  const [membershipProbe] = await alice(() =>
    q("SELECT public.is_project_member($1,$2) AS member", [projectId, BOB]));
  assert.equal(membershipProbe.member, false);

  const [vizRole] = await alice(() =>
    q("SELECT public.viz_role($1,$2) AS role", [vizId, BOB]));
  assert.equal(vizRole.role, null);

  const [readProbe] = await alice(() =>
    q("SELECT public.viz_can_read($1,$2) AS allowed", [vizId, BOB]));
  assert.equal(readProbe.allowed, false);

  const [writeProbe] = await alice(() =>
    q("SELECT public.viz_can_write($1,$2) AS allowed", [vizId, BOB]));
  assert.equal(writeProbe.allowed, false);
});

test("SECURITY DEFINER authorization helpers pin their search_path", async () => {
  const names = ["has_role", "get_project_role", "is_project_member", "viz_role", "viz_can_read", "viz_can_write"];
  const rows = await q(
    `SELECT p.proname, p.proconfig
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [names]
  );
  assert.equal(rows.length, names.length);
  for (const row of rows) {
    assert.ok(Array.isArray(row.proconfig), `${row.proname} should have an explicit search_path`);
    assert.ok(
      row.proconfig.some((value) => value === "search_path=pg_catalog, public, pg_temp" || value === "search_path=pg_catalog,public,pg_temp"),
      `${row.proname} search_path was not pinned: ${JSON.stringify(row.proconfig)}`
    );
  }
});


test("admin_process_payment: non-admin callers cannot verify or reject payments", async () => {
  const [{ id: plan }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  let paymentId;
  await bob(async () => {
    const [row] = await q("INSERT INTO public.payments(user_id,plan_id,amount,billing_cycle,transaction_id) VALUES ($1,$2,1,'yearly','TX-BILLING-AUDIT-VERIFY') RETURNING id", [BOB, plan]);
    paymentId = row.id;
  });
  await alice(() => rejects(
    () => db.query("SELECT public.admin_process_payment($1,'verify',NULL)", [paymentId]),
    /Billing: Manage permission required/
  ));
  const [row] = await q("SELECT status FROM public.payments WHERE id=$1", [paymentId]);
  assert.equal(row.status, "pending");
});

test("admin_process_payment: verification activates subscription and writes an atomic audit event", async () => {
  const [{ id: plan }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  let paymentId;
  await bob(async () => {
    const [row] = await q("INSERT INTO public.payments(user_id,plan_id,amount,billing_cycle,transaction_id) VALUES ($1,$2,1,'yearly','TX-BILLING-AUDIT-APPROVE') RETURNING id", [BOB, plan]);
    paymentId = row.id;
  });
  await admin(() => db.query("SELECT public.admin_process_payment($1,'verify',NULL)", [paymentId]));
  const [payment] = await q("SELECT status,subscription_id FROM public.payments WHERE id=$1", [paymentId]);
  assert.equal(payment.status, "verified");
  assert.ok(payment.subscription_id);
  const [audit] = await q("SELECT action,previous_status,new_status,target_user_id FROM public.admin_billing_audit WHERE payment_id=$1", [paymentId]);
  assert.deepEqual(audit, {action:"payment_verified",previous_status:"pending",new_status:"verified",target_user_id:BOB});
  await admin(() => rejects(
    () => db.query("SELECT public.admin_process_payment($1,'verify',NULL)", [paymentId]),
    /Only pending payments can be reviewed/
  ));
});

test("admin_process_payment: rejection records reason and cannot be replayed", async () => {
  const [{ id: plan }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  let paymentId;
  await bob(async () => {
    const [row] = await q("INSERT INTO public.payments(user_id,plan_id,amount,billing_cycle,transaction_id) VALUES ($1,$2,1,'yearly','TX-BILLING-AUDIT-REJECT') RETURNING id", [BOB, plan]);
    paymentId = row.id;
  });
  await admin(() => db.query("SELECT public.admin_process_payment($1,'reject','Transaction reference did not match')", [paymentId]));
  const [payment] = await q("SELECT status,admin_note FROM public.payments WHERE id=$1", [paymentId]);
  assert.equal(payment.status, "failed");
  assert.equal(payment.admin_note, "Transaction reference did not match");
  const [audit] = await q("SELECT action,note,new_status FROM public.admin_billing_audit WHERE payment_id=$1", [paymentId]);
  assert.deepEqual(audit, {action:"payment_rejected",note:"Transaction reference did not match",new_status:"failed"});
  await admin(() => rejects(
    () => db.query("SELECT public.admin_process_payment($1,'reject','again')", [paymentId]),
    /Only pending payments can be reviewed/
  ));
});

test("admin billing audit cannot be read directly by authenticated users", async () => {
  assert.equal((await q("SELECT has_table_privilege('authenticated','public.admin_billing_audit','SELECT') AS allowed"))[0].allowed, false);
});


test("billing.manage sub-admin can verify payments through the atomic audited workflow", async () => {
  const [membership] = await q(
    "INSERT INTO public.admin_memberships(user_id,role,status,assigned_by) VALUES ($1,'sub_admin','active',$2) RETURNING id",
    [BOB, ADMIN]
  );
  await db.query(
    "INSERT INTO public.admin_feature_permissions(membership_id,feature_key,action,granted_by) VALUES ($1,'billing','manage',$2)",
    [membership.id, ADMIN]
  );
  const [{ id: plan }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  let paymentId;
  await bob(async () => {
    const [row] = await q("INSERT INTO public.payments(user_id,plan_id,amount,billing_cycle,transaction_id) VALUES ($1,$2,1,'yearly','TX-SUBADMIN-BILLING') RETURNING id", [BOB, plan]);
    paymentId = row.id;
    await db.query("SELECT public.admin_process_payment($1,'verify',NULL)", [paymentId]);
  });
  const [payment] = await q("SELECT status FROM public.payments WHERE id=$1", [paymentId]);
  assert.equal(payment.status, "verified");
  const [audit] = await q("SELECT actor_user_id,action FROM public.admin_billing_audit WHERE payment_id=$1", [paymentId]);
  assert.deepEqual(audit, {actor_user_id:BOB,action:"payment_verified"});
});


test("billing.view-only sub-admin cannot verify or reject a pending payment", async () => {
  const [membership] = await q(
    "INSERT INTO public.admin_memberships(user_id,role,status,assigned_by) VALUES ($1,'sub_admin','active',$2) RETURNING id",
    [ALICE, ADMIN]
  );
  await db.query(
    "INSERT INTO public.admin_feature_permissions(membership_id,feature_key,action,granted_by) VALUES ($1,'billing','view',$2)",
    [membership.id, ADMIN]
  );
  const [{ id: plan }] = await q("SELECT id FROM public.plans WHERE code='professional'");
  let paymentId;
  await bob(async () => {
    const [row] = await q("INSERT INTO public.payments(user_id,plan_id,amount,billing_cycle,transaction_id) VALUES ($1,$2,1,'yearly','TX-SUBADMIN-VIEW-ONLY') RETURNING id", [BOB, plan]);
    paymentId = row.id;
  });
  await alice(() => rejects(
    () => db.query("SELECT public.admin_process_payment($1,'verify',NULL)", [paymentId]),
    /Billing: Manage permission required/
  ));
  assert.equal((await q("SELECT status FROM public.payments WHERE id=$1", [paymentId]))[0].status, "pending");
});

test("admin_ai_usage_summary: only admins can read monthly aggregate counters", async () => {
  const period = "2099-11";
  const previous = "2099-10";
  await db.query(
    "INSERT INTO public.usage_records(user_id,period,ai_credits,projects,boq_generations,bbs_generations,drawings,reports,storage_mb) VALUES ($1,$2,12,2,3,4,5,6,7),($3,$2,8,1,2,1,0,1,3),($1,$4,99,99,99,99,99,99,99)",
    [ALICE,period,BOB,previous]
  );
  const [{ summary }] = await admin(async () => q(
    "SELECT public.admin_ai_usage_summary($1) AS summary", [period]
  ));
  assert.equal(summary.accounts, 2);
  assert.equal(summary.ai_credits, 20);
  assert.equal(summary.projects, 3);
  assert.equal(summary.boq_generations, 5);
  assert.equal(summary.bbs_generations, 5);
  assert.equal(summary.drawings, 5);
  assert.equal(summary.reports, 7);
  assert.equal(Number(summary.storage_mb), 10);
  const [membership] = await q(
    "INSERT INTO public.admin_memberships(user_id,role,status,assigned_by) VALUES ($1,'sub_admin','active',$2) ON CONFLICT (user_id) DO UPDATE SET role='sub_admin',status='active' RETURNING id",
    [BOB, ADMIN]
  );
  await db.query(
    "INSERT INTO public.admin_feature_permissions(membership_id,feature_key,action,granted_by) VALUES ($1,'ai_usage','view',$2) ON CONFLICT (membership_id,feature_key,action) DO NOTHING",
    [membership.id, ADMIN]
  );
  await bob(async () => {
    const [{ summary: subSummary }] = await q("SELECT public.admin_ai_usage_summary($1) AS summary", [period]);
    assert.equal(subSummary.ai_credits, 20);
  });
  await alice(() => rejects(
    () => db.query("SELECT public.admin_ai_usage_summary($1)", [period]),
    /AI Usage: View permission required/
  ));
});

test("admin AI usage access audit is not readable by authenticated users", async () => {
  assert.equal((await q("SELECT has_table_privilege('authenticated','public.admin_ai_usage_audit','SELECT') AS allowed"))[0].allowed, false);
});

test("privileged admin audit tables deny direct client access and retain service-role access", async () => {
  const protectedTables = [
    "admin_user_access_audit",
    "admin_project_access_audit",
    "admin_billing_audit",
    "admin_ai_usage_audit",
  ];
  for (const table of protectedTables) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const [{ anon_allowed, authenticated_allowed }] = await q(
        "SELECT has_table_privilege('anon',$1,$2) AS anon_allowed, has_table_privilege('authenticated',$1,$2) AS authenticated_allowed",
        [`public.${table}`, privilege]
      );
      assert.equal(anon_allowed, false, `anon must not have ${privilege} on ${table}`);
      assert.equal(authenticated_allowed, false, `authenticated must not have ${privilege} on ${table}`);
    }
    const [{ service_select, service_insert }] = await q(
      "SELECT has_table_privilege('service_role',$1,'SELECT') AS service_select, has_table_privilege('service_role',$1,'INSERT') AS service_insert",
      [`public.${table}`]
    );
    assert.equal(service_select, true, `service_role should read ${table}`);
    assert.equal(service_insert, true, `service_role should write ${table}`);
  }
});

test("RBAC audit rows are visible to Super Admin only, not ordinary authenticated users", async () => {
  await db.query(
    "INSERT INTO public.admin_rbac_audit(actor_user_id,action,metadata) VALUES ($1,'permission_granted','{\"security_test_marker\":\"audit_visibility\"}'::jsonb)",
    [ADMIN]
  );
  const [ordinaryCount] = await alice(() => q(
    "SELECT count(*)::int AS count FROM public.admin_rbac_audit WHERE metadata->>'security_test_marker'='audit_visibility'"
  ));
  assert.equal(ordinaryCount.count, 0);
  const [superAdminCount] = await admin(() => q(
    "SELECT count(*)::int AS count FROM public.admin_rbac_audit WHERE metadata->>'security_test_marker'='audit_visibility'"
  ));
  assert.equal(superAdminCount.count, 1);
});


test("SECURITY DEFINER identity helpers cannot reveal another user's admin, project or visualization role", async () => {
  const [{ id: projectId }] = await q(
    "INSERT INTO public.projects(user_id,name) VALUES ($1,'Security Identity Probe Project') RETURNING id",
    [BOB]
  );
  const [{ id: visualizationId }] = await q(
    "INSERT INTO public.construction_visualizations(user_id,name) VALUES ($1,'Security Identity Probe Visualization') RETURNING id",
    [BOB]
  );

  await alice(async () => {
    const [probe] = await q(
      `SELECT
        public.has_role($1,'admin') AS other_admin,
        public.get_project_role($2,$1)::text AS other_project_role,
        public.is_project_member($2,$1) AS other_project_member,
        public.viz_role($3,$1) AS other_visualization_role,
        public.viz_can_read($3,$1) AS other_visualization_read,
        public.viz_can_write($3,$1) AS other_visualization_write`,
      [BOB, projectId, visualizationId]
    );
    assert.deepEqual(probe, {
      other_admin: false,
      other_project_role: null,
      other_project_member: false,
      other_visualization_role: null,
      other_visualization_read: false,
      other_visualization_write: false,
    });
  });

  // The same helpers must continue to work for the authenticated caller's own identity.
  await bob(async () => {
    const [own] = await q(
      `SELECT
        public.get_project_role($1,$2)::text AS project_role,
        public.is_project_member($1,$2) AS project_member,
        public.viz_role($3,$2) AS visualization_role,
        public.viz_can_read($3,$2) AS visualization_read,
        public.viz_can_write($3,$2) AS visualization_write`,
      [projectId, BOB, visualizationId]
    );
    assert.deepEqual(own, {
      project_role: "admin",
      project_member: true,
      visualization_role: "owner",
      visualization_read: true,
      visualization_write: true,
    });
  });
});


test("authenticated SECURITY DEFINER RPCs use a pinned safe search_path", async () => {
  const rows = await q(`
    SELECT p.proname, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ORDER BY p.proname
  `);
  assert.equal(rows.length, 17, "expected all 17 authenticated SECURITY DEFINER RPCs to be present");
  for (const row of rows) {
    assert.ok(
      row.proconfig?.includes("search_path=pg_catalog, public, pg_temp"),
      `${row.proname} must pin pg_catalog first and pg_temp last; got ${JSON.stringify(row.proconfig)}`
    );
  }
});
