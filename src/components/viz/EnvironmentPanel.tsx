import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ENV_NOTE, ENV_PRESETS, type CustomEnv, type EnvPreset } from "@/lib/viz/environment";
import { useL } from "./bits";

export default function EnvironmentPanel({ preset, setPreset, custom, setCustom }: { preset: EnvPreset; setPreset: (p: EnvPreset) => void; custom: CustomEnv; setCustom: (c: CustomEnv) => void }) {
  const L = useL();
  return (
    <section className="space-y-2" data-testid="env-panel">
      <Label className="text-xs uppercase text-muted-foreground">{L("Surroundings", "পারিপার্শ্বিক")}</Label>
      <Select value={preset} onValueChange={(v) => setPreset(v as EnvPreset)}>
        <SelectTrigger className="h-8 text-xs" aria-label="Environment preset"><SelectValue /></SelectTrigger>
        <SelectContent>{ENV_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{L(p.en, p.bn)}</SelectItem>)}</SelectContent>
      </Select>
      {preset === "custom" && (
        <div className="space-y-2 rounded border p-2">
          <label className="flex items-center justify-between text-xs"><span>{L("Trees", "গাছ")}</span><Switch checked={custom.trees} onCheckedChange={(v) => setCustom({ ...custom, trees: v })} /></label>
          <label className="flex items-center justify-between text-xs"><span>{L("Road", "রাস্তা")}</span><Switch checked={custom.road} onCheckedChange={(v) => setCustom({ ...custom, road: v })} /></label>
          <div className="space-y-1"><span className="text-xs">{L("Neighbouring buildings", "পাশের ভবন")}: {custom.neighbours}</span><Slider min={0} max={8} step={1} value={[custom.neighbours]} onValueChange={([v]) => setCustom({ ...custom, neighbours: v })} /></div>
          <div className="space-y-1"><span className="text-xs">{L("Neighbour height", "পাশের ভবনের উচ্চতা")}: {custom.neighbourHeight} m</span><Slider min={3} max={40} step={1} value={[custom.neighbourHeight]} onValueChange={([v]) => setCustom({ ...custom, neighbourHeight: v })} /></div>
          <label className="flex items-center justify-between text-xs"><span>{L("Ground colour", "মাটির রং")}</span><input type="color" aria-label="Ground colour" value={custom.groundColor} onChange={(e) => setCustom({ ...custom, groundColor: e.target.value })} className="h-6 w-9 rounded border bg-transparent" /></label>
        </div>
      )}
      {preset !== "minimal" && <p className="text-[11px] text-muted-foreground">{L(ENV_NOTE.en, ENV_NOTE.bn)}</p>}
    </section>
  );
}
