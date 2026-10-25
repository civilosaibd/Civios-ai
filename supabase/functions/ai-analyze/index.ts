import { createClient } from "npm:@supabase/supabase-js@2";
import { checkAiEndpointRateLimit } from "../_shared/aiRateLimit.ts";
// AI Thinking — authenticated multimodal analyzer for uploaded files/images.
// Uses Lovable AI (Gemini 2.5 Pro) for visual + textual reasoning.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const SYSTEM_PROMPT = `You are an expert civil & structural engineering assistant for Bangladesh (BNBC 2020).
You receive uploads (images, floor plans, PDFs, DXF, photos, sketches) from a user building a house.
Analyse what you see carefully and respond ONLY with valid JSON of this shape:
{
  "summary": string,
  "detected": {
    "buildingType": string,
    "estimatedArea_sqft": number | null,
    "estimatedFloors": number | null,
    "rooms": string[]
  },
  "engineeringNotes": string[],
  "warnings": string[],
  "recommendations": string[],
  "estimateHints": {
    "suggestedQuality": "standard" | "premium" | "luxury",
    "specialConsiderations": string[]
  }
}
Be accurate. If unsure, say so in warnings rather than guessing numbers.
Never invent dimensions you cannot infer. Output JSON only, no markdown.
This is preliminary AI assistance, not a substitute for review and approval by a qualified local engineer.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // The Supabase platform must also enforce JWT verification in supabase/config.toml.
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: "AI service is temporarily unavailable" }, 503);
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  let userId: string;
  try {
    const authResult = await authClient.auth.getUser(authorization.slice(7));
    if (authResult.error || !authResult.data.user) return jsonResponse({ error: "Authentication required" }, 401);
    userId = authResult.data.user.id;
  } catch {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > 12 * 1024 * 1024) {
      return jsonResponse({ error: "Request too large. Please upload a smaller file." }, 413);
    }

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const { fileName, mimeType, dataUrl, textContent, userPrompt } = body;
    if (dataUrl !== undefined && (typeof dataUrl !== "string" || dataUrl.length > 10 * 1024 * 1024 || !dataUrl.startsWith("data:image/"))) {
      return jsonResponse({ error: "Invalid or oversized image data" }, 400);
    }
    if (textContent !== undefined && typeof textContent !== "string") {
      return jsonResponse({ error: "Invalid text content" }, 400);
    }
    if (userPrompt !== undefined && typeof userPrompt !== "string") {
      return jsonResponse({ error: "Invalid user prompt" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return jsonResponse({ error: "AI service is temporarily unavailable" }, 503);
    }

    const safeFileName = typeof fileName === "string" ? fileName.slice(0, 200) : "(unnamed)";
    const safeMimeType = typeof mimeType === "string" ? mimeType.slice(0, 100) : "unknown";
    const safePrompt = typeof userPrompt === "string" ? userPrompt.slice(0, 2000) : "";
    const userContent: any[] = [{
      type: "text",
      text: `File: ${safeFileName} • Type: ${safeMimeType}\n${safePrompt ? `User request: ${safePrompt}` : "Please analyse this upload for a Bangladeshi house design."}`,
    }];

    if (typeof dataUrl === "string") {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    if (typeof textContent === "string" && textContent.length > 0) {
      userContent.push({ type: "text", text: `\n--- File text content ---\n${textContent.slice(0, 30000)}` });
    }

    if (userContent.length === 1 && !safePrompt) {
      return jsonResponse({ error: "Provide an image or text content to analyse" }, 400);
    }

    const rateLimit = await checkAiEndpointRateLimit(userId, "ai-analyze");
    if (rateLimit) return jsonResponse({ error: rateLimit.message }, rateLimit.status);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) {
      return jsonResponse({ error: "Rate limit exceeded. Please try again in a minute." }, 429);
    }
    if (resp.status === 402) {
      return jsonResponse({ error: "AI credits exhausted. Please add credits in workspace settings." }, 402);
    }
    if (!resp.ok) {
      console.error("AI gateway returned status", resp.status);
      return jsonResponse({ error: "AI gateway error. Please try again later." }, 502);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") {
      return jsonResponse({ error: "AI returned an invalid response. Please try again." }, 502);
    }

    try {
      return jsonResponse({ ok: true, analysis: JSON.parse(raw) });
    } catch {
      console.error("AI gateway returned invalid JSON");
      return jsonResponse({ error: "AI returned an invalid response. Please try again." }, 502);
    }
  } catch (error) {
    console.error("ai-analyze request failed", error instanceof Error ? error.message : "unknown error");
    return jsonResponse({ error: "Unable to process this request. Please try again." }, 500);
  }
});
