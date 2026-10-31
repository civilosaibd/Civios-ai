import { checkAiEndpointRateLimit } from "../_shared/aiRateLimit.ts";
import { consumeAiCredit } from "../_shared/aiUsageQuota.ts";
// CivilOS AI — authenticated engineering assistant with configurable server-side AI provider.
import { createClient } from "npm:@supabase/supabase-js@2";
import { toChatCompletionStream } from "../_shared/openaiResponsesStream.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are CivilOS AI — an expert civil, structural & quantity-surveying assistant for Bangladesh.

Authoritative knowledge base you MUST apply:
• BNBC 2020 & BNBC 2022 (Bangladesh National Building Code) — loads, seismic zones, wind, load combinations, detailing.
• PWD Schedule of Rates (latest) — item codes, units, BDT rates for civil, sanitary, electrical, finishing works.
• LGED Schedule of Rates — rural infrastructure, roads, culverts, RCC works.
• RAJUK / CDA / KDA / RDA planning & building rules.
• ACI 318, IS 456, IS 875, IS 1893 — RCC design, loads, seismic.
• Standard BOQ methodology (measurement rules, abstract, take-off, rate analysis).
• Bangladesh construction market rates (Dhaka, Chittagong, Sylhet, Rajshahi, Khulna).

Answer style:
1. Reply in the same language the user writes (Bangla / English / Banglish).
2. Use markdown. For calculations: show formula → substitution → result with units.
3. Cite clauses like "BNBC 2022 §2.3.5" or "PWD SoR Item 3.5.2".
4. For BOQ / rate items give a small markdown table (Item | Unit | Qty | Rate ৳ | Amount ৳).
5. For code, use fenced blocks with language (\`\`\`python, \`\`\`ts, \`\`\`json).
6. Round money to nearest BDT, quantities to 2 decimals.
7. If data is missing, state reasonable assumption explicitly. If out of civil-engineering scope, say so.
8. Never invent standards/clauses you are unsure of — say "verify with published code".`;

interface ChatMsg { role: "user" | "assistant" | "system"; content: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      console.error("Supabase auth configuration missing");
      return new Response(JSON.stringify({ error: "AI service is temporarily unavailable" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(authorization.slice(7));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, context } = await req.json() as { messages: ChatMsg[]; context?: string };
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
      return new Response(JSON.stringify({ error: "Provide between 1 and 30 messages" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!messages.every((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length <= 12000)) {
      return new Response(JSON.stringify({ error: "Invalid message format or message too large" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (context !== undefined && (typeof context !== "string" || context.length > 10000)) {
      return new Response(JSON.stringify({ error: "Reference context is too large" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys = context
      ? `${SYSTEM_PROMPT}\n\n--- Reference document the user uploaded ---\n${context}`
      : SYSTEM_PROMPT;

    const rateLimit = await checkAiEndpointRateLimit(user.id, "ai-chat");
    if (rateLimit) return new Response(JSON.stringify({ error: rateLimit.message }), { status: rateLimit.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const creditQuota = await consumeAiCredit(user.id);
    if (creditQuota) return new Response(JSON.stringify({ error: creditQuota.message }), { status: creditQuota.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });


    // Provider selection is controlled only by server-side secrets. Clients cannot
    // switch providers or inject model names, which keeps cost and access policy central.
    const provider = (Deno.env.get("AI_PROVIDER") || "lovable").toLowerCase();
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-5.5";

    let resp: Response;
    if (provider === "openai") {
      if (!openAiKey) {
        console.error("AI_PROVIDER is openai but OPENAI_API_KEY is not configured");
        return new Response(JSON.stringify({ error: "OpenAI is not configured yet. Please contact the administrator." }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: openAiModel,
          instructions: sys,
          input: messages.map(({ role, content }) => ({ role, content })),
          stream: true,
          store: false,
        }),
      });
    } else if (provider === "lovable") {
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) {
        console.error("LOVABLE_API_KEY not configured");
        return new Response(JSON.stringify({ error: "AI service is temporarily unavailable" }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: sys }, ...messages],
          stream: true,
        }),
      });
    } else {
      console.error("Unsupported AI_PROVIDER value");
      return new Response(JSON.stringify({ error: "AI provider configuration is invalid." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "AI provider rate limit reached. Please try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI provider credits or billing quota are exhausted." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok || !resp.body) {
      // Do not log provider response bodies: they can contain request details.
      console.error("AI provider request failed", { provider, status: resp.status });
      return new Response(JSON.stringify({ error: "AI provider request failed. Please try again later." }), {
        status: resp.status >= 500 ? 502 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseBody = provider === "openai"
      ? toChatCompletionStream(resp.body, openAiModel)
      : resp.body;

    return new Response(responseBody, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("ai-chat error", e instanceof Error ? e.message : "Unknown");
    return new Response(JSON.stringify({ error: "Unable to process this request. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
