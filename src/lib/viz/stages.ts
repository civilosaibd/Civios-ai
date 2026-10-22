// Construction-STAGE simulation — an ILLUSTRATIVE build-up sequence derived from the verified model.
// It is NOT a project schedule: no durations, costs or percentages of real progress are computed.
// Visibility is a pure function of (stage, how far through the stage, the element's kind and floor).

import type { Kind } from "./geometry";

export interface StageInfo { n: number; en: string; bn: string; descEn: string; descBn: string; kinds: Kind[] }

export const STAGES: StageInfo[] = [
  { n: 1, en: "Site preparation", bn: "সাইট প্রস্তুতি", descEn: "Cleared ground. Nothing is built yet.", descBn: "জায়গা পরিষ্কার। এখনো কিছু তৈরি হয়নি।", kinds: [] },
  { n: 2, en: "Foundation", bn: "ফাউন্ডেশন", descEn: "Footings under each column and the plinth slab.", descBn: "প্রতিটি কলামের নিচে ফুটিং ও প্লিন্থ স্ল্যাব।", kinds: ["footing", "plinth"] },
  { n: 3, en: "Columns", bn: "কলাম", descEn: "Columns rise floor by floor.", descBn: "কলাম তলা-বাই-তলা উঠছে।", kinds: ["column"] },
  { n: 4, en: "Beams & slabs", bn: "বিম ও স্ল্যাব", descEn: "Beams (conceptual) and floor slabs.", descBn: "বিম (কনসেপ্টুয়াল) ও ফ্লোর স্ল্যাব।", kinds: ["beam", "slab"] },
  { n: 5, en: "Walls", bn: "দেয়াল", descEn: "Masonry walls, floor by floor.", descBn: "ইটের দেয়াল, তলা-বাই-তলা।", kinds: ["wall"] },
  { n: 6, en: "Doors, windows & stairs", bn: "দরজা, জানালা ও সিঁড়ি", descEn: "Openings filled, stairs and balconies added.", descBn: "দরজা-জানালা বসছে, সিঁড়ি ও বারান্দা যুক্ত হচ্ছে।", kinds: ["door", "window", "stair", "balcony"] },
  { n: 7, en: "Roof & parapet", bn: "ছাদ ও প্যারাপেট", descEn: "Roof slab, parapet and roof form.", descBn: "ছাদ, প্যারাপেট ও ছাদের আকৃতি।", kinds: ["roof", "parapet"] },
  { n: 8, en: "Completed model", bn: "সম্পূর্ণ মডেল", descEn: "Everything in the verified model, with the chosen surroundings.", descBn: "যাচাইকৃত মডেলের সবকিছু, নির্বাচিত পারিপার্শ্বিকসহ।", kinds: [] },
];
export const STAGE_COUNT = STAGES.length;

/** the stage in which each kind first appears */
const FIRST_STAGE: Record<Kind, number> = {
  footing: 2, plinth: 2, column: 3, beam: 4, slab: 4, wall: 5, door: 6, window: 6, stair: 6, balcony: 6, roof: 7, parapet: 7,
};
export const firstStageOf = (k: Kind) => FIRST_STAGE[k];

export interface SimPos { stage: number; t: number }

/** pos ∈ [0, 8]: integer part = finished stages, fraction = progress inside the next one. */
export function posToStage(pos: number): SimPos {
  const p = Math.min(STAGE_COUNT, Math.max(0, pos));
  if (p >= STAGE_COUNT) return { stage: STAGE_COUNT, t: 1 };
  return { stage: Math.floor(p) + 1, t: p - Math.floor(p) };
}
/** position that shows stage `s` fully built (used by the stage buttons) */
export const posOfStageEnd = (s: number) => (s >= STAGE_COUNT ? STAGE_COUNT : Math.max(0, s) - 1e-6);

/** advance a playing simulation by dt seconds; each stage lasts `secondsPerStage` at speed 1 */
export function advance(pos: number, dtSec: number, speed: number, secondsPerStage = 4): { pos: number; done: boolean } {
  const next = Math.min(STAGE_COUNT, pos + (dtSec * Math.max(0, speed)) / secondsPerStage);
  return { pos: next, done: next >= STAGE_COUNT };
}

/**
 * Is an element of `kind` on `floor` visible at this point of the simulation?
 * floor: -1 = foundation, 0..floors-1 = storeys, `floors` = roof level.
 */
export function stageVisible(kind: Kind, floor: number, floors: number, sim: SimPos): boolean {
  const first = FIRST_STAGE[kind];
  if (sim.stage > first) return true;
  if (sim.stage < first) return false;
  // currently being built: reveal floor by floor (foundation / roof-level items appear with t > 0)
  if (sim.t <= 0) return false;
  if (floor < 0 || floor >= floors) return true;
  const revealed = Math.ceil(sim.t * floors - 1e-9);
  // slabs sit on top of the floor below, so slab i belongs with storey i-1
  return kind === "slab" ? floor <= revealed : floor < revealed;
}

/** share of the visible element count: used only for the label "n of m elements", never as % complete */
export function visibleCounts(items: { kind: Kind; floor: number }[], floors: number, sim: SimPos) {
  let shown = 0;
  for (const it of items) if (stageVisible(it.kind, it.floor, floors, sim)) shown++;
  return { shown, total: items.length };
}

export interface Sim { on: boolean; playing: boolean; pos: number; speed: number; cinematic: boolean }
export const initialSim = (): Sim => ({ on: false, playing: false, pos: 0, speed: 1, cinematic: true });
