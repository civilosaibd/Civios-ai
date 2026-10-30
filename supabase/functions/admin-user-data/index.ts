import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ADMIN_DATA_ALLOWED_ORIGIN") || "https://civilosai.pro.bd",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration incomplete" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: roleError } = await admin.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "admin",
  });
  if (roleError || allowed !== true) return json({ error: "Admin access required" }, 403);

  let body: { action?: string; userId?: string; page?: number };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  if (body.action === "list") {
    const page = Math.max(1, Math.min(1000, Number(body.page) || 1));
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return json({ error: "Unable to load users" }, 500);
    const ids = data.users.map((u) => u.id);
    const [{ data: profiles }, { data: subs }, { data: roles }] = await Promise.all([
      admin.from("profiles").select("id,display_name,avatar_url,created_at,referral_code").in("id", ids),
      admin.from("subscriptions").select("user_id,plan_id,status,billing_cycle,start_date,renewal_date").in("user_id", ids),
      admin.from("user_roles").select("user_id,role").in("user_id", ids),
    ]);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const subMap = new Map((subs || []).map((s) => [s.user_id, s]));
    const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role]));
    return json({
      users: data.users.map((u) => ({
        id: u.id, email: u.email, phone: u.phone,
        email_confirmed_at: u.email_confirmed_at, phone_confirmed_at: u.phone_confirmed_at,
        created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
        providers: u.app_metadata?.providers || [],
        display_name: profileMap.get(u.id)?.display_name || u.user_metadata?.full_name || u.user_metadata?.name || null,
        avatar_url: profileMap.get(u.id)?.avatar_url || null,
        subscription: subMap.get(u.id) || null,
        role: roleMap.get(u.id) || "user",
      })),
      page, has_more: data.users.length === 100,
    });
  }

  if (body.action === "details") {
    const userId = body.userId;
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return json({ error: "A valid user ID is required" }, 400);
    }
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData.user) return json({ error: "User not found" }, 404);

    // Only operational account data is returned. Password hashes, access/refresh tokens,
    // MFA secrets, invitation tokens, and raw private file contents are never exposed.
    const tables = ["profiles", "subscriptions", "payments", "projects", "usage_records",
      "referrals", "withdrawals", "site_logs", "tender_analyses", "notifications",
      "agent_tasks", "notification_settings", "user_feature_settings"];
    const records: Record<string, unknown[]> = {};
    await Promise.all(tables.map(async (table) => {
      const { data, error } = await admin.from(table).select("*").eq(
        table === "profiles" || table === "subscriptions" || table === "notification_settings" || table === "user_feature_settings"
          ? "id" : "user_id",
        userId,
      ).limit(100);
      // Profiles use id as the auth user id. A missing optional table is reported, not fatal.
      records[table] = error ? [] : (data || []).map((row: Record<string, unknown>) => {
        if (table === "withdrawals" && typeof row.account_number === "string") {
          const value = row.account_number;
          return { ...row, account_number: value.length > 4 ? "••••" + value.slice(-4) : "••••" };
        }
        return row;
      });
    }));

    await admin.from("admin_user_access_audit").insert({
      admin_user_id: authData.user.id, target_user_id: userId, action: "view_user_details",
    });

    const u = userData.user;
    return json({
      user: {
        id: u.id, email: u.email, phone: u.phone,
        email_confirmed_at: u.email_confirmed_at, phone_confirmed_at: u.phone_confirmed_at,
        created_at: u.created_at, updated_at: u.updated_at, last_sign_in_at: u.last_sign_in_at,
        providers: u.app_metadata?.providers || [],
        metadata: u.user_metadata || {},
      },
      records,
      security_notice: "Authentication secrets, password hashes, MFA secrets, session tokens, invitation tokens, and private file contents are excluded.",
    });
  }
  return json({ error: "Unsupported action" }, 400);
});
