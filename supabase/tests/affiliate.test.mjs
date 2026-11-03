// Affiliate commission tests (Phase 3). Runs ALL real migrations in PGlite.
//   npm i --no-save @electric-sql/pglite && node --test supabase/tests/affiliate.test.mjs
// Policy / function level only — NOT a substitute for a staging run on real Supabase.
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

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CAROL = "00000000-0000-4000-8000-0000000000d1"; // referrer
const DAVE = "00000000-0000-4000-8000-0000000000d2";  // referred by Carol, honest
const ERIN = "00000000-0000-4000-8000-0000000000d3";  // referred by Carol, same sender number as Carol
const FRANK = "00000000-0000-4000-8000-0000000000d4"; // not referred
const GINA = "00000000-0000-4000-8000-0000000000d5"; // referred by Carol, duplicate transaction id
const HANK = "00000000-0000-4000-8000-0000000000d6"; // referred by Carol, Business is first payment
let db, carolCode;

async function as(role, uid, email, fn) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid ?? ""}',false);
    SELECT set_config('request.jwt.claims','${JSON.stringify(uid ? { sub: uid, email } : {})}',false); SET ROLE ${role};`);
  try { return await fn(); } finally { await db.exec("RESET ROLE"); }
}
const u = (id, email) => (fn) => as("authenticated", id, email, fn);
const carol = u(CAROL, "carol@x.com"), dave = u(DAVE, "dave@x.com"), erin = u(ERIN, "erin@x.com"), frank = u(FRANK, "frank@x.com"), gina = u(GINA, "gina@x.com"), hank = u(HANK, "hank@x.com"), admin = u(ADMIN, "zobaerio24@gmail.com");
const rejects = (p, re) => assert.rejects(Promise.resolve().then(p), re);
const q = async (sql, p) => (await db.query(sql, p)).rows;
const plan = async (code) => { const r = (await q("SELECT id, price_yearly::numeric p FROM public.plans WHERE code=$1", [code]))[0]; return { id: r.id, p: Number(r.p) }; };
const pct = (price, rate = 0.10) => Math.round(Number(price) * rate * 100) / 100;
const near = (a, b) => assert.ok(Math.abs(Number(a) - Number(b)) < 0.005, `expected ${b}, got ${a}`);

// a user files a payment through the real client path (trigger sets amount/status)
async function pay(who, code, tx, sender) {
  const p = await plan(code);
  await who(() => db.query("INSERT INTO public.payments (user_id,plan_id,billing_cycle,transaction_id,sender_number) VALUES (current_setting('request.jwt.claim.sub')::uuid,$1,'yearly',$2,$3)", [p.id, tx, sender ?? null]));
  return (await q("SELECT id FROM public.payments WHERE transaction_id=$1 ORDER BY created_at DESC LIMIT 1", [tx]))[0].id;
}
const approve = (id) => admin(() => db.query("SELECT public.approve_payment($1)", [id]));

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (f === "20261030130000_super_admin_rbac_foundation.sql") {
      await db.query("INSERT INTO auth.users (id,email,email_confirmed_at) VALUES ($1,'zobaerio24@gmail.com',now())", [ADMIN]);
    }
    try { await db.exec(readFileSync(join(migDir, f), "utf8")); } catch (e) { throw new Error(`migration ${f}: ${e.message}`); }
  }
  // Bootstrap test administrator as a trusted operator; signup itself never grants admin.
  await db.query("INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT (user_id, role) DO NOTHING", [ADMIN]);
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'carol@x.com'),($2,'frank@x.com')", [CAROL, FRANK]);
  carolCode = (await q("SELECT referral_code c FROM public.profiles WHERE id=$1", [CAROL]))[0].c;
  // sign-ups through the real trigger, carrying ?ref=<carol's code> in the auth metadata
  for (const [id, email] of [[DAVE, "dave@x.com"], [ERIN, "erin@x.com"], [GINA, "gina@x.com"], [HANK, "hank@x.com"]])
    await db.query("INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ($1,$2,$3::jsonb)", [id, email, JSON.stringify({ ref: carolCode })]);
});

test("signup with a referral code creates a pending referral worth 0 (nothing is earned at signup)", async () => {
  const r = await q("SELECT status, commission_amount::numeric c FROM public.referrals WHERE referrer_id=$1 ORDER BY referred_user_id", [CAROL]);
  assert.equal(r.length, 4);
  assert.ok(r.every((x) => x.status === "pending" && Number(x.c) === 0));
});

test("a referred user's first eligible verified payment pays EXACTLY 30%", async () => {
  const id = await pay(dave, "professional", "TX-DAVE-1", "01811111111");
  assert.equal((await q("SELECT count(*)::int n FROM public.referral_commissions"))[0].n, 0); // pending payment earns nothing
  await approve(id);
  const [c] = await q("SELECT base_amount::numeric b, rate::numeric r, commission_amount::numeric c, status FROM public.referral_commissions WHERE payment_id=$1", [id]);
  const pro = await plan("professional");
  assert.equal(Number(c.b), pro.p);
  near(c.r, 0.30);
  near(c.c, pct(pro.p, 0.30)); // 30%
  assert.equal(c.status, "approved");
  const [ref] = await q("SELECT status, plan, commission_amount::numeric c FROM public.referrals WHERE referred_user_id=$1", [DAVE]);
  assert.deepEqual({ status: ref.status, plan: ref.plan, c: Number(ref.c) }, { status: "converted", plan: "professional", c: Number(c.c) });
});

test("replay / double processing cannot pay the same payment twice", async () => {
  const [{ id }] = await q("SELECT id FROM public.payments WHERE transaction_id='TX-DAVE-1'");
  await admin(() => rejects(() => db.query("SELECT public.approve_payment($1)", [id]), /already verified/));
  await db.query("SELECT public.record_referral_commission($1)", [id]); // even a direct re-run (as the owner role) is a no-op
  assert.equal((await q("SELECT count(*)::int n FROM public.referral_commissions WHERE payment_id=$1", [id]))[0].n, 1);
  // the internal function is not callable by clients at all
  await carol(() => rejects(() => db.query("SELECT public.record_referral_commission($1)", [id]), /permission denied/));
  await anonCall(id);
});
async function anonCall(id) {
  await as("anon", null, null, () => rejects(() => db.query("SELECT public.record_referral_commission($1)", [id]), /permission denied/));
}

test("Business first verified payment earns 30%, and the following payment earns 10%", async () => {
  const id = await pay(hank, "business", "TX-HANK-1", "01866666666");
  await approve(id);
  const biz = await plan("business");
  const [first] = await q("SELECT base_amount::numeric b, rate::numeric r, commission_amount::numeric c, status FROM public.referral_commissions WHERE payment_id=$1", [id]);
  near(first.b, biz.p); near(first.r, 0.30); near(first.c, pct(biz.p, 0.30));
  assert.equal(first.status, "approved");
  const later = await pay(hank, "starter", "TX-HANK-2", "01866666666");
  await approve(later);
  const [repeat] = await q("SELECT rate::numeric r, base_amount::numeric b, commission_amount::numeric c FROM public.referral_commissions WHERE payment_id=$1", [later]);
  assert.equal((await q("SELECT count(*)::int n FROM public.referral_commissions WHERE referred_user_id=$1", [HANK]))[0].n, 2);
  near(repeat.r, 0.10);
  const starter = await plan("starter");
  near(repeat.b, starter.p); near(repeat.c, pct(starter.p));
});

test("Starter, Professional and Business payments are eligible for 30% first and 10% repeat commissions", async () => {
  const id = await pay(dave, "business", "TX-DAVE-2", "01811111111");
  await approve(id);
  const pro = await plan("professional");
  const rows = await q("SELECT payment_id FROM public.referral_commissions WHERE referred_user_id=$1", [DAVE]);
  assert.equal(rows.length, 2);
  assert.equal((await q("SELECT count(*)::int n FROM public.referral_commissions WHERE payment_id=$1", [id]))[0].n, 1);
  const [commission] = await q("SELECT base_amount::numeric b, rate::numeric r, commission_amount::numeric c FROM public.referral_commissions WHERE payment_id=$1", [id]);
  const business = await plan("business");
  near(commission.b, business.p);
  near(commission.r, 0.10);
  near(commission.c, pct(business.p));
});

test("a user who was not referred, or who refers themselves, never earns", async () => {
  const id = await pay(frank, "starter", "TX-FRANK-1", "01922222222");
  await approve(id);
  assert.equal((await q("SELECT count(*)::int n FROM public.referral_commissions WHERE payment_id=$1", [id]))[0].n, 0);
  await rejects(() => db.query("INSERT INTO public.referrals (referrer_id, referred_user_id) VALUES ($1,$1)", [FRANK]), /referrals_no_self_referral/);
  // even if a self-referral row existed from before the constraint, the function refuses to pay it
  await db.query("ALTER TABLE public.referrals DROP CONSTRAINT referrals_no_self_referral");
  await db.query("INSERT INTO public.referrals (referrer_id, referred_user_id) VALUES ($1,$1)", [FRANK]);
  const id2 = await pay(frank, "professional", "TX-FRANK-2", "01922222222");
  await approve(id2);
  assert.equal((await q("SELECT count(*)::int n FROM public.referral_commissions WHERE referred_user_id=$1", [FRANK]))[0].n, 0);
  await db.query("DELETE FROM public.referrals WHERE referred_user_id=$1", [FRANK]);
  await db.query("ALTER TABLE public.referrals ADD CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_user_id) NOT VALID");
});

test("Starter first payment earns 30% and suspicious sender numbers are flagged, even if standard rate changes", async () => {
  await pay(carol, "starter", "TX-CAROL-1", "01733333333"); // Carol's own payment (pending is enough)
  await db.query("UPDATE public.app_settings SET value='0.2'::jsonb WHERE key='affiliate.commission_rate'");
  const id = await pay(erin, "starter", "TX-ERIN-1", "01733-333333");
  await approve(id);
  const [c] = await q("SELECT status, flag_reason, base_amount::numeric b, rate::numeric r, commission_amount::numeric c FROM public.referral_commissions WHERE payment_id=$1", [id]);
  const st = await plan("starter");
  assert.equal(c.status, "flagged");
  assert.match(c.flag_reason, /sender number/);
  near(c.b, st.p); near(c.r, 0.30); near(c.c, pct(st.p, 0.30));
  assert.equal((await q("SELECT status FROM public.referrals WHERE referred_user_id=$1", [ERIN]))[0].status, "flagged");
  await db.query("UPDATE public.app_settings SET value='0.10'::jsonb WHERE key='affiliate.commission_rate'");
});

test("duplicate transaction id on a new referred user's first payment is held for review", async () => {
  const dup = await pay(gina, "starter", "TX-ERIN-1", "01844444444"); // reuses Erin's transaction id
  await approve(dup);
  const [c] = await q("SELECT status, flag_reason FROM public.referral_commissions WHERE payment_id=$1", [dup]);
  assert.equal(c.status, "flagged"); assert.match(c.flag_reason, /Transaction ID/);
});

test("balance counts only approved commission; stats and the withdrawal check agree", async () => {
  const s = await carol(async () => (await db.query("SELECT public.my_affiliate_stats() s")).rows[0].s);
  const pro = await plan("professional"), biz = await plan("business"), st = await plan("starter");
  const approved = pct(pro.p, 0.30) + pct(biz.p, 0.30) + pct(biz.p, 0.10) + pct((await plan("starter")).p, 0.10);
  near(s.earned, approved);
  near(s.in_review, pct(st.p, 0.30) * 2);
  near(s.available, approved);
  assert.equal(s.referred, 4);
  await carol(() => rejects(() => db.query("SELECT public.request_withdrawal($1,'bKash','01700000000')", [approved + 1]), /exceeds available balance/));
  await carol(() => db.query("SELECT public.request_withdrawal(500,'bKash','01700000000')"));
  const s2 = await carol(async () => (await db.query("SELECT public.my_affiliate_stats() s")).rows[0].s);
  near(s2.available, approved - 500);
  assert.equal(Number(s2.requested), 500);
});

test("only an admin can review a flagged commission; approving makes it withdrawable, once", async () => {
  const [f] = await q("SELECT id FROM public.referral_commissions WHERE status='flagged' ORDER BY created_at LIMIT 1");
  await carol(() => rejects(() => db.query("SELECT public.review_commission($1,true)", [f.id]), /Admin only/));
  await admin(() => db.query("SELECT public.review_commission($1,true,'checked manually')", [f.id]));
  const [row] = await q("SELECT status, reviewed_by, reviewed_at FROM public.referral_commissions WHERE id=$1", [f.id]);
  assert.equal(row.status, "approved"); assert.equal(row.reviewed_by, ADMIN); assert.ok(row.reviewed_at);
  await admin(() => rejects(() => db.query("SELECT public.review_commission($1,false)", [f.id]), /Only flagged/));
  const s = await carol(async () => (await db.query("SELECT public.my_affiliate_stats() s")).rows[0].s);
  assert.ok(Number(s.earned) > 0 && Number(s.in_review) > 0);
  // rejecting the other flagged one removes it from review and never adds it to the balance
  const [g] = await q("SELECT id FROM public.referral_commissions WHERE status='flagged' LIMIT 1");
  const before = Number((await carol(async () => (await db.query("SELECT public.my_affiliate_stats() s")).rows[0].s)).earned);
  await admin(() => db.query("SELECT public.review_commission($1,false,'duplicate')", [g.id]));
  const after = (await carol(async () => (await db.query("SELECT public.my_affiliate_stats() s")).rows[0].s));
  assert.equal(Number(after.earned), before); assert.equal(Number(after.in_review), 0);
});

test("clients cannot write or forge the commission ledger, and only see their own rows", async () => {
  await carol(() => rejects(() => db.query("INSERT INTO public.referral_commissions (referral_id,referrer_id,referred_user_id,base_amount,rate,commission_amount) SELECT id,referrer_id,referred_user_id,1,1,99999 FROM public.referrals LIMIT 1"), /permission denied/));
  await carol(() => rejects(() => db.query("UPDATE public.referral_commissions SET commission_amount=99999, status='approved'"), /permission denied/));
  await carol(() => rejects(() => db.query("DELETE FROM public.referral_commissions"), /permission denied/));
  assert.ok((await carol(async () => (await db.query("SELECT count(*)::int n FROM public.referral_commissions")).rows[0].n)) > 0);
  assert.equal(await frank(async () => (await db.query("SELECT count(*)::int n FROM public.referral_commissions")).rows[0].n), 0);
  assert.equal(await dave(async () => (await db.query("SELECT count(*)::int n FROM public.referral_commissions")).rows[0].n), 0);
  assert.ok((await admin(async () => (await db.query("SELECT count(*)::int n FROM public.referral_commissions")).rows[0].n)) >= 6);
  await as("anon", null, null, () => rejects(() => db.query("SELECT * FROM public.referral_commissions"), /permission denied/));
});

test("each later eligible verified payment earns 10%, not another 30%", async () => {
  await db.query("UPDATE public.app_settings SET value='0.10'::jsonb WHERE key='affiliate.commission_rate'");
  const before = (await q("SELECT count(*)::int n FROM public.referral_commissions WHERE referred_user_id=$1", [ERIN]))[0].n;
  const id = await pay(erin, "professional", "TX-ERIN-9", "01955555555");
  await approve(id);
  assert.equal((await q("SELECT count(*)::int n FROM public.referral_commissions WHERE referred_user_id=$1", [ERIN]))[0].n, before + 1);
  const [c] = await q("SELECT rate::numeric r, base_amount::numeric b, commission_amount::numeric c FROM public.referral_commissions WHERE payment_id=$1", [id]);
  const pro = await plan("professional");
  near(c.r, 0.10); near(c.b, pro.p); near(c.c, pct(pro.p));
});


test("affiliate payout update and audit are atomic and the RPC is service-role-only", async () => {
  const [withdrawal] = await q(
    "SELECT id FROM public.withdrawals WHERE user_id=$1 AND status='pending' ORDER BY requested_at DESC LIMIT 1",
    [CAROL],
  );
  assert.ok(withdrawal, "the balance test should have created a pending withdrawal");

  await carol(() => rejects(
    () => db.query("SELECT public.admin_update_affiliate_withdrawal($1,$2,'approved',NULL,NULL)", [ADMIN, withdrawal.id]),
    /permission denied/,
  ));

  await as("service_role", null, null, async () => {
    await db.query(
      "SELECT public.admin_update_affiliate_withdrawal($1,$2,'approved','test approval',NULL)",
      [ADMIN, withdrawal.id],
    );
  });
  assert.equal((await q("SELECT status FROM public.withdrawals WHERE id=$1", [withdrawal.id]))[0].status, "approved");
  assert.equal((await q(
    "SELECT count(*)::int n FROM public.admin_action_audit WHERE target_id=$1 AND action='affiliate_withdrawal_approved'",
    [withdrawal.id],
  ))[0].n, 1);

  await db.exec(`
    CREATE FUNCTION public.test_fail_affiliate_payout_audit() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'affiliate_withdrawal_paid' THEN
        RAISE EXCEPTION 'forced audit failure for atomicity test';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER test_fail_affiliate_payout_audit
    BEFORE INSERT ON public.admin_action_audit
    FOR EACH ROW EXECUTE FUNCTION public.test_fail_affiliate_payout_audit();
  `);

  await as("service_role", null, null, () => rejects(
    () => db.query(
      "SELECT public.admin_update_affiliate_withdrawal($1,$2,'paid',NULL,'TEST-TRX-001')",
      [ADMIN, withdrawal.id],
    ),
    /forced audit failure/,
  ));
  const [afterRollback] = await q("SELECT status, paid_at FROM public.withdrawals WHERE id=$1", [withdrawal.id]);
  assert.equal(afterRollback.status, "approved", "withdrawal update must roll back when audit insert fails");
  assert.equal(afterRollback.paid_at, null);

  await db.exec("DROP TRIGGER test_fail_affiliate_payout_audit ON public.admin_action_audit; DROP FUNCTION public.test_fail_affiliate_payout_audit();");
  await as("service_role", null, null, async () => {
    await db.query(
      "SELECT public.admin_update_affiliate_withdrawal($1,$2,'paid',NULL,' TEST-TRX-001 ')",
      [ADMIN, withdrawal.id],
    );
  });
  const [paid] = await q("SELECT status, transaction_reference, paid_at FROM public.withdrawals WHERE id=$1", [withdrawal.id]);
  assert.equal(paid.status, "paid");
  assert.equal(paid.transaction_reference, "TEST-TRX-001");
  assert.ok(paid.paid_at);
  assert.equal((await q(
    "SELECT count(*)::int n FROM public.admin_action_audit WHERE target_id=$1 AND action='affiliate_withdrawal_paid'",
    [withdrawal.id],
  ))[0].n, 1);
});
