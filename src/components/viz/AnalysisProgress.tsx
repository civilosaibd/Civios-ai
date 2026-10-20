import { CheckCircle2, Circle, Loader2, XCircle, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VizJob } from "@/lib/viz/api";
import { useL } from "./bits";

/** Renders the REAL job row (steps are written by the edge function) — no timers, no fake percentages. */
export default function AnalysisProgress({ job, onCancel, onRetry, starting }: { job: VizJob | null; onCancel: () => void; onRetry: () => void; starting?: boolean }) {
  const L = useL();
  if (!job) return starting ? <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{L("Starting analysis job…", "অ্যানালাইসিস জব শুরু হচ্ছে…")}</div> : null;
  const running = job.status === "queued" || job.status === "running";
  return (
    <div className="space-y-3" data-testid="job-progress">
      <ul className="space-y-2">
        {job.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-sm">
            {s.status === "done" ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600" /> : s.status === "running" ? <Loader2 className="h-4 w-4 mt-0.5 animate-spin" /> : s.status === "error" ? <XCircle className="h-4 w-4 mt-0.5 text-destructive" /> : s.status === "skipped" ? <MinusCircle className="h-4 w-4 mt-0.5 text-muted-foreground" /> : <Circle className="h-4 w-4 mt-0.5 text-muted-foreground" />}
            <div><div className={s.status === "pending" ? "text-muted-foreground" : "font-medium"}>{s.label}</div>{s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}</div>
          </li>
        ))}
      </ul>
      {job.status === "failed" && <p className="text-sm text-destructive">{job.error}</p>}
      {job.status === "cancelled" && <p className="text-sm text-muted-foreground">{L("Analysis was cancelled.", "অ্যানালাইসিস বাতিল হয়েছে।")}</p>}
      <div className="flex gap-2">
        {running && <Button variant="outline" size="sm" onClick={onCancel}>{L("Cancel", "বাতিল")}</Button>}
        {(job.status === "failed" || job.status === "cancelled") && <Button size="sm" onClick={onRetry}>{L("Retry analysis", "আবার চেষ্টা")}</Button>}
      </div>
    </div>
  );
}
