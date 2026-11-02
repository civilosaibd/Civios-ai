import { createClient } from "npm:@supabase/supabase-js@2";
import { checkAiEndpointRateLimit } from "../_shared/aiRateLimit.ts";
import { consumeAiCredit } from "../_shared/aiUsageQuota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const SYSTEM_PROMPT = `You are IndoCAD's architectural space-planning engine. Convert the user's building brief into a coherent, dimensioned SINGLE-STOREY 2D floor-plan geometry. The app will extrude this geometry to a multi-storey 3D concept model.

Return ONLY valid JSON with this exact shape:
{
  "units":"ft",
  "footprint":{"width":number,"depth":number},
  "roadSide":"north|south|east|west",
  "floors":number,
  "rooms":[{"name":"string","x":number,"y":number,"width":number,"depth":number}],
  "doors":[{"x":number,"y":number,"width":number,"wall":"north|south|east|west","room":"string"}],
  "windows":[{"x":number,"y":number,"width":number,"wall":"north|south|east|west","room":"string"}],
  "assumptions":["string"],
  "warnings":["string"]
}

GEOMETRY RULES:
- All coordinates and dimensions are in feet. Origin (0,0) is the south-west corner of the building footprint. x increases east; y increases north.
- Keep every room completely inside the footprint. Room rectangles must not overlap. Place rooms adjacent where possible, with shared boundaries; do not leave unusable large gaps.
- Use sensible practical room sizes and circulation for the requested plot. Include requested bedrooms, bathrooms, kitchen, dining, living/drawing, stair and balcony where feasible. Avoid implausibly narrow spaces.
- The footprint is the BUILDABLE footprint, not the full plot. If plot size and road side are provided, infer reasonable conceptual setbacks, but explicitly list assumptions; never claim code compliance.
- Door coordinates are the CENTER of the opening on the specified room boundary. For north/south walls x is along the wall and y is the boundary coordinate. For east/west walls y is along the wall and x is the boundary coordinate. Use 2.5–3.0 ft doors, bathroom doors 2.3–2.5 ft.
- Window coordinates use the same convention; use 3–5 ft widths. Avoid putting windows on shared party walls.
- Return 1 to 16 rooms, 1 to 24 doors, and 0 to 24 windows. Use only finite positive dimensions. Do not output structural column positions or structural sizing.
- Do not output Markdown. Do not include explanations outside JSON.
- If requirements cannot fit, return the best honest conceptual arrangement and put the constraints in warnings. This is not a permit-ready design.`;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePlan(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI response is not an object.");
  const footprint = value.footprint;
  if (!footprint || !isFiniteNumber(footprint.width) || !isFiniteNumber(footprint.depth)
    || footprint.width < 10 || footprint.depth < 10 || footprint.width > 200 || footprint.depth > 200) {
    throw new Error("AI returned invalid building dimensions.");
  }
  if (!Array.isArray(value.rooms) || value.rooms.length < 1 || value.rooms.length > 16) {
    throw new Error("AI returned an invalid room schedule.");
  }
  const rooms = value.rooms.map((room: any) => {
    if (!room || typeof room.name !== "string" || !room.name.trim()
      || ![room.x, room.y, room.width, room.depth].every(isFiniteNumber)
      || room.width < 4 || room.depth < 4
      || room.x < 0 || room.y < 0
      || room.x + room.width > footprint.width + 0.05
      || room.y + room.depth > footprint.depth + 0.05) {
      throw new Error("AI returned a room outside the building boundary or with invalid dimensions.");
    }
    return { name: room.name.trim().slice(0, 48), x: room.x, y: room.y, width: room.width, depth: room.depth };
  });
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
    if (overlapX > 0.08 && overlapY > 0.08) throw new Error("AI returned overlapping room geometry. Please refine the prompt and try again.");
  }
  const validSides = ["north", "south", "east", "west"];
  const openings = (items: any, label: string, max: number) => {
    if (!Array.isArray(items) || items.length > max) throw new Error(`AI returned invalid ${label} data.`);
    return items.map((item: any) => {
      if (!item || !isFiniteNumber(item.x) || !isFiniteNumber(item.y) || !isFiniteNumber(item.width)
        || item.width < 1.8 || item.width > 6 || !validSides.includes(item.wall)) {
        throw new Error(`AI returned an invalid ${label} location.`);
      }
      const onBoundary = item.wall === "north" ? Math.abs(item.y - footprint.depth) < 0.15 && item.x - item.width / 2 >= 0 && item.x + item.width / 2 <= footprint.width
        : item.wall === "south" ? Math.abs(item.y) < 0.15 && item.x - item.width / 2 >= 0 && item.x + item.width / 2 <= footprint.width
        : item.wall === "east" ? Math.abs(item.x - footprint.width) < 0.15 && item.y - item.width / 2 >= 0 && item.y + item.width / 2 <= footprint.depth
        : Math.abs(item.x) < 0.15 && item.y - item.width / 2 >= 0 && item.y + item.width / 2 <= footprint.depth;
      if (!onBoundary) throw new Error(`AI returned a ${label} outside a valid wall boundary.`);
      return { x: item.x, y: item.y, width: item.width, wall: item.wall, room: typeof item.room === "string" ? item.room.slice(0, 48) : "" };
    });
  };
  const doors = openings(value.doors ?? [], "door", 24);
  const windows = openings(value.windows ?? [], "window", 24);
  const floors = isFiniteNumber(value.floors) ? Math.max(1, Math.min(20, Math.round(value.floors))) : 1;
  return {
    units: "ft",
    footprint: { width: footprint.width, depth: footprint.depth },
    roadSide: validSides.includes(value.roadSide) ? value.roadSide : "south",
    floors,
    rooms,
    doors,
    windows,
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.filter((x: unknown) => typeof x === "string").slice(0, 12).map((x: string) => x.slice(0, 240)) : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((x: unknown) => typeof x === "string").slice(0, 12).map((x: string) => x.slice(0, 240)) : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return json({ error: "AI service is temporarily unavailable" }, 503);
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(authorization.slice(7));
    if (authError || !user) return json({ error: "Authentication required" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body.prompt !== "string" || body.prompt.trim().length < 8 || body.prompt.length > 4000) {
      return json({ error: "Describe the building in 8–4000 characters." }, 400);
    }
    const rateLimit = await checkAiEndpointRateLimit(user.id, "ai-floorplan");
    if (rateLimit) return json({ error: rateLimit.message }, rateLimit.status);
    const quota = await consumeAiCredit(user.id);
    if (quota) return json({ error: quota.message }, quota.status);

    // Match CivilOS AI's existing server-side OpenAI configuration used by ai-chat.
    // Never accept provider or API key overrides from the browser.
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-5.5";
    if (!openAiKey) {
      console.error("OPENAI_API_KEY is not configured for IndoCAD");
      return json({ error: "OpenAI is not configured on the server. Please contact the administrator." }, 503);
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        instructions: SYSTEM_PROMPT,
        input: [{ role: "user", content: body.prompt.trim().slice(0, 4000) }],
        text: { format: { type: "json_object" } },
        store: false,
      }),
    });
    if (response.status === 429) return json({ error: "AI rate limit reached. Please wait and try again." }, 429);
    if (response.status === 402) return json({ error: "AI provider credits are exhausted." }, 402);
    if (!response.ok) {
      console.error("IndoCAD OpenAI Responses API request failed", { status: response.status });
      return json({ error: "AI floor-plan generation failed at the provider. Please try again." }, 502);
    }
    const payload = await response.json();
    const raw = payload?.output_text
      ?? payload?.output?.flatMap((item: any) => item.content ?? []).find((part: any) => part.type === "output_text")?.text
      ?? "";
    if (typeof raw !== "string" || !raw.trim()) return json({ error: "AI returned an empty floor plan." }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      console.error("IndoCAD floor-plan provider returned malformed JSON");
      return json({ error: "AI returned an invalid floor-plan format. Please try again." }, 502);
    }
    try {
      return json({ ok: true, plan: validatePlan(parsed) });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "AI returned invalid geometry." }, 422);
    }
  } catch (error) {
    console.error("ai-floorplan request failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Unable to generate the floor plan. Please try again." }, 500);
  }
});
