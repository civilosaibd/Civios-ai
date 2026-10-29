// Server-authoritative capability checks for Edge Functions.
// A missing/misconfigured database function fails closed (503).
import { createClient } from "npm:@supabase/supabase-js@2";

export type PlanFeatureResult = { status: 403 | 503; message: string } | null;

export async function requirePlanFeature(userId: string, featureKey: string): Promise<PlanFeatureResult> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("Plan feature service configuration missing");
    return { status: 503, message: "Plan access could not be verified. Please try again shortly." };
  }

  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("user_has_plan_feature", {
      _user_id: userId,
      _feature_key: featureKey,
    });
    if (error || typeof data !== "boolean") {
      console.error("Plan feature check failed");
      return { status: 503, message: "Plan access could not be verified. Please try again shortly." };
    }
    if (!data) return { status: 403, message: "This feature is not included in your current plan. Please upgrade to continue." };
    return null;
  } catch {
    console.error("Plan feature check failed");
    return { status: 503, message: "Plan access could not be verified. Please try again shortly." };
  }
}
