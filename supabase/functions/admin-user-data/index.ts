import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ADMIN_USER_DATA_ALLOWED_ORIGINS") ||
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

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401, origin);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: legacyAdmin }, { data: superAdmin }, { data: canViewUsers }, { data: canManageUsers }] = await Promise.all([
    callerClient.rpc("has_role", { _user_id: authData.user.id, _role: "admin" }),
    callerClient.rpc("is_super_admin"),
    callerClient.rpc("has_admin_permission", { _feature_key: "users", _action: "view" }),
    callerClient.rpc("has_admin_permission", { _feature_key: "users", _action: "manage" }),
  ]);

  let body: { action?: string; userId?: string; page?: number; status?: string; reason?: string; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, origin); }
  const mayViewUsers = legacyAdmin === true || superAdmin === true || canViewUsers === true;
  const mayManageUsers = legacyAdmin === true || superAdmin === true || canManageUsers === true;
  if (body.action === "audit-list") {
    if (legacyAdmin !== true && superAdmin !== true) return json({ error: "Super Admin access required" }, 403, origin);
  } else if (body.action === "account-status") {
    if (!mayManageUsers) return json({ error: "Users: Manage permission required" }, 403, origin);
  } else if (!mayViewUsers) {
    return json({ error: "Users: View permission required" }, 403, origin);
  }

  if (body.action === "account-status") {
    const userId = body.userId || "";
    const status = body.status || "";
    const reason = String(body.reason || "").trim().slice(0,500);
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return json({error:"A valid user ID is required"},400,origin);
    }
    if (!["suspended","active"].includes(status)) return json({error:"Unsupported account status"},400,origin);
    if (userId === authData.user.id) return json({error:"You cannot suspend or reactivate your own account"},403,origin);
    if (status === "suspended" && reason.length < 8) return json({error:"A suspension reason of at least 8 characters is required"},400,origin);
    const [{data: targetRole,error: roleError},{data: membership,error: membershipError}] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id",userId).maybeSingle(),
      admin.from("admin_memberships").select("role").eq("user_id",userId).maybeSingle(),
    ]);
    if (roleError || membershipError) return json({error:"Unable to verify target account privileges"},500,origin);
    if (targetRole?.role === "admin" || membership) return json({error:"Administrator and sub-admin accounts must be managed through the Super Admin team workspace"},403,origin);
    const action = status === "suspended" ? "suspend_account" : "reactivate_account";
    const {data:audit,error:auditError} = await admin.from("admin_account_status_audit").insert({
      admin_user_id:authData.user.id,target_user_id:userId,action,result:"requested",reason:reason || null,
    }).select("id").single();
    if (auditError || !audit) return json({error:"Could not create required account-action audit record"},500,origin);
    const {data:changed,error:changeError} = await admin.auth.admin.updateUserById(userId,{
      ban_duration:status === "suspended" ? "876000h" : "none",
    });
    if (changeError || !changed.user) {
      await admin.from("admin_account_status_audit").update({result:"failed"}).eq("id",audit.id);
      return json({error:"Account status could not be changed"},409,origin);
    }
    const {error:finalAuditError} = await admin.from("admin_account_status_audit").update({result:"succeeded"}).eq("id",audit.id);
    if (finalAuditError) return json({error:"Account changed, but audit finalization failed; investigate this event"},500,origin);
    const suspended = !!changed.user.banned_until && new Date(changed.user.banned_until).getTime() > Date.now();
    return json({success:true,status:suspended ? "suspended" : "active",user:{id:changed.user.id,banned_until:changed.user.banned_until || null}},200,origin);
  }

  if (body.action === "list") {
    const page = Math.max(1, Math.min(1000, Number(body.page) || 1));
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return json({ error: "Unable to load users" }, 500, origin);
    const ids = data.users.map((u) => u.id);
    const [{ data: profiles, error: profileError }, { data: subs, error: subError }, { data: roles, error: roleListError }, { data: memberships, error: membershipError }] = await Promise.all([
      admin.from("profiles").select("id,display_name,avatar_url,created_at,referral_code").in("id", ids),
      admin.from("subscriptions").select("user_id,plan_id,status,billing_cycle,start_date,renewal_date").in("user_id", ids),
      admin.from("user_roles").select("user_id,role").in("user_id", ids),
      admin.from("admin_memberships").select("user_id,role,status").in("user_id", ids),
    ]);
    if (profileError || subError || roleListError || membershipError) {
      return json({ error: "Unable to load complete account directory" }, 500, origin);
    }
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const subMap = new Map((subs || []).map((s) => [s.user_id, s]));
    const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role]));
    const membershipMap = new Map((memberships || []).map((m) => [m.user_id, m]));
    return json({
      users: data.users.map((u) => ({
        id: u.id, email: u.email, phone: u.phone,
        email_confirmed_at: u.email_confirmed_at, phone_confirmed_at: u.phone_confirmed_at,
        created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until || null,
        is_suspended: !!u.banned_until && new Date(u.banned_until).getTime() > Date.now(),
        providers: u.app_metadata?.providers || [],
        display_name: profileMap.get(u.id)?.display_name || u.user_metadata?.full_name || u.user_metadata?.name || null,
        avatar_url: profileMap.get(u.id)?.avatar_url || null,
        subscription: subMap.get(u.id) || null,
        role: membershipMap.get(u.id)?.role || roleMap.get(u.id) || "user",
        admin_membership_status: membershipMap.get(u.id)?.status || null,
      })),
      page, has_more: data.users.length === 100,
    }, 200, origin);
  }

  if (body.action === "details") {
    const userId = body.userId;
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return json({ error: "A valid user ID is required" }, 400, origin);
    }
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData.user) return json({ error: "User not found" }, 404, origin);

    // Explicit projections intentionally exclude private content, credentials, tokens,
    // payment identifiers, agent memory values, and raw project/document payloads.
    const ownedTables: Record<string, { owner: string; columns: string }> = {
      profiles: { owner: "id", columns: "id,display_name,avatar_url,created_at,updated_at,referral_code,referred_by" },
      subscriptions: { owner: "user_id", columns: "id,user_id,plan_id,status,billing_cycle,start_date,renewal_date,cancelled_at,payment_provider,created_at,updated_at" },
      payments: { owner: "user_id", columns: "id,user_id,plan_id,subscription_id,amount,currency,billing_cycle,payment_provider,payment_method,status,invoice_number,verified_at,created_at,updated_at" },
      projects: { owner: "user_id", columns: "id,user_id,name,file_name,created_at,updated_at,is_public,client_name,location,project_type,status,budget,start_date,end_date" },
      usage_records: { owner: "user_id", columns: "id,user_id,period,ai_credits,projects,boq_generations,bbs_generations,drawings,reports,storage_mb,updated_at,created_at" },
      referrals: { owner: "referrer_id", columns: "id,referrer_id,referred_user_id,plan,commission_amount,status,created_at" },
      withdrawals: { owner: "user_id", columns: "id,user_id,amount,method,status,requested_at,paid_at,approved_at" },
      site_logs: { owner: "user_id", columns: "id,user_id,project_id,log_date,created_at,updated_at" },
      tender_analyses: { owner: "user_id", columns: "id,user_id,title,created_at,updated_at" },
      notifications: { owner: "user_id", columns: "id,user_id,type,title,read,created_at,project_id" },
      agent_tasks: { owner: "user_id", columns: "id,agent_type,user_id,status,risk_level,approval_required,created_at,started_at,completed_at" },
      notification_settings: { owner: "user_id", columns: "user_id,deadline_alerts,team_invites,member_joined,boq_updates,material_price,document_uploads,email_enabled,deadline_days_before,updated_at" },
      user_feature_settings: { owner: "user_id", columns: "user_id,feature_key,enabled,updated_at" },
      user_roles: { owner: "user_id", columns: "id,user_id,role,created_at" },
      construction_visualizations: { owner: "user_id", columns: "id,project_id,user_id,name,status,building_type,floor_count,approx_area_sqft,location,unit_system,source_type,created_at,updated_at" },
      agent_memory: { owner: "user_id", columns: "id,user_id,agent_type,key,created_at,updated_at" },
      agent_automations: { owner: "owner_id", columns: "id,owner_id,name,kind,frequency,enabled,next_run_at,last_run_at,last_status,fail_count,created_at" },
      agent_steps: { owner: "actor_user_id", columns: "id,task_id,agent_type,actor_user_id,kind,tool,target,risk_level,status,created_at" },
      agent_approvals: { owner: "requested_by", columns: "id,task_id,requested_by,tool,risk_level,status,decided_by,decided_at,created_at" },
      project_activity: { owner: "user_id", columns: "id,project_id,user_id,action,created_at" },
      project_documents: { owner: "uploaded_by", columns: "id,project_id,file_name,file_type,file_size,uploaded_by,created_at" },
      project_members: { owner: "user_id", columns: "id,project_id,user_id,role,invited_by,status,joined_at,last_active_at" },
      invitations: { owner: "invited_by", columns: "id,project_id,invited_email,role,invited_by,status,created_at,accepted_at,expires_at,accepted_by,sent_at,last_sent_at" },
    };

    const records: Record<string, unknown[]> = {};
    const unavailableTables: string[] = [];
    await Promise.all(Object.entries(ownedTables).map(async ([table, config]) => {
      const { data, error } = await admin.from(table).select(config.columns).eq(config.owner, userId).limit(100);
      if (error) {
        records[table] = [];
        unavailableTables.push(table);
      } else {
        records[table] = data || [];
      }
    }));

    const { data: referredRows, error: referredError } = await admin.from("referrals")
      .select("id,referrer_id,referred_user_id,plan,commission_amount,status,created_at")
      .eq("referred_user_id", userId).limit(100);
    if (referredError) unavailableTables.push("referrals_as_customer");
    else if (referredRows?.length) records.referrals_as_customer = referredRows;

    const { error: auditError } = await admin.from("admin_user_access_audit").insert({
      admin_user_id: authData.user.id, target_user_id: userId, action: "view_user_details",
    });
    if (auditError) return json({ error: "Unable to record privileged access; details were not returned" }, 500, origin);

    const u = userData.user;
    const metadata = u.user_metadata || {};
    return json({
      user: {
        id: u.id, email: u.email, phone: u.phone,
        email_confirmed_at: u.email_confirmed_at, phone_confirmed_at: u.phone_confirmed_at,
        created_at: u.created_at, updated_at: u.updated_at, last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until || null,
        is_suspended: !!u.banned_until && new Date(u.banned_until).getTime() > Date.now(),
        providers: u.app_metadata?.providers || [],
        metadata: {
          full_name: metadata.full_name || null,
          name: metadata.name || null,
          avatar_url: metadata.avatar_url || null,
        },
      },
      records,
      unavailable_tables: [...new Set(unavailableTables)].sort(),
      security_notice: "Private project contents, uploaded file references, invitation tokens, payment account identifiers, agent memory values, conversation content, authentication secrets, password hashes, MFA secrets, and session tokens are excluded.",
    }, 200, origin);
  }

  if (body.action === "audit-list") {
    const requestedLimit = Number((body as { limit?: number }).limit) || 50;
    const limit = Math.max(1, Math.min(100, requestedLimit));
    const { data: events, error: auditListError } = await admin.from("admin_user_access_audit")
      .select("id,admin_user_id,target_user_id,action,accessed_at")
      .order("accessed_at", { ascending: false })
      .limit(limit);
    if (auditListError) return json({ error: "Unable to load access audit history" }, 500, origin);

    const ids = [...new Set((events || []).flatMap((event) => [event.admin_user_id, event.target_user_id]))];
    const emailById = new Map<string, string | null>();
    await Promise.all(ids.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      emailById.set(id, error ? null : data.user?.email || null);
    }));
    return json({
      events: (events || []).map((event) => ({
        ...event,
        admin_email: emailById.get(event.admin_user_id) || null,
        target_email: emailById.get(event.target_user_id) || null,
      })),
    }, 200, origin);
  }

  return json({ error: "Unsupported action" }, 400, origin);
});
