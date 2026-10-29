// Server-authoritative monthly AI credit accounting.
// A request reserves one credit before it is sent to the AI provider.
import { createClient } from "npm:@supabase/supabase-js@2";

export type AiCreditResult = { status: 402 | 503; message: string } | null;

export async function consumeAiCredit(userId: string, quotaKey?: "boq_generations" | "bbs_generations" | "drawings" | "reports"): Promise<AiCreditResult> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("AI credit service configuration missing");
    return { status: 503, message: "AI service is temporarily unavailable. Please try again shortly." };
  }

  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("consume_ai_credit", { _user_id: userId, _quota_key: quotaKey ?? null });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) {
      console.error("AI credit quota check failed");
      return { status: 503, message: "AI service is temporarily unavailable. Please try again shortly." };
    }
    if (!result.allowed) {
      const messages: Record<string, string> = {
        ai_credits: "Monthly AI credit limit reached (" + result.used + "/" + result.quota + "). Upgrade your plan or try again next month.",
        boq_generations: "Monthly BOQ generation limit reached (" + result.used + "/" + result.quota + "). Upgrade your plan or try again next month.",
        bbs_generations: "Monthly BBS generation limit reached (" + result.used + "/" + result.quota + "). Upgrade your plan or try again next month.",
        drawings: "Monthly drawing analysis limit reached (" + result.used + "/" + result.quota + "). Upgrade your plan or try again next month.",
        reports: "Monthly report generation limit reached (" + result.used + "/" + result.quota + "). Upgrade your plan or try again next month.",
      };
      return {
        status: 402,
        message: messages[result.reason] || "Your plan usage limit has been reached. Upgrade your plan or try again next month.",
      };
    }
    return null;
  } catch {
    console.error("AI credit quota check failed");
    return { status: 503, message: "AI service is temporarily unavailable. Please try again shortly." };
  }
}
