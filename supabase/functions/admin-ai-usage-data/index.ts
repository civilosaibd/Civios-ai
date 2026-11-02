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
  const [{data:legacyAdmin},{data:superAdmin},{data:canViewUsage}] = await Promise.all([
    caller.rpc("has_role", { _user_id: authData.user.id, _role: "admin" }),
    caller.rpc("is_super_admin"),
    caller.rpc("has_admin_permission", { _feature_key: "ai_usage", _action: "view" }),
  ]);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: { action?: string; page?: number; period?: string; search?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400, origin); }
  if (body.action !== "list") return reply({ error: "Unsupported action" }, 400, origin);
  if (legacyAdmin !== true && superAdmin !== true && canViewUsage !== true) return reply({error:"AI Usage: View permission required"},403,origin);

  const page = Math.max(1, Math.min(10000, Math.floor(Number(body.page) || 1)));
  const pageSize = 25;
  const period = String(body.period || "").trim();
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return reply({ error: "Period must be YYYY-MM" }, 400, origin);
  const search = String(body.search || "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
  let query = admin.from("usage_records")
    .select("id,user_id,period,ai_credits,projects,boq_generations,bbs_generations,drawings,reports,storage_mb,created_at,updated_at", { count: "exact" })
    .order("period", { ascending: false }).order("updated_at", { ascending: false });
  if (period) query = query.eq("period", period);
  if (search) {
    if (!isUuid) return reply({ rows: [], total: 0, page, page_size: pageSize, has_more: false }, 200, origin);
    query = query.eq("user_id", search);
  }
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) return reply({ error: "Unable to load AI usage counters" }, 500, origin);
  const rows = data || [];
  const ids = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const authResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authMap = new Map((authResult.data?.users || []).map((u: any) => [u.id, u]));
  const enriched = rows.map((row: any) => {
    const profile: any = profileMap.get(row.user_id);
    const auth: any = authMap.get(row.user_id);
    return { ...row, owner_name: profile?.display_name || auth?.user_metadata?.full_name || auth?.user_metadata?.name || null, owner_email: auth?.email || null };
  });
  await admin.from("admin_ai_usage_audit").insert({ admin_user_id: authData.user.id, action: "list_ai_usage", period: period || null });
  return reply({ rows: enriched, total: count || 0, page, page_size: pageSize, has_more: from + rows.length < (count || 0) }, 200, origin);
});
