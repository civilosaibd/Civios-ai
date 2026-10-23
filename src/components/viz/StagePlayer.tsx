import { Pause, Play, RotateCcw, SkipBack, SkipForward, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { STAGES, STAGE_COUNT, initialSim, posOfStageEnd, posToStage, type Sim } from "@/lib/viz/stages";
import { useL } from "./bits";

/** Illustrative build-up player. Shows the real element counts for the current step — never a % complete. */
export default function StagePlayer({ sim, setSim, shown, total }: { sim: Sim; setSim: (f: (s: Sim) => Sim) => void; shown: number; total: number }) {
  const L = useL();
  const { stage, t } = posToStage(sim.pos);
  const info = STAGES[stage - 1];

  if (!sim.on) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5" data-testid="stage-player-off">
        <div className="flex items-center gap-2 text-sm"><Clapperboard className="h-4 w-4 text-primary" /><span className="font-medium">{L("Construction sequence", "কনস্ট্রাকশন সিকোয়েন্স")}</span><span className="text-xs text-muted-foreground hidden sm:inline">{L("8-stage build-up of this model", "এই মডেলের ৮ ধাপের নির্মাণক্রম")}</span></div>
        <Button size="sm" onClick={() => setSim(() => ({ on: true, playing: true, pos: 0, speed: 1, cinematic: true }))} data-testid="stage-start"><Play className="h-4 w-4 mr-1" />{L("Play", "চালু করুন")}</Button>
      </div>
    );
  }
  const atEnd = sim.pos >= STAGE_COUNT;
  return (
    <div className="rounded-lg border p-2.5 space-y-2 min-w-0 max-w-full overflow-hidden" data-testid="stage-player">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Previous stage" onClick={() => setSim((s) => ({ ...s, playing: false, pos: stage <= 1 ? 0 : posOfStageEnd(stage - (t > 0.02 && t < 0.999 ? 1 : 2)) }))}><SkipBack className="h-4 w-4" /></Button>
        <Button size="icon" className="h-8 w-8" aria-label={sim.playing ? "Pause" : "Play"} data-testid="stage-toggle" onClick={() => setSim((s) => ({ ...s, playing: !s.playing, pos: s.pos >= STAGE_COUNT ? 0 : s.pos }))}>{sim.playing ? <Pause className="h-4 w-4" /> : atEnd ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Next stage" onClick={() => setSim((s) => ({ ...s, playing: false, pos: posOfStageEnd(Math.min(STAGE_COUNT, stage + (t >= 0.999 ? 1 : 0))) }))}><SkipForward className="h-4 w-4" /></Button>
        <div className="flex gap-1 ml-1">{[0.5, 1, 2].map((v) => <Button key={v} size="sm" variant={sim.speed === v ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setSim((s) => ({ ...s, speed: v }))}>{v}×</Button>)}</div>
        <label className="flex items-center gap-1.5 text-xs ml-auto"><Switch checked={sim.cinematic} onCheckedChange={(v) => setSim((s) => ({ ...s, cinematic: v }))} />{L("Cinematic camera", "সিনেমাটিক ক্যামেরা")}</label>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSim(() => initialSim())}>{L("Exit", "বন্ধ")}</Button>
      </div>
      <Slider min={0} max={STAGE_COUNT} step={0.01} value={[sim.pos]} aria-label="Stage position" onValueChange={([v]) => setSim((s) => ({ ...s, playing: false, pos: v }))} />
      <div className="flex gap-1 overflow-x-auto pb-0.5 max-w-full">
        {STAGES.map((s) => (
          <button key={s.n} onClick={() => setSim((x) => ({ ...x, playing: false, pos: posOfStageEnd(s.n) }))} data-testid={`stage-${s.n}`}
            className={`whitespace-nowrap px-2 py-1 rounded-full text-[11px] border ${stage === s.n ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>{s.n}. {L(s.en, s.bn)}</button>
        ))}
      </div>
      <p className="text-xs"><b>{L(`Stage ${stage}: ${info.en}`, `ধাপ ${stage}: ${info.bn}`)}</b> — {L(info.descEn, info.descBn)} <span className="text-muted-foreground">({L(`${shown} of ${total} model elements shown`, `${total}টির মধ্যে ${shown}টি মডেল এলিমেন্ট দেখানো হচ্ছে`)})</span></p>
      <p className="text-[11px] text-muted-foreground">{L("Illustrative build-up order only — not a construction schedule. No durations, costs or real progress are implied.", "শুধু উদাহরণমূলক নির্মাণক্রম — নির্মাণ সময়সূচি নয়। কোনো সময়, খরচ বা প্রকৃত অগ্রগতি বোঝায় না।")}</p>
    </div>
  );
}
