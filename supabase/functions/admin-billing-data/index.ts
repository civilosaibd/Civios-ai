import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("CIVILOS_ALLOWED_ORIGINS") || "https://civilosai.pro.bd,https://civilosai.vercel.app,https://civilosai.lovable.app").split(",").map((v) => v.trim()).filter(Boolean);
const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});
const reply = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (origin && !allowedOrigins.includes(origin)) return reply({ error: "Origin not allowed" }, 403, origin);
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") || "";
  if (!url || !anonKey || !serviceKey || !authorization.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401, origin);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Invalid session" }, 401, origin);
  const { data: isAdmin, error: roleError } = await caller.rpc("has_role", { _user_id: authData.user.id, _role: "admin" });
  if (roleError || isAdmin !== true) return reply({ error: "Admin access required" }, 403, origin);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: { action?: string; kind?: string; status?: string; search?: string; page?: number; paymentId?: string; note?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400, origin); }

  if (body.action === "review-payment") {
    const paymentId = String(body.paymentId || "");
    const decision = body.status || "";
    const note = String(body.note || "").trim().slice(0, 500);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId) || !["verified", "failed"].includes(decision)) {
      return reply({ error: "Invalid payment review request" }, 400, origin);
    }
    if (decision === "failed" && note.length < 8) return reply({ error: "A rejection note of at least 8 characters is required" }, 400, origin);
    const { data: payment, error: paymentError } = await admin.from("payments").select("id,user_id,status,billing_cycle").eq("id", paymentId).maybeSingle();
    if (paymentError || !payment) return reply({ error: "Payment not found" }, 404, origin);
    if (payment.status !== "pending") return reply({ error: "Only pending payments can be reviewed" }, 409, origin);
    if (decision === "verified" && payment.billing_cycle !== "yearly") return reply({ error: "Legacy monthly payments cannot be approved. Ask the user to submit a yearly payment instead." }, 409, origin);

    const { error: rpcError } = decision === "verified"
      ? await caller.rpc("approve_payment", { _payment_id: paymentId })
      : await caller.rpc("reject_payment", { _payment_id: paymentId, _note: note });
    if (rpcError) {
      await admin.from("admin_billing_audit").insert({ admin_user_id: authData.user.id, target_user_id: payment.user_id, payment_id: paymentId, action: decision === "verified" ? "approve_payment" : "reject_payment", result: "failed", note: rpcError.message.slice(0, 500) });
      return reply({ error: rpcError.message }, 409, origin);
    }
    const { error: auditError } = await admin.from("admin_billing_audit").insert({
      admin_user_id: authData.user.id, target_user_id: payment.user_id, payment_id: paymentId,
      action: decision === "verified" ? "approve_payment" : "reject_payment", result: "succeeded", note: note || null,
    });
    return reply({ success: true, auditWarning: !!auditError }, 200, origin);
  }

  if (body.action !== "list") return reply({ error: "Unsupported action" }, 400, origin);
  const kind = body.kind === "subscriptions" ? "subscriptions" : "payments";
  const page = Math.max(1, Math.min(10000, Math.floor(Number(body.page) || 1)));
  const pageSize = 25;
  const search = String(body.search || "").trim().replace(/[(),%]/g, " ").slice(0, 80);
  const status = String(body.status || "").trim();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = kind === "payments"
    ? admin.from("payments").select("id,user_id,plan_id,subscription_id,amount,currency,billing_cycle,payment_provider,payment_method,transaction_id,sender_number,status,admin_note,invoice_number,verified_at,created_at,updated_at", { count: "exact" }).order("created_at", { ascending: false })
    : admin.from("subscriptions").select("id,user_id,plan_id,status,billing_cycle,start_date,renewal_date,cancelled_at,payment_provider,created_at,updated_at", { count: "exact" }).order("created_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    const safe = search.replace(/[%(),]/g, " ").trim();
    if (safe) query = query.or(kind === "payments"
      ? `invoice_number.ilike.%${safe}%,transaction_id.ilike.%${safe}%,user_id.eq.${safe}`
      : `user_id.eq.${safe},plan_id.eq.${safe}`);
  }
  const { data, error, count } = await query.range(from, to);
  if (error) return reply({ error: "Unable to load billing records" }, 500, origin);
  const rows = data || [];
  const ids = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
  const planIds = [...new Set(rows.map((r: any) => r.plan_id).filter(Boolean))];
  const [{ data: profiles }, { data: plans }] = await Promise.all([
    ids.length ? admin.from("profiles").select("id,display_name").in("id", ids) : Promise.resolve({ data: [] }),
    planIds.length ? admin.from("plans").select("id,name,code").in("id", planIds) : Promise.resolve({ data: [] }),
  ]);
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const planMap = new Map((plans || []).map((p: any) => [p.id, p]));
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authMap = new Map((users.data?.users || []).map((u: any) => [u.id, u]));
  const enriched = rows.map((row: any) => {
    const profile: any = profileMap.get(row.user_id);
    const auth: any = authMap.get(row.user_id);
    return { ...row, owner_name: profile?.display_name || auth?.user_metadata?.full_name || auth?.user_metadata?.name || null, owner_email: auth?.email || null, plan_name: (planMap.get(row.plan_id) as any)?.name || null, plan_code: (planMap.get(row.plan_id) as any)?.code || null };
  });
  await admin.from("admin_billing_audit").insert({ admin_user_id: authData.user.id, action: "view_billing", result: "succeeded", note: kind });
  return reply({ rows: enriched, total: count || 0, page, page_size: pageSize, has_more: from + rows.length < (count || 0) }, 200, origin);
});
