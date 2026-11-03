import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("CIVILOS_ALLOWED_ORIGINS") || "https://civilosai.pro.bd,https://civilosai.vercel.app,https://civilosai.lovable.app").split(",").map((value) => value.trim()).filter(Boolean);
const responseHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});
const respond = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(origin) });
  if (origin && !allowedOrigins.includes(origin)) return respond({ error: "Origin not allowed" }, 403, origin);
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return respond({ error: "Server configuration incomplete" }, 500, origin);

  let body: { referralCode?: string; eventType?: string; eventId?: string };
  try { body = await request.json(); } catch { return respond({ error: "Invalid JSON body" }, 400, origin); }
  const referralCode = String(body.referralCode || "").trim().toUpperCase();
  const eventType = String(body.eventType || "");
  const eventId = String(body.eventId || "");
  if (!/^[A-Z0-9-]{4,32}$/.test(referralCode) || !["share_action", "link_click"].includes(eventType) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    return respond({ error: "Invalid event details" }, 400, origin);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from("profiles").select("id").eq("referral_code", referralCode).maybeSingle();
  if (profileError || !profile) return respond({ error: "Referral code not found" }, 404, origin);

  if (eventType === "share_action") {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return respond({ error: "Sign-in required for share-action tracking" }, 401, origin);
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error } = await caller.auth.getUser();
    if (error || !auth.user || auth.user.id !== profile.id) return respond({ error: "Only the referral-code owner can record share actions" }, 403, origin);
  }

  const { error: insertError } = await admin.from("referral_events").insert({
    event_id: eventId,
    referrer_id: profile.id,
    event_type: eventType,
  });
  if (insertError && insertError.code !== "23505") return respond({ error: "Could not record referral event" }, 500, origin);
  return respond({ recorded: !insertError, duplicate: insertError?.code === "23505" }, 200, origin);
});
