import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ADMIN_AI_USAGE_ALLOWED_ORIGINS") ||
  "https://civilosai.pro.bd,https://civilosai.vercel.app,https://civilosai.lovable.app")
  .split(",").map((value) => value.trim()).filter(Boolean);
const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});
const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (origin && !allowedOrigins.includes(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey || allowedOrigins.length === 0) return json({ error: "Server configuration incomplete" }, 500, origin);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401, origin);
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Invalid session" }, 401, origin);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: allowed, error: roleError } = await admin.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
  if (roleError || allowed !== true) return json({ error: "Admin access required" }, 403, origin);

  let body: { action?: string; period?: string; page?: number; search?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, origin); }
  if (body.action !== "list") return json({ error: "Unsupported action" }, 400, origin);

  const period = String(body.period || new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return json({ error: "Period must use YYYY-MM format" }, 400, origin);
  const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
  const pageSize = 25;
  const search = String(body.search || "").trim().slice(0, 80);
  const summaryPromise = caller.rpc("admin_ai_usage_summary", { _period: period });
  let query = admin.from("usage_records")
    .select("id,user_id,period,ai_credits,projects,boq_generations,bbs_generations,drawings,reports,storage_mb,created_at,updated_at", { count: "exact" })
    .eq("period", period)
    .order("ai_credits", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (search && isUuid(search)) query = query.eq("user_id", search);
  const [{ data: records, error, count }, { data: summary, error: summaryError }] = await Promise.all([query, summaryPromise]);
  if (error || summaryError) return json({ error: "Unable to load usage records and summary" }, 500, origin);

  // Audit every privileged usage inspection before returning account-level data.
  const { error: auditError } = await admin.from("admin_ai_usage_audit").insert({
    actor_user_id: auth.user.id, period, search_term: search || null,
  });
  if (auditError) return json({ error: "Unable to record privileged usage access" }, 500, origin);

  const ids = [...new Set((records || []).map((row) => row.user_id))];
  const [{ data: profiles, error: profileError }, { data: userPage, error: usersError }] = await Promise.all([
    ids.length ? admin.from("profiles").select("id,display_name,avatar_url").in("id", ids) : Promise.resolve({ data: [], error: null }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (profileError || usersError) return json({ error: "Unable to load usage account references" }, 500, origin);
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const emailMap = new Map((userPage?.users || []).map((account) => [account.id, account.email || null]));
  return json({
    period, summary,
    records: (records || []).map((row) => ({
      ...row,
      display_name: profileMap.get(row.user_id)?.display_name || null,
      avatar_url: profileMap.get(row.user_id)?.avatar_url || null,
      email: emailMap.get(row.user_id) || null,
    })),
    page, page_size: pageSize, total: count || 0, has_more: page * pageSize < (count || 0),
    metric_note: "These are the usage_records counters currently stored by CivilOS AI. They do not represent model token counts, provider costs, or per-request logs.",
  }, 200, origin);
});
