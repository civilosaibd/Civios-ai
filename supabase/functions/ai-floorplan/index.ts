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
- Door coordinates are the CENTER of the opening on the specified boundary of the named room. Doors MUST connect rooms to adjacent rooms or circulation; place internal doors on shared room boundaries as well as entry doors on the exterior footprint. For north/south walls x is along the wall and y is the boundary coordinate. For east/west walls y is along the wall and x is the boundary coordinate. Use 2.5–3.0 ft doors, bathroom doors 2.3–2.5 ft.
- Window coordinates use the same convention and MUST lie on an exterior footprint wall of the named room; use 3–5 ft widths. Never place windows on internal/shared walls.
- Ensure every room is reachable from an exterior entrance through a continuous chain of internal doors. Every internal door must sit on a shared boundary between the named room and exactly one adjacent room; exterior doors must be on the footprint perimeter. Do not invent doors on walls without an adjacent room. Avoid door/window collisions and keep adequate wall piers at opening ends.
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
  type WallSegment = { side: string; fixed: number; low: number; high: number; room: string; exterior: boolean };
  const roomWalls: WallSegment[] = [];
  for (const room of rooms) {
    const right = room.x + room.width, top = room.y + room.depth;
    roomWalls.push(
      { side: "south", fixed: room.y, low: room.x, high: right, room: room.name, exterior: Math.abs(room.y) < 0.15 },
      { side: "north", fixed: top, low: room.x, high: right, room: room.name, exterior: Math.abs(top - footprint.depth) < 0.15 },
      { side: "west", fixed: room.x, low: room.y, high: top, room: room.name, exterior: Math.abs(room.x) < 0.15 },
      { side: "east", fixed: right, low: room.y, high: top, room: room.name, exterior: Math.abs(right - footprint.width) < 0.15 },
    );
  }
  const openings = (items: any, label: string, max: number) => {
    if (!Array.isArray(items) || items.length > max) throw new Error(`AI returned invalid ${label} data.`);
    const result = items.map((item: any) => {
      if (!item || !isFiniteNumber(item.x) || !isFiniteNumber(item.y) || !isFiniteNumber(item.width)
        || item.width < 1.8 || item.width > 6 || !validSides.includes(item.wall)
        || typeof item.room !== "string" || !item.room.trim()) {
        throw new Error(`AI returned an invalid ${label} location.`);
      }
      const room = rooms.find((candidate) => candidate.name.toLowerCase() === item.room.trim().toLowerCase());
      if (!room) throw new Error(`AI returned a ${label} assigned to an unknown room.`);
      const along = item.wall === "north" || item.wall === "south" ? item.x : item.y;
      const fixed = item.wall === "north" || item.wall === "south" ? item.y : item.x;
      const low = along - item.width / 2, high = along + item.width / 2;
      const segment = roomWalls.find((edge) => edge.room === room.name && edge.side === item.wall
        && Math.abs(edge.fixed - fixed) < 0.08 && low >= edge.low + 0.08 && high <= edge.high - 0.08);
      if (!segment) throw new Error(`AI returned a ${label} that does not fit on the named room's wall.`);
      if (label === "window" && !segment.exterior) {
        throw new Error("AI returned a window on an internal/shared wall.");
      }
      return { x: item.x, y: item.y, width: item.width, wall: item.wall, room: room.name, _fixed: fixed, _low: low, _high: high };
    });
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      const a = result[i], b = result[j];
      // The wall's fixed coordinate is already compared with tolerance above.
      // Do not require exact x/y equality: two openings can share a wall even
      // when the model rounds their wall coordinates slightly differently.
      const sameWall = a.wall === b.wall && Math.abs(a._fixed - b._fixed) < 0.08;
      if (sameWall && Math.min(a._high, b._high) - Math.max(a._low, b._low) > 0.05) {
        throw new Error(`AI returned overlapping ${label} openings.`);
      }
    }
    return result.map(({ _fixed, _low, _high, ...item }) => item);
  };
  const doors = openings(value.doors ?? [], "door", 24);
  const windows = openings(value.windows ?? [], "window", 24);

  // A door must either open to the exterior or sit on a genuinely shared wall
  // with another room. Merely being somewhere on a room boundary is not enough.
  const roomByName = new Map(rooms.map((room: any) => [room.name, room]));
  const connected = new Map<string, Set<string>>();
  for (const room of rooms) connected.set(room.name, new Set<string>());
  const exteriorRooms = new Set<string>();

  for (const door of doors) {
    const source = roomByName.get(door.room) as any;
    const along = door.wall === "north" || door.wall === "south" ? door.x : door.y;
    const fixed = door.wall === "north" || door.wall === "south" ? door.y : door.x;
    const low = along - door.width / 2;
    const high = along + door.width / 2;
    const sourceWall = roomWalls.find((edge) => edge.room === source.name
      && edge.side === door.wall && Math.abs(edge.fixed - fixed) < 0.08);
    if (!sourceWall) throw new Error("AI returned a door that is not on its assigned room wall.");

    if (sourceWall.exterior) {
      exteriorRooms.add(source.name);
      continue;
    }

    const oppositeSide: Record<string, string> = {
      north: "south", south: "north", east: "west", west: "east",
    };
    const adjacent = roomWalls.find((edge) => edge.room !== source.name
      && edge.side === oppositeSide[door.wall]
      && Math.abs(edge.fixed - fixed) < 0.08
      && Math.min(edge.high, high) - Math.max(edge.low, low) >= door.width - 0.1);
    if (!adjacent) {
      throw new Error("AI returned an internal door that does not connect two adjacent rooms.");
    }
    connected.get(source.name)?.add(adjacent.room);
    connected.get(adjacent.room)?.add(source.name);
  }

  // Every room must be reachable from at least one exterior entrance through
  // internal door connections; this catches isolated/unreachable room layouts.
  const reached = new Set<string>();
  const queue = [...exteriorRooms];
  while (queue.length) {
    const current = queue.shift()!;
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of connected.get(current) ?? []) {
      if (!reached.has(next)) queue.push(next);
    }
  }
  if (reached.size !== rooms.length) {
    const isolated = rooms.filter((room: any) => !reached.has(room.name)).map((room: any) => room.name);
    throw new Error(`AI returned rooms without a valid door route from an exterior entrance: ${isolated.join(", ")}.`);
  }

  // Doors and windows share the same wall space: reject cross-type collisions too.
  for (const door of doors) for (const window of windows) {
    const sameWall = door.wall === window.wall && Math.abs(
      (door.wall === "north" || door.wall === "south" ? door.y : door.x) -
      (window.wall === "north" || window.wall === "south" ? window.y : window.x)
    ) < 0.08;
    const doorAlong = door.wall === "north" || door.wall === "south" ? door.x : door.y;
    const windowAlong = window.wall === "north" || window.wall === "south" ? window.x : window.y;
    const overlap = Math.min(doorAlong + door.width / 2, windowAlong + window.width / 2)
      - Math.max(doorAlong - door.width / 2, windowAlong - window.width / 2);
    if (sameWall && overlap > 0.05) {
      throw new Error("AI returned overlapping door and window openings on the same wall.");
    }
  }
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
    // Validate provider configuration before reserving a billable AI credit.
    // Provider selection and credentials remain server-side only.
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-5.5";
    if (!openAiKey) {
      console.error("OPENAI_API_KEY is not configured for IndoCAD");
      return json({ error: "OpenAI is not configured on the server. Please contact the administrator." }, 503);
    }

    const rateLimit = await checkAiEndpointRateLimit(user.id, "ai-floorplan");
    if (rateLimit) return json({ error: rateLimit.message }, rateLimit.status);
    const quota = await consumeAiCredit(user.id);
    if (quota) return json({ error: quota.message }, quota.status);

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
