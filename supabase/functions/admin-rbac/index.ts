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
const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2,"0")).join("");
};
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2,"0")).join("");
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (origin && !allowedOrigins.includes(origin)) return reply({ error: "Origin not allowed" },403,origin);
  if (req.method !== "POST") return reply({ error: "Method not allowed" },405,origin);

  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") || "";
  if (!url || !anon || !service || allowedOrigins.length === 0) return reply({ error: "Server configuration incomplete" },500,origin);
  if (!auth.startsWith("Bearer ")) return reply({ error: "Authentication required" },401,origin);

  const caller = createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data: authData,error: authError} = await caller.auth.getUser();
  if (authError || !authData.user) return reply({error:"Invalid session"},401,origin);
  const admin = createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  let body: { action?: string; email?: string; token?: string; invitationId?: string; membershipId?: string; permissions?: string[]; featureKey?: string; status?: string };
  try { body = await req.json(); } catch { return reply({error:"Invalid JSON body"},400,origin); }

  if (body.action === "accept") {
    const token = String(body.token || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) return reply({error:"Invalid invitation token"},400,origin);
    const {data,error} = await caller.rpc("admin_accept_invitation",{_token_hash:await hashToken(token)});
    if (error) return reply({error:error.message},409,origin);
    return reply({success:true,membership:data},200,origin);
  }

  const {data:isSuper,error:superError} = await caller.rpc("is_super_admin");
  if (superError || isSuper !== true) return reply({error:"Super Admin access required"},403,origin);

  if (body.action === "list") {
    const [{data: memberships,error: membershipError},{data: permissions,error: permissionError},{data: invitations,error: invitationError},{data: audit,error: auditError}] = await Promise.all([
      admin.from("admin_memberships").select("id,user_id,role,status,assigned_by,created_at,updated_at").order("created_at",{ascending:false}),
      admin.from("admin_feature_permissions").select("id,membership_id,feature_key,action,granted_by,created_at").order("created_at",{ascending:false}),
      admin.from("admin_invitations").select("id,invited_email,invited_by,role,status,expires_at,accepted_user_id,created_at,accepted_at").order("created_at",{ascending:false}).limit(100),
      admin.from("admin_rbac_audit").select("id,actor_user_id,target_user_id,action,feature_key,permission_action,metadata,created_at").order("created_at",{ascending:false}).limit(100),
    ]);
    if (membershipError || permissionError || invitationError || auditError) return reply({error:"Unable to load the complete RBAC workspace"},500,origin);
    const usersResult = await admin.auth.admin.listUsers({page:1,perPage:1000});
    const authMap = new Map((usersResult.data?.users || []).map((u:any)=>[u.id,u]));
    const profileIds = [...new Set((memberships || []).map((m:any)=>m.user_id))];
    const {data:profiles} = profileIds.length ? await admin.from("profiles").select("id,display_name").in("id",profileIds) : {data:[]};
    const profileMap = new Map((profiles || []).map((p:any)=>[p.id,p]));
    const memberRows = (memberships || []).map((m:any)=>{
      const u:any = authMap.get(m.user_id), p:any = profileMap.get(m.user_id);
      return {...m,email:u?.email || null,display_name:p?.display_name || u?.user_metadata?.full_name || u?.user_metadata?.name || null,
        permissions:(permissions || []).filter((permission:any)=>permission.membership_id===m.id)};
    });
    return reply({memberships:memberRows,permissions:permissions || [],invitations:invitations || [],audit:audit || []},200,origin);
  }

  if (body.action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    if (email.length < 5 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({error:"Enter a valid email address"},400,origin);
    const token = newToken(), tokenHash = await hashToken(token);
    const {data:invitation,error} = await caller.rpc("admin_create_invitation",{
      _email:email,_token_hash:tokenHash,_expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString(),
    });
    if (error || !invitation) return reply({error:error?.message || "Could not create invitation"},409,origin);
    const base = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    const inviteUrl = new URL("/admin/accept-invite",base); inviteUrl.searchParams.set("token",token);
    return reply({invitation,invite_url:inviteUrl.toString()},200,origin);
  }

  if (body.action === "revoke-invitation") {
    if (!uuid(String(body.invitationId || ""))) return reply({error:"Valid invitation ID required"},400,origin);
    const {data,error} = await caller.rpc("admin_revoke_invitation",{_invitation_id:body.invitationId});
    if (error || data !== true) return reply({error:error?.message || "Pending invitation not found"},409,origin);
    return reply({success:true},200,origin);
  }

  if (body.action === "set-permissions") {
    if (!uuid(String(body.membershipId || "")) || !Array.isArray(body.permissions)) return reply({error:"Invalid permission assignment"},400,origin);
    const featureKey = ["users","projects","billing","affiliate"].includes(String(body.featureKey)) ? String(body.featureKey) : "users";
    const actions = [...new Set(body.permissions.map(String))];
    if (actions.some((a)=>!["view","manage"].includes(a))) return reply({error:"Unsupported permission action"},400,origin);
    const rpc = featureKey === "projects" ? "admin_set_subadmin_project_permissions" : featureKey === "billing" ? "admin_set_subadmin_billing_permissions" : featureKey === "affiliate" ? "admin_set_subadmin_affiliate_permissions" : "admin_set_subadmin_permissions";
    const {data,error} = await caller.rpc(rpc,{_membership_id:body.membershipId,_actions:actions});
    if (error) return reply({error:error.message},409,origin);
    return reply({success:true,permissions:data},200,origin);
  }

  if (body.action === "set-status") {
    if (!uuid(String(body.membershipId || "")) || !["active","suspended"].includes(String(body.status))) return reply({error:"Invalid membership status"},400,origin);
    const {data,error} = await caller.rpc("admin_set_subadmin_status",{_membership_id:body.membershipId,_status:body.status});
    if (error) return reply({error:error.message},409,origin);
    return reply({success:true,membership:data},200,origin);
  }

  if (body.action === "remove-subadmin") {
    if (!uuid(String(body.membershipId || ""))) return reply({error:"Valid membership ID required"},400,origin);
    const {data,error} = await caller.rpc("admin_remove_subadmin",{_membership_id:body.membershipId});
    if (error) return reply({error:error.message},409,origin);
    return reply({success:data===true},200,origin);
  }

  return reply({error:"Unsupported action"},400,origin);
});
