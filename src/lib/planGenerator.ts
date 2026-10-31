// Rule-based floor plan generator (feet). Simplified Bangladesh setback/FAR guidance.
export type RoadSide = "north" | "south" | "east" | "west";
export interface PlanInput {
  plotWidth: number; // ft, along road
  plotDepth: number; // ft
  road: RoadSide;
  floors: number;
  bedrooms: number;
  bathrooms: number;
  kitchen: boolean;
  dining: boolean;
  drawing: boolean;
  balcony: boolean;
  stair: boolean;
  parking: boolean;
}
export interface Room { name: string; nameBn: string; x: number; y: number; w: number; h: number; zone: "front" | "mid" | "rear" }
export interface Check { ok: boolean; en: string; bn: string }
export interface PlanResult {
  setbacks: { front: number; rear: number; side: number };
  buildW: number; buildD: number; footprint: number; plotArea: number;
  coverage: number; totalBuilt: number; far: number; rooms: Room[]; checks: Check[];
  estCost: number;
}

export const DEFAULT_INPUT: PlanInput = {
  plotWidth: 40, plotDepth: 60, road: "south", floors: 4, bedrooms: 3, bathrooms: 2,
  kitchen: true, dining: true, drawing: true, balcony: true, stair: true, parking: true,
};

type Req = { name: string; nameBn: string; area: number; zone: Room["zone"]; min: number };

export function generatePlan(i: PlanInput): PlanResult {
  const plotArea = i.plotWidth * i.plotDepth;
  const setbacks = { front: plotArea > 2880 ? 6.5 : 5, rear: 3.3, side: 3.3 };
  const buildW = Math.max(10, i.plotWidth - 2 * setbacks.side);
  const buildD = Math.max(10, i.plotDepth - setbacks.front - setbacks.rear);
  const footprint = buildW * buildD;

  const reqs: Req[] = [];
  if (i.drawing) reqs.push({ name: "Drawing", nameBn: "ড্রয়িং", area: 180, zone: "front", min: 120 });
  if (i.balcony) reqs.push({ name: "Balcony", nameBn: "বারান্দা", area: 50, zone: "front", min: 25 });
  if (i.stair) reqs.push({ name: "Stair/Lift", nameBn: "সিঁড়ি/লিফট", area: 110, zone: "mid", min: 80 });
  if (i.dining) reqs.push({ name: "Dining", nameBn: "ডাইনিং", area: 150, zone: "mid", min: 100 });
  if (i.kitchen) reqs.push({ name: "Kitchen", nameBn: "রান্নাঘর", area: 80, zone: "mid", min: 50 });
  for (let b = 0; b < i.bedrooms; b++)
    reqs.push({ name: b === 0 ? "Master Bed" : `Bed ${b + 1}`, nameBn: b === 0 ? "মাস্টার বেড" : `বেড ${b + 1}`, area: b === 0 ? 180 : 140, zone: "rear", min: 100 });
  for (let t = 0; t < i.bathrooms; t++)
    reqs.push({ name: `Bath ${t + 1}`, nameBn: `বাথ ${t + 1}`, area: 40, zone: t % 2 ? "mid" : "rear", min: 30 });

  const zones: Room["zone"][] = ["front", "mid", "rear"];
  const zoneArea = zones.map((z) => reqs.filter((r) => r.zone === z).reduce((s, r) => s + r.area, 0));
  const totalReq = zoneArea.reduce((a, b) => a + b, 0) || 1;
  const rooms: Room[] = [];
  let y = 0; // y measured from road side
  zones.forEach((z, zi) => {
    const list = reqs.filter((r) => r.zone === z);
    if (!list.length) return;
    const h = (zoneArea[zi] / totalReq) * buildD;
    // Baths get a fixed practical width so they don't become slivers in deep bands
    const isBath = (r: Req) => r.name.startsWith("Bath");
    const bathW = Math.min(7, Math.max(5, 40 / h));
    const fixed = list.filter(isBath).length * bathW;
    const sum = list.filter((r) => !isBath(r)).reduce((s, r) => s + r.area, 0) || 1;
    let x = 0;
    list.forEach((r) => {
      const w = isBath(r) ? bathW : (r.area / sum) * Math.max(0, buildW - fixed);
      rooms.push({ name: r.name, nameBn: r.nameBn, x, y, w, h, zone: z });
      x += w;
    });
    y += h;
  });

  const coverage = (footprint / plotArea) * 100;
  const totalBuilt = footprint * i.floors;
  const far = totalBuilt / plotArea;
  const checks: Check[] = [];
  const fits = totalReq * 1.12 <= footprint; // 12% walls/circulation
  checks.push(fits
    ? { ok: true, en: `Required ${Math.round(totalReq)} sft fits buildable ${Math.round(footprint)} sft`, bn: `প্রয়োজনীয় ${Math.round(totalReq)} বর্গফুট, নির্মাণযোগ্য ${Math.round(footprint)} বর্গফুটে আঁটে` }
    : { ok: false, en: `Rooms need ~${Math.round(totalReq * 1.12)} sft but only ${Math.round(footprint)} sft buildable — reduce rooms`, bn: `রুমগুলোর জন্য ~${Math.round(totalReq * 1.12)} বর্গফুট দরকার, কিন্তু আছে ${Math.round(footprint)} — রুম কমান` });
  const small = rooms.filter((r) => { const q = reqs.find((x) => x.name === r.name)!; return (r.name.startsWith("Bath") ? r.w * r.h < q.min : r.w * r.h < q.min) || Math.min(r.w, r.h) < 6; });
  checks.push(small.length
    ? { ok: false, en: `Undersized: ${small.map((s) => s.name).join(", ")}`, bn: `ছোট রুম: ${small.map((s) => s.nameBn).join(", ")}` }
    : { ok: true, en: "All rooms meet minimum size", bn: "সব রুম ন্যূনতম মাপ পূরণ করে" });
  checks.push(far <= 3.5
    ? { ok: true, en: `FAR ${far.toFixed(2)} within typical limit (≤3.5)`, bn: `FAR ${far.toFixed(2)} সীমার মধ্যে (≤৩.৫)` }
    : { ok: false, en: `FAR ${far.toFixed(2)} exceeds typical 3.5 — reduce floors`, bn: `FAR ${far.toFixed(2)} সীমা ছাড়িয়েছে — তলা কমান` });
  checks.push(coverage <= 67
    ? { ok: true, en: `Ground coverage ${coverage.toFixed(0)}% (≤67%)`, bn: `ভূমি আচ্ছাদন ${coverage.toFixed(0)}% (≤৬৭%)` }
    : { ok: false, en: `Ground coverage ${coverage.toFixed(0)}% high`, bn: `ভূমি আচ্ছাদন ${coverage.toFixed(0)}% বেশি` });
  if (i.parking) checks.push(i.plotWidth >= 30
    ? { ok: true, en: "Ground-floor parking feasible", bn: "নিচতলায় পার্কিং সম্ভব" }
    : { ok: false, en: "Plot width < 30 ft — parking tight", bn: "প্লট ৩০ ফুটের কম — পার্কিং কষ্টসাধ্য" });

  return { setbacks, buildW, buildD, footprint, plotArea, coverage, totalBuilt, far, rooms, checks, estCost: Math.round(totalBuilt * 3200) };
}

/** Parse common English and Bangla floor-plan briefs into the deterministic plan inputs. */
export function parsePrompt(text: string, base: PlanInput = DEFAULT_INPUT): PlanInput {
  const s = text.toLowerCase()
    .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
  const out: PlanInput = { ...base };
  const dim = s.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|ফুট|m|meter|metre|মিটার)?\s*[x×*]\s*(\d+(?:\.\d+)?)/);
  if (dim) {
    out.plotWidth = Number(dim[1]);
    out.plotDepth = Number(dim[2]);
  }
  const number = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = s.match(pattern);
      if (match) return Number(match[1]);
    }
    return undefined;
  };
  out.bedrooms = number([
    /(\d+)\s*(?:bedrooms?|beds?|br|বেডরুম|বেড|শয়নকক্ষ)/,
  ]) ?? out.bedrooms;
  out.bathrooms = number([
    /(\d+)\s*(?:bathrooms?|baths?|toilets?|washrooms?|বাথরুম|বাথ|টয়লেট)/,
  ]) ?? out.bathrooms;
  out.floors = number([
    /(\d+)\s*(?:floors?|stories|storeys|তলা|ফ্লোর)/,
  ]) ?? out.floors;

  const dirs: [RoadSide, RegExp][] = [
    ["north", /north|উত্তর/], ["south", /south|দক্ষিণ/],
    ["east", /east|পূর্ব/], ["west", /west|পশ্চিম/],
  ];
  for (const [direction, pattern] of dirs) {
    if (pattern.test(s)) { out.road = direction; break; }
  }

  const disable = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(s));
  if (disable([/no\s+parking/, /without\s+parking/, /parking\s*না/, /পার্কিং\s*ছাড়া/])) out.parking = false;
  else if (/with\s+parking|parking\s+সহ|পার্কিং\s+চাই/.test(s)) out.parking = true;

  if (disable([/no\s+dining/, /without\s+dining/, /ডাইনিং\s*ছাড়া/])) out.dining = false;
  if (disable([/no\s+drawing/, /without\s+drawing/, /ড্রয়িং\s*ছাড়া/])) out.drawing = false;
  if (disable([/no\s+kitchen/, /without\s+kitchen/, /রান্নাঘর\s*ছাড়া/])) out.kitchen = false;
  if (disable([/no\s+balcony/, /without\s+balcony/, /বারান্দা\s*ছাড়া/])) out.balcony = false;
  if (disable([/no\s+stair/, /without\s+stair/, /সিঁড়ি\s*ছাড়া/])) out.stair = false;

  return {
    ...out,
    plotWidth: dim && Number.isFinite(out.plotWidth) ? Math.max(1, Math.min(1000, out.plotWidth)) : base.plotWidth,
    plotDepth: dim && Number.isFinite(out.plotDepth) ? Math.max(1, Math.min(1000, out.plotDepth)) : base.plotDepth,
    floors: Number.isFinite(out.floors) ? Math.max(1, Math.min(20, Math.round(out.floors))) : base.floors,
    bedrooms: Number.isFinite(out.bedrooms) ? Math.max(0, Math.min(8, Math.round(out.bedrooms))) : base.bedrooms,
    bathrooms: Number.isFinite(out.bathrooms) ? Math.max(0, Math.min(8, Math.round(out.bathrooms))) : base.bathrooms,
  };
}
