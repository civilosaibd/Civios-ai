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
  const token = req.headers.get("Authorization") || "";
  if (!token.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401, origin);
  const caller = createClient(url, anon, { global: { headers: { Authorization: token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Invalid session" }, 401, origin);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: allowed, error: roleError } = await db.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
  if (roleError || allowed !== true) return reply({ error: "Admin access required" }, 403, origin);
  let body: { action?: string; projectId?: string; page?: number; search?: string; status?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400, origin); }

  if (body.action === "list") {
    const page = Math.max(1, Math.min(10000, Number(body.page) || 1)), pageSize = 25;
    const term = String(body.search || "").trim().slice(0, 100);
    let query = db.from("projects").select("id,user_id,name,file_name,is_public,share_token,created_at,updated_at,status,client_name,location,project_type,budget,start_date,end_date", { count: "exact" });
    if (term) query = query.or(`name.ilike.%${term}%,file_name.ilike.%${term}%,client_name.ilike.%${term}%,location.ilike.%${term}%`);
    const { data: projects, error, count } = await query.order("updated_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return reply({ error: "Unable to load project directory" }, 500, origin);
    const ids = [...new Set((projects || []).map((p) => p.user_id))];
    const { data: profiles, error: profileError } = ids.length ? await db.from("profiles").select("id,display_name").in("id", ids) : { data: [], error: null };
    if (profileError) return reply({ error: "Unable to load project owners" }, 500, origin);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p.display_name]));
    const contactMap = new Map<string, { email: string | null; phone: string | null }>();
    for (const id of ids) {
      const { data, error: userError } = await db.auth.admin.getUserById(id);
      if (userError) return reply({ error: "Unable to load project owner contact details" }, 500, origin);
      contactMap.set(id, { email: data.user?.email || null, phone: data.user?.phone || null });
    }
    return reply({ projects: (projects || []).map((p) => ({ ...p, owner_name: profileMap.get(p.user_id) || null, ...(contactMap.get(p.user_id) || { email: null, phone: null }) })), page, page_size: pageSize, total: count || 0, has_more: page * pageSize < (count || 0) }, 200, origin);
  }

  if (body.action === "details") {
    const id = body.projectId || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply({ error: "A valid project ID is required" }, 400, origin);
    const { data: project, error } = await db.from("projects").select("id,user_id,name,inputs,estimate,bnbc_loads,file_name,created_at,updated_at,is_public,share_token,client_name,location,project_type,status,budget,start_date,end_date").eq("id", id).maybeSingle();
    if (error || !project) return reply({ error: "Project not found" }, 404, origin);
    const [{ data: profile }, { data: owner }, docs, activity, members] = await Promise.all([
      db.from("profiles").select("id,display_name").eq("id", project.user_id).maybeSingle(),
      db.auth.admin.getUserById(project.user_id),
      db.from("project_documents").select("id,project_id,file_name,file_type,file_size,uploaded_by,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(200),
      db.from("project_activity").select("id,project_id,user_id,action,details,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(200),
      db.from("project_members").select("id,project_id,user_id,role,status,joined_at,last_active_at").eq("project_id", id).limit(100),
    ]);
    if (docs.error || activity.error || members.error) return reply({ error: "Unable to load complete project history" }, 500, origin);
    const audit = await db.from("admin_project_access_audit").insert({ admin_user_id: auth.user.id, project_id: id, action: "view_project_details", details: { project_name: project.name } });
    if (audit.error) return reply({ error: "Unable to record privileged project access; details were not returned" }, 500, origin);
    return reply({ project, owner: { id: project.user_id, name: profile?.display_name || null, email: owner.data.user?.email || null, phone: owner.data.user?.phone || null }, documents: docs.data || [], activity: activity.data || [], members: members.data || [], security_notice: "Project detail access is audit-logged. File metadata is shown; raw storage paths and private download tokens are not exposed." }, 200, origin);
  }

  if (body.action === "update-status") {
    const id = body.projectId || "", status = body.status || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply({ error: "A valid project ID is required" }, 400, origin);
    if (!["planning", "in_progress", "on_hold", "completed", "cancelled"].includes(status)) return reply({ error: "Unsupported project status" }, 400, origin);
    const { data: updated, error } = await db.from("projects").update({ status }).eq("id", id).select("id,user_id,name,status,updated_at").maybeSingle();
    if (error || !updated) return reply({ error: "Project status could not be updated" }, 409, origin);
    const audit = await db.from("admin_project_access_audit").insert({ admin_user_id: auth.user.id, project_id: id, action: "update_project_status", details: { status } });
    if (audit.error) return reply({ error: "Status updated, but audit logging failed. Contact support." }, 500, origin);
    return reply({ project: updated }, 200, origin);
  }
  return reply({ error: "Unsupported action" }, 400, origin);
});
