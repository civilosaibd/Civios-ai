// AI Thinking — multimodal analyzer for any uploaded file/image
// Uses Lovable AI (Gemini 2.5 Pro) for visual + textual reasoning.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `You are an expert civil & structural engineering assistant for Bangladesh.
You receive uploads (images, floor plans, PDFs, DXF, photos, sketches) from a user building a house.
Analyse what you see carefully and respond only with valid JSON:
{
  "summary": string,
  "detected": { "buildingType": string, "estimatedArea_sqft": number | null, "estimatedFloors": number | null, "rooms": string[] },
  "engineeringNotes": string[], "warnings": string[], "recommendations": string[],
  "estimateHints": { "suggestedQuality": "standard" | "premium" | "luxury", "specialConsiderations": string[] }
}
Be accurate. If unsure, say so in warnings rather than guessing. Never invent dimensions you cannot infer.
Do not claim a design is safe or code-compliant without a qualified engineer's verification. Output JSON only, no markdown.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // Verify a real signed-in user; the public anon key alone is not authentication.
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Sign in to use AI analysis." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase auth environment variables are missing");
      return jsonResponse({ error: "AI analysis is temporarily unavailable." }, 503);
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: supabaseAnonKey },
    });
    if (!authResponse.ok) {
      return jsonResponse({ error: "Your session is invalid or expired. Please sign in again." }, 401);
    }

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }
    const { fileName, mimeType, dataUrl, textContent, userPrompt } = body;
    if (dataUrl != null && typeof dataUrl !== "string") return jsonResponse({ error: "Invalid image data." }, 400);
    if (typeof dataUrl === "string" && dataUrl.length > 10 * 1024 * 1024) {
      return jsonResponse({ error: "Image is too large. Please upload an image under 7 MB." }, 413);
    }
    if (textContent != null && typeof textContent !== "string") {
      return jsonResponse({ error: "Invalid text content." }, 400);
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY is not configured");
      return jsonResponse({ error: "AI analysis is temporarily unavailable." }, 503);
    }

    const userContent: any[] = [];
    const intro = `File: ${typeof fileName === "string" ? fileName.slice(0, 300) : "(unnamed)"} • Type: ${typeof mimeType === "string" ? mimeType.slice(0, 120) : "unknown"}\n${typeof userPrompt === "string" && userPrompt.trim() ? `User request: ${userPrompt.slice(0, 4000)}` : "Please analyse this upload for a Bangladeshi house design."}`;
    userContent.push({ type: "text", text: intro });
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    if (typeof textContent === "string" && textContent.length > 0) {
      userContent.push({ type: "text", text: `\n--- File text content ---\n${textContent.slice(0, 60000)}` });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userContent }],
        response_format: { type: "json_object" },
      }),
    });
    if (resp.status === 429) return jsonResponse({ error: "Rate limit exceeded. Please try again in a minute." }, 429);
    if (resp.status === 402) return jsonResponse({ error: "AI credits exhausted. Please add credits in workspace settings." }, 402);
    if (!resp.ok) {
      const details = await resp.text();
      console.error("AI gateway error", resp.status, details.slice(0, 1000));
      return jsonResponse({ error: "AI gateway error. Please try again later." }, 502);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        summary: "The AI returned an unreadable response. Please try again.", detected: {},
        engineeringNotes: [], warnings: ["AI response could not be parsed; no engineering conclusion should be inferred."],
        recommendations: [], estimateHints: {},
      };
    }
    return jsonResponse({ ok: true, analysis: parsed });
  } catch (e) {
    console.error("ai-analyze error", e);
    return jsonResponse({ error: "AI analysis failed. Please try again later." }, 500);
  }
});
