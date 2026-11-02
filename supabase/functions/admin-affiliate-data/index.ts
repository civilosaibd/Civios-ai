import { createClient } from "npm:@supabase/supabase-js@2";
const origins = (Deno.env.get("ADMIN_USER_DATA_ALLOWED_ORIGINS") || "https://civilosai.pro.bd,https://civilosai.vercel.app,https://civilosai.lovable.app").split(",").map((x) => x.trim()).filter(Boolean);
const headers = (origin: string | null) => ({ "Access-Control-Allow-Origin": origin && origins.includes(origin) ? origin : origins[0], "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Vary": "Origin" });
const reply = (body: unknown, status = 200, origin: string | null = null) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (origin && !origins.includes(origin)) return reply({ error: "Origin not allowed" }, 403, origin);
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply({ error: "Server configuration incomplete" }, 500, origin);
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401, origin);
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Invalid session" }, 401, origin);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{data:legacyAdmin},{data:superAdmin},{data:canViewAffiliate},{data:canManageAffiliate}] = await Promise.all([
    caller.rpc("has_role",{_user_id:auth.user.id,_role:"admin"}),
    caller.rpc("is_super_admin"),
    caller.rpc("has_admin_permission",{_feature_key:"affiliate",_action:"view"}),
    caller.rpc("has_admin_permission",{_feature_key:"affiliate",_action:"manage"}),
  ]);
  let body: { action?: string; withdrawalId?: string; status?: string; adminNote?: string; transactionReference?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400, origin); }
  const mayViewAffiliate=legacyAdmin===true||superAdmin===true||canViewAffiliate===true;
  const mayManageAffiliate=legacyAdmin===true||superAdmin===true||canManageAffiliate===true;
  if(body.action==="withdrawal-update" ? !mayManageAffiliate : !mayViewAffiliate) {
    return reply({error:body.action==="withdrawal-update"?"Affiliate: Manage permission required":"Affiliate: View permission required"},403,origin);
  }

  if (body.action === "list") {
    const [rr, cr, wr, er] = await Promise.all([
      db.from("referrals").select("id,referrer_id,referred_user_id,plan,commission_amount,status,created_at").order("created_at", { ascending: false }).limit(2000),
      db.from("referral_commissions").select("id,referral_id,referrer_id,referred_user_id,payment_id,base_amount,rate,commission_amount,status,flag_reason,reviewed_at,created_at").order("created_at", { ascending: false }).limit(5000),
      db.from("withdrawals").select("id,user_id,amount,method,account_number,status,requested_at,approved_at,paid_at,admin_note,transaction_reference,reviewed_at").order("requested_at", { ascending: false }).limit(2000),
      db.from("referral_events").select("referrer_id,event_type").limit(100000),
    ]);
    if (rr.error || cr.error || wr.error || er.error) return reply({ error: "Unable to load complete affiliate records and engagement analytics" }, 500, origin);
    const referrals = rr.data || [], commissions = cr.data || [], withdrawals = wr.data || [], events = er.data || [];
    const eventCounts = new Map<string, { share_actions: number; link_clicks: number }>();
    for (const event of events) {
      const count = eventCounts.get(event.referrer_id) || { share_actions: 0, link_clicks: 0 };
      if (event.event_type === "share_action") count.share_actions += 1;
      if (event.event_type === "link_click") count.link_clicks += 1;
      eventCounts.set(event.referrer_id, count);
    }
    const ids = [...new Set([...referrals.flatMap((r) => [r.referrer_id, r.referred_user_id]), ...withdrawals.map((w) => w.user_id), ...eventCounts.keys()])].filter(Boolean);
    const { data: profiles, error: profileError } = ids.length ? await db.from("profiles").select("id,display_name,avatar_url,referral_code").in("id", ids) : { data: [], error: null };
    if (profileError) return reply({ error: "Unable to load affiliate profiles" }, 500, origin);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const contacts = new Map<string, { email: string | null; phone: string | null }>();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return reply({ error: "Unable to load affiliate contact details" }, 500, origin);
      for (const u of data.users) contacts.set(u.id, { email: u.email || null, phone: u.phone || null });
      if (data.users.length < 1000) break;
    }
    const affiliates = [...new Set([...referrals.map((r) => r.referrer_id), ...withdrawals.map((w) => w.user_id), ...eventCounts.keys()])].map((id) => {
      const ownRefs = referrals.filter((r) => r.referrer_id === id), ownComms = commissions.filter((c) => c.referrer_id === id), ownWithdrawals = withdrawals.filter((w) => w.user_id === id);
      const total = (rows: any[], statuses: string[], field: string) => rows.filter((x) => statuses.includes(x.status)).reduce((s, x) => s + Number(x[field] || 0), 0);
      return { user_id: id, name: profileMap.get(id)?.display_name || null, ...(contacts.get(id) || { email: null, phone: null }), referral_code: profileMap.get(id)?.referral_code || null,
        referrals: ownRefs.length, conversions: ownRefs.filter((r) => r.status === "converted").length,
        share_actions: eventCounts.get(id)?.share_actions || 0, link_clicks: eventCounts.get(id)?.link_clicks || 0,
        first_tier_commissions: ownComms.filter((c) => Number(c.rate) === 0.3).length, subsequent_tier_commissions: ownComms.filter((c) => Number(c.rate) === 0.1).length,
        earned: total(ownComms, ["approved"], "commission_amount"), under_review: total(ownComms, ["flagged"], "commission_amount"),
        available: total(ownComms, ["approved"], "commission_amount") - total(ownWithdrawals, ["pending", "approved", "paid"], "amount"),
        referrals_detail: ownRefs.map((r) => ({ ...r, referred_name: profileMap.get(r.referred_user_id)?.display_name || null, referred_email: contacts.get(r.referred_user_id)?.email || null })) };
    });
    const audit = await db.from("admin_action_audit").insert({ admin_user_id: auth.user.id, action: "view_affiliate_control_center", target_type: "affiliate_directory", details: { affiliate_count: affiliates.length, referral_count: referrals.length, engagement_event_count: events.length } });
    if (audit.error) return reply({ error: "Unable to record privileged access; records were not returned" }, 500, origin);
    return reply({ affiliates, commissions, withdrawals, can_manage: mayManageAffiliate, totals: { affiliates: affiliates.length, referrals: referrals.length, conversions: referrals.filter((r) => r.status === "converted").length,
      commission_approved: totalAll(commissions, ["approved"]), commission_flagged: totalAll(commissions, ["flagged"]), withdrawals_paid: totalAll(withdrawals, ["paid"]) } }, 200, origin);
  }
  if (body.action === "withdrawal-update") {
    const id = body.withdrawalId || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply({ error: "A valid withdrawal ID is required" }, 400, origin);
    if (!["approved", "rejected", "paid"].includes(body.status || "")) return reply({ error: "Unsupported withdrawal status" }, 400, origin);
    const { data: current, error } = await db.from("withdrawals").select("id,user_id,amount,method,status").eq("id", id).maybeSingle();
    if (error || !current) return reply({ error: "Withdrawal not found" }, 404, origin);
    const transitions: Record<string, string[]> = { pending: ["approved", "rejected"], approved: ["paid", "rejected"] };
    if (!transitions[current.status]?.includes(body.status!)) return reply({ error: `Invalid withdrawal transition: ${current.status} → ${body.status}` }, 409, origin);
    const reference = String(body.transactionReference || "").trim();
    if (body.status === "paid" && !reference) return reply({ error: "A payment transaction reference is required before marking paid" }, 400, origin);
    const now = new Date().toISOString(), update: Record<string, unknown> = { status: body.status, admin_note: String(body.adminNote || "").trim() || null, reviewed_by: auth.user.id, reviewed_at: now };
    if (body.status === "approved") update.approved_at = now;
    if (body.status === "paid") { update.paid_at = now; update.transaction_reference = reference; }
    const { data: changed, error: updateError } = await db.from("withdrawals").update(update).eq("id", id).eq("status", current.status).select("id,user_id,amount,method,status,requested_at,approved_at,paid_at,admin_note,transaction_reference").maybeSingle();
    if (updateError || !changed) return reply({ error: "Withdrawal could not be updated; refresh and retry" }, 409, origin);
    const audit = await db.from("admin_action_audit").insert({ admin_user_id: auth.user.id, action: `affiliate_withdrawal_${body.status}`, target_type: "withdrawal", target_id: id, details: { user_id: changed.user_id, amount: changed.amount, method: changed.method, transaction_reference: changed.transaction_reference || null } });
    if (audit.error) return reply({ error: "Withdrawal updated, but audit logging failed. Contact support before further payout actions." }, 500, origin);
    return reply({ withdrawal: changed }, 200, origin);
  }
  return reply({ error: "Unsupported action" }, 400, origin);
});
function totalAll(rows: any[], statuses: string[]) { return rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + Number(r.commission_amount ?? r.amount ?? 0), 0); }
