// Shared server-side rate limiter for expensive AI endpoints.
// Limits are per user and endpoint: 10 requests/minute, 100 requests/rolling 24 hours.
import { createClient } from "npm:@supabase/supabase-js@2";

export type AiEndpoint = "ai-analyze" | "ai-chat" | "ai-structured" | "defect-detect" | "viz-analyze";
export type AiRateLimitResult = { status: 429 | 503; message: string } | null;

export async function checkAiEndpointRateLimit(userId: string, endpoint: AiEndpoint): Promise<AiRateLimitResult> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("AI rate-limit service configuration missing");
    return { status: 503, message: "AI service is temporarily unavailable. Please try again shortly." };
  }

  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("consume_ai_endpoint_rate_limit", {
      _user_id: userId,
      _endpoint: endpoint,
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) {
      console.error("AI endpoint rate-limit check failed");
      return { status: 503, message: "AI service is temporarily unavailable. Please try again shortly." };
    }
    if (!result.allowed) {
      return {
        status: 429,
        message: result.reason === "minute"
          ? "Too many AI requests. Please wait a minute and try again."
          : "Daily AI request limit reached for this feature. Please try again tomorrow.",
      };
    }
    return null;
  } catch {
    console.error("AI endpoint rate-limit check failed");
    return { status: 503, message: "AI service is temporarily unavailable. Please try again shortly." };
  }
}
