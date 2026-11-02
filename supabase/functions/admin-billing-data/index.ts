import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ADMIN_BILLING_ALLOWED_ORIGINS") ||
  "https://civilosai.pro.bd,https://civilosai.vercel.app,https://civilosai.lovable.app")
  .split(",").map((value) => value.trim()).filter(Boolean);
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});
const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
const uuid = (value: unknown) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (origin && !allowedOrigins.includes(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey || allowedOrigins.length === 0) {
    return json({ error: "Server configuration incomplete" }, 500, origin);
  }
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401, origin);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Invalid session" }, 401, origin);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: allowed, error: roleError } = await admin.rpc("has_role", {
    _user_id: auth.user.id, _role: "admin",
  });
  if (roleError || allowed !== true) return json({ error: "Admin access required" }, 403, origin);

  let body: { action?: string; page?: number; pageSize?: number; status?: string; search?: string; paymentId?: string; decision?: string; note?: string; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, origin); }

  if (body.action === "review-payment") {
    if (!uuid(body.paymentId) || !["verify", "reject"].includes(String(body.decision))) {
      return json({ error: "A valid payment ID and decision are required" }, 400, origin);
    }
    const note = String(body.note || "").trim().slice(0, 500);
    const { data, error } = await caller.rpc("admin_process_payment", {
      _payment_id: body.paymentId, _decision: body.decision, _note: note || null,
    });
    if (error) return json({ error: error.message || "Payment review failed" }, 409, origin);
    return json({ success: true, result: data }, 200, origin);
  }

  if (body.action === "payment-list") {
    const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
    const pageSize = Math.max(10, Math.min(50, Number(body.pageSize) || 25));
    const status = String(body.status || "all");
    const search = String(body.search || "").trim().replace(/[%,().,*]/g, " ").replace(/\s+/g, " ").slice(0, 80);
    let query = admin.from("payments")
      .select("id,user_id,plan_id,subscription_id,amount,currency,billing_cycle,payment_provider,payment_method,transaction_id,sender_number,status,admin_note,invoice_number,verified_at,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (["pending", "verified", "failed"].includes(status)) query = query.eq("status", status);
    if (search) {
      if (uuid(search)) query = query.eq("user_id", search);
      else query = query.or(`invoice_number.ilike.%${search}%,transaction_id.ilike.%${search}%,sender_number.ilike.%${search}%`);
    }
    const [{ data: payments, error, count }, { data: plans, error: plansError },
      { count: pending, error: pendingError }, { count: verified, error: verifiedError }, { count: failed, error: failedError }] = await Promise.all([
      query,
      admin.from("plans").select("id,name,code,currency,price_yearly,is_active"),
      admin.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("payments").select("id", { count: "exact", head: true }).eq("status", "verified"),
      admin.from("payments").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    if (error || plansError || pendingError || verifiedError || failedError) {
      return json({ error: "Unable to load billing records" }, 500, origin);
    }
    const ids = [...new Set((payments || []).map((row) => row.user_id))];
    const [{ data: profiles, error: profileError }, { data: users, error: usersError }] = await Promise.all([
      ids.length ? admin.from("profiles").select("id,display_name,avatar_url").in("id", ids) : Promise.resolve({ data: [], error: null }),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (profileError || usersError) return json({ error: "Unable to load billing account references" }, 500, origin);
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const emailMap = new Map((users?.users || []).map((user) => [user.id, user.email || null]));
    return json({
      payments: (payments || []).map((row) => ({
        ...row,
        plan_name: (plans || []).find((plan) => plan.id === row.plan_id)?.name || "Unknown plan",
        account_name: profileMap.get(row.user_id)?.display_name || null,
        account_email: emailMap.get(row.user_id) || null,
      })),
      plans: plans || [],
      stats: { pending: pending || 0, verified: verified || 0, failed: failed || 0 },
      page, page_size: pageSize, total: count || 0, has_more: (page * pageSize) < (count || 0),
    }, 200, origin);
  }

  if (body.action === "subscription-list") {
    const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
    const pageSize = Math.max(10, Math.min(50, Number(body.pageSize) || 25));
    const status = String(body.status || "all");
    let query = admin.from("subscriptions")
      .select("id,user_id,plan_id,status,billing_cycle,start_date,renewal_date,cancelled_at,payment_provider,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (["active", "cancelled", "expired", "trialing"].includes(status)) query = query.eq("status", status);
    const { data: subscriptions, error, count } = await query;
    if (error) return json({ error: "Unable to load subscriptions" }, 500, origin);
    const ids = [...new Set((subscriptions || []).map((row) => row.user_id))];
    const [{ data: profiles, error: profileError }, { data: plans, error: plansError },
      { data: users, error: usersError }] = await Promise.all([
      ids.length ? admin.from("profiles").select("id,display_name").in("id", ids) : Promise.resolve({ data: [], error: null }),
      admin.from("plans").select("id,name,code"),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (profileError || plansError || usersError) return json({ error: "Unable to load subscription account references" }, 500, origin);
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const emailMap = new Map((users?.users || []).map((user) => [user.id, user.email || null]));
    const planMap = new Map((plans || []).map((plan) => [plan.id, plan.name]));
    return json({
      subscriptions: (subscriptions || []).map((row) => ({
        ...row, plan_name: planMap.get(row.plan_id) || "Unknown plan",
        account_name: profileMap.get(row.user_id)?.display_name || null,
        account_email: emailMap.get(row.user_id) || null,
      })),
      page, page_size: pageSize, total: count || 0, has_more: page * pageSize < (count || 0),
    }, 200, origin);
  }

  if (body.action === "audit-list") {
    const limit = Math.max(1, Math.min(200, Number(body.limit) || 100));
    const { data: events, error } = await admin.from("admin_billing_audit")
      .select("id,actor_user_id,payment_id,target_user_id,action,previous_status,new_status,amount,currency,note,created_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (error) return json({ error: "Unable to load billing audit history" }, 500, origin);
    const ids = [...new Set((events || []).flatMap((event) => [event.actor_user_id, event.target_user_id]).filter(Boolean))];
    const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ids.length ? admin.from("profiles").select("id,display_name").in("id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    if (usersError || profilesError) return json({ error: "Unable to load audit account references" }, 500, origin);
    const emailMap = new Map((users?.users || []).map((user) => [user.id, user.email || null]));
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile.display_name]));
    return json({ events: (events || []).map((event) => ({
      ...event, actor_email: emailMap.get(event.actor_user_id) || null,
      target_email: event.target_user_id ? emailMap.get(event.target_user_id) || null : null,
      target_name: event.target_user_id ? profileMap.get(event.target_user_id) || null : null,
    })) }, 200, origin);
  }

  return json({ error: "Unsupported action" }, 400, origin);
});
