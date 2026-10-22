import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  cancelJob, downloadText, getLimits, getVisualization, latestJob, listFiles, saveVerifiedModel, signedUrl, startAnalysis, updateVisualization, watchJob,
  type VizFile, type VizJob, type VizRow,
} from "@/lib/viz/api";
import { DEFAULT_LIMITS, type UploadLimits } from "@/lib/viz/validate";
import { parseDxfToModel } from "@/lib/viz/dxf";
import { areaFallbackDraft, buildDraft, calibrateDxfByWall, primaryOf, type Calibration, type Draft, type RenderDims, type Setup, type StoredAnalysis } from "@/lib/viz/workflow";
import { demoModel } from "@/lib/viz/demo";
import type { BuildingModel, LinearUnit } from "@/lib/viz/types";
import { Disclaimer, Warn, useL } from "@/components/viz/bits";
import UploadPanel from "@/components/viz/UploadPanel";
import SetupForm, { type SetupState } from "@/components/viz/SetupForm";
import AnalysisProgress from "@/components/viz/AnalysisProgress";
import { DxfCalibration, RasterCalibration, RenderDimensions } from "@/components/viz/CalibrationPanel";
import VerifyPanel from "@/components/viz/VerifyPanel";
import ExplainPanel from "@/components/viz/ExplainPanel";
import Viewer3D from "@/components/viz/Viewer3D";

type Step = "upload" | "setup" | "calibrate" | "verify" | "view";
const STALE_JOB_MS = 6 * 60_000;

const isModel = (m: unknown): m is BuildingModel => !!m && typeof m === "object" && (m as BuildingModel).version === 1 && Array.isArray((m as BuildingModel).walls) && Array.isArray((m as BuildingModel).columns) && typeof (m as BuildingModel).floors === "number";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SEO title={`${title} — CivilOS AI`} description="3D Construction Visualization" />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2 min-w-0"><SidebarTrigger /><Button variant="ghost" size="sm" asChild><Link to="/visualizations"><ArrowLeft className="h-4 w-4 mr-1" />3D</Link></Button><h1 className="font-heading font-semibold truncate">{title}</h1></div>
            <ThemeToggle />
          </header>
          <main className="p-3 md:p-6 max-w-7xl w-full mx-auto space-y-5">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function DemoView() {
  const L = useL();
  const model = useMemo(() => demoModel(), []);
  return (
    <Shell title={L("3D demo (sample)", "৩ডি ডেমো (নমুনা)")}>
      <Warn>{L("Built-in sample drawing (10 × 8 m, 3 floors) — works offline, nothing is saved. Create a visualization to use your own drawings.", "বিল্ট-ইন নমুনা ড্রয়িং (১০ × ৮ মি, ৩ তলা) — অফলাইনে চলে, কিছু সেভ হয় না। নিজের ড্রয়িংয়ের জন্য নতুন ভিজ্যুয়ালাইজেশন বানান।")}</Warn>
      <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start"><Viewer3D model={model} name="demo" /><ExplainPanel model={model} /></div>
    </Shell>
  );
}

export default function VisualizationWorkspacePage() {
  const { id } = useParams();
  if (id === "demo") return <DemoView />;
  return <Workspace id={id!} />;
}

function Workspace({ id }: { id: string }) {
  const L = useL();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [viz, setViz] = useState<VizRow | null>(null);
  const [files, setFiles] = useState<VizFile[]>([]);
  const [limits, setLimits] = useState<UploadLimits>(DEFAULT_LIMITS);
  const [canEdit, setCanEdit] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [setup, setSetup] = useState<SetupState>({ name: "", buildingType: "Residential", floors: null, approxAreaSqft: null, unitSystem: "metric", location: "" });
  const [job, setJob] = useState<VizJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [model, setModel] = useState<BuildingModel | null>(null);
  const [scaleLabel, setScaleLabel] = useState<string | undefined>();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const stopWatch = useRef<(() => void) | null>(null);
  const dxfModel = useRef<BuildingModel | null>(null);
  const initialised = useRef(false);

  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);

  const reloadFiles = useCallback(async () => { setFiles(await listFiles(id)); }, [id]);
  const setupOf = (v: VizRow): SetupState => ({ name: v.name, buildingType: v.building_type ?? "Residential", floors: v.floor_count, approxAreaSqft: v.approx_area_sqft, unitSystem: v.unit_system, location: v.location ?? "" });
  const dxfFile = files.find((f) => f.file_type === "dxf" && f.role === "source");
  const unit: LinearUnit = setup.unitSystem === "imperial" ? "ft" : "m";

  // ---- initial load ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    let dead = false;
    (async () => {
      try {
        const [v, f, lim, j, can] = await Promise.all([
          getVisualization(id), listFiles(id), getLimits().catch(() => DEFAULT_LIMITS), latestJob(id).catch(() => null),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).rpc("viz_can_write", { _viz: id, _user: user.id }),
        ]);
        if (dead) return;
        setViz(v); setFiles(f); setLimits(lim); setSetup(setupOf(v)); setCanEdit(!!can.data);
        const stale = j && ["queued", "running"].includes(j.status) && Date.now() - new Date(j.created_at).getTime() > STALE_JOB_MS;
        setJob(j ?? null);
        if (!initialised.current) {
          initialised.current = true;
          if (isModel(v.model) && ["generated", "verified"].includes(v.status)) { setModel(v.model); setStep("view"); }
          else if (v.status === "analyzing" && j && !stale) { setStep("setup"); resume(j); }
          else if (v.status === "needs_review" && (v.analysis || f.some((x) => x.file_type === "dxf"))) { setStep("setup"); void computeDraft(v, f, {}); }
          else setStep(f.length ? "setup" : "upload");
        }
      } catch (e) { if (!dead) setLoadErr(e instanceof Error ? e.message : "Could not load"); }
    })();
    supabase.from("projects").select("id,name").order("created_at", { ascending: false }).then(({ data }) => { if (!dead && data) setProjects(data as { id: string; name: string }[]); });
    return () => { dead = true; stopWatch.current?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  // calibration image
  useEffect(() => {
    setImgUrl(null);
    if (step !== "calibrate" || !viz?.analysis) return;
    const p = primaryOf(viz.analysis as StoredAnalysis); const f = files.find((x) => x.id === p?.file_id);
    if (f) signedUrl(f.file_url).then(setImgUrl).catch(() => setImgUrl(null));
  }, [step, viz?.analysis, files]);

  const setupForCalc = (s: SetupState): Setup => ({ name: s.name, buildingType: s.buildingType, floors: s.floors, approxAreaSqft: s.approxAreaSqft, unitSystem: s.unitSystem });

  async function computeDraft(v: VizRow, f: VizFile[], o: { calibration?: Calibration | null; renderDims?: RenderDims | null; forceMode?: "plan" | "render" | null; area?: boolean; dxfCal?: { wallId: string; known: number; unit: LinearUnit } }, s: SetupState = setupOf(v)) {
    try {
      const dxf = f.find((x) => x.file_type === "dxf" && x.role === "source");
      let d: Draft;
      if (dxf) {
        if (!dxfModel.current) dxfModel.current = parseDxfToModel(await downloadText(dxf.file_url), { name: s.name, floors: s.floors ?? undefined }).model;
        let m: BuildingModel = { ...dxfModel.current, name: s.name, buildingType: s.buildingType, unitSystem: s.unitSystem };
        if (s.floors) m.floors = s.floors;
        if (o.dxfCal) m = { ...calibrateDxfByWall(m, o.dxfCal.wallId, o.dxfCal.known, o.dxfCal.unit), name: s.name };
        d = m.scale.source === "none" ? { status: "needs_calibration", autoFailed: true, reason: "no units" } : { status: "ready", model: m, mode: "plan", scaleLabel: m.scale.source === "dxf" ? "Units from DXF file" : "Manual calibration (known wall length)" };
        if (o.dxfCal) dxfModel.current = m;
      } else if (v.analysis) {
        const st = v.analysis as StoredAnalysis;
        d = o.area ? areaFallbackDraft(st, setupForCalc(s)) : buildDraft(st, setupForCalc(s), o);
      } else d = { status: "error", reason: L("No analysis available yet.", "এখনো অ্যানালাইসিস নেই।") };
      setDraft(d);
      if (d.status === "ready") { setModel(d.model); setScaleLabel(d.scaleLabel); setStep("verify"); } else setStep("calibrate");
    } catch (e) { setDraft({ status: "error", reason: e instanceof Error ? e.message : String(e) }); setStep("calibrate"); }
  }

  async function onJobUpdate(j: VizJob) {
    setJob(j);
    if (j.status === "succeeded") {
      const v = await getVisualization(id); setViz(v); await reloadFiles(); setStarting(false);
      await computeDraft(v, await listFiles(id), {}, setupOf(v));
    } else if (j.status === "failed" || j.status === "cancelled") { setViz(await getVisualization(id)); setStarting(false); }
  }
  function resume(j: VizJob) { stopWatch.current?.(); stopWatch.current = watchJob(j.id, (x) => void onJobUpdate(x)); }

  async function analyze() {
    if (!viz) return;
    if (!setup.name.trim()) { toast.error(L("Please enter a name.", "নাম দিন।")); return; }
    setBusy(true); dxfModel.current = null;
    try {
      const patch = { name: setup.name.trim(), building_type: setup.buildingType, floor_count: setup.floors, approx_area_sqft: setup.approxAreaSqft, location: setup.location.trim() || null, unit_system: setup.unitSystem };
      await updateVisualization(id, patch);
      if (dxfFile) {
        await updateVisualization(id, { status: "needs_review", source_type: "dxf" });
        const v = await getVisualization(id); setViz(v);
        await computeDraft(v, files, {}, setup);
      } else {
        const imgs = files.filter((f) => f.file_type === "image" || f.file_type === "pdf");
        if (!imgs.length) throw new Error(L("Upload at least one plan image, PDF or DXF first.", "আগে অন্তত একটি প্ল্যান ছবি, PDF বা DXF আপলোড করুন।"));
        setStarting(true); setJob(null);
        const jobId = await startAnalysis(id);
        setViz({ ...viz, ...patch, status: "analyzing" } as VizRow);
        stopWatch.current?.(); stopWatch.current = watchJob(jobId, (x) => void onJobUpdate(x));
      }
    } catch (e) { setStarting(false); toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function confirm(m: BuildingModel) {
    setBusy(true);
    try { await saveVerifiedModel(id, m, { name: m.name, location: setup.location || null, approx_area_sqft: setup.approxAreaSqft }); setModel(m); setViz(await getVisualization(id)); setStep("view"); toast.success(L("3D model saved.", "৩ডি মডেল সেভ হয়েছে।")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  }

  const rename = async (name: string) => { if (!name.trim() || !viz) { setRenaming(null); return; } try { await updateVisualization(id, { name: name.trim() }); setViz({ ...viz, name: name.trim() }); setSetup((s) => ({ ...s, name: name.trim() })); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } setRenaming(null); };
  const assignProject = async (pid: string) => { try { await updateVisualization(id, { project_id: pid === "none" ? null : pid }); setViz((v) => v && { ...v, project_id: pid === "none" ? null : pid }); toast.success(L("Project updated", "প্রজেক্ট আপডেট হয়েছে")); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } };

  if (loadErr) return <Shell title="3D"><Card className="p-6 space-y-3"><p className="font-medium">{L("This visualization could not be opened.", "এই ভিজ্যুয়ালাইজেশন খোলা যায়নি।")}</p><p className="text-sm text-muted-foreground">{loadErr}</p><Button asChild><Link to="/visualizations">{L("Back to list", "তালিকায় ফিরুন")}</Link></Button></Card></Shell>;
  if (!viz) return <Shell title="3D"><div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></Shell>;

  const jobRunning = !!job && ["queued", "running"].includes(job.status) && Date.now() - new Date(job.created_at).getTime() < STALE_JOB_MS;
  const hasAnalysis = !!viz.analysis || !!dxfFile;
  const reach: Record<Step, boolean> = { upload: true, setup: files.length > 0, calibrate: hasAnalysis && !!draft, verify: draft?.status === "ready" || !!model, view: !!viz.model && isModel(viz.model) };
  const STEPS: [Step, string][] = [["upload", L("1 · Upload", "১ · আপলোড")], ["setup", L("2 · Setup & analyze", "২ · সেটআপ ও অ্যানালাইজ")], ["calibrate", L("3 · Calibrate", "৩ · ক্যালিব্রেট")], ["verify", L("4 · Verify", "৪ · যাচাই")], ["view", L("5 · 3D view", "৫ · ৩ডি ভিউ")]];
  const sourceKind = dxfFile ? "dxf" : viz.analysis ? (primaryOf(viz.analysis as StoredAnalysis)?.analysis.drawingType ?? "plan") : "";

  const title = (
    renaming !== null
      ? <Input autoFocus className="h-8 max-w-xs" value={renaming} onChange={(e) => setRenaming(e.target.value)} onBlur={() => void rename(renaming)} onKeyDown={(e) => { if (e.key === "Enter") void rename(renaming); if (e.key === "Escape") setRenaming(null); }} />
      : <button className="flex items-center gap-2 text-lg font-semibold hover:underline" disabled={!canEdit} onClick={() => setRenaming(viz.name)}>{viz.name}{canEdit && <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}</button>
  );

  return (
    <Shell title={viz.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">{title}{!canEdit && <span className="text-xs rounded border px-2 py-1 text-muted-foreground">{L("View only", "শুধু দেখা")}</span>}</div>

      <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label="steps">
        {STEPS.map(([s, label]) => (
          <button key={s} disabled={!reach[s]} onClick={() => setStep(s)} data-testid={`step-${s}`}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm border transition ${step === s ? "bg-primary text-primary-foreground border-primary" : reach[s] ? "hover:bg-muted" : "opacity-40 cursor-not-allowed"}`}>{label}</button>
        ))}
      </nav>

      {step === "upload" && (
        <Card className="p-4 md:p-6 space-y-4">
          <UploadPanel vizId={id} files={files} limits={limits} canEdit={canEdit} onChange={() => void reloadFiles()} />
          <div className="flex justify-end"><Button disabled={files.filter((f) => f.role === "source").length === 0} onClick={() => setStep("setup")} data-testid="to-setup">{L("Continue", "এগিয়ে যান")}</Button></div>
        </Card>
      )}

      {step === "setup" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card className="p-4 md:p-6 space-y-4">
            <h2 className="font-semibold">{L("Project setup", "প্রজেক্ট সেটআপ")}</h2>
            <SetupForm value={setup} onChange={setSetup} disabled={!canEdit || jobRunning} />
            <p className="text-xs text-muted-foreground">{files.filter((f) => f.role === "source").length} {L("file(s) ready.", "ফাইল প্রস্তুত।")} {dxfFile ? L("CAD (DXF) geometry will be read directly — no AI needed.", "CAD (DXF) জ্যামিতি সরাসরি পড়া হবে — AI লাগবে না।") : L("The AI will trace walls, openings, columns, stairs and read dimensions.", "AI দেয়াল, খোলা অংশ, কলাম, সিঁড়ি ট্রেস করবে ও মাপ পড়বে।")}</p>
            <Button disabled={!canEdit || busy || jobRunning || starting} onClick={() => void analyze()} data-testid="analyze">{(busy || jobRunning) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{dxfFile ? L("Read DXF", "DXF পড়ুন") : L("Analyze drawing", "ড্রয়িং অ্যানালাইজ করুন")}</Button>
          </Card>
          <Card className="p-4 md:p-6 space-y-3">
            <h2 className="font-semibold">{L("Analysis", "অ্যানালাইসিস")}</h2>
            {!job && !starting && <p className="text-sm text-muted-foreground">{L("Progress shown here is the real job state from the server.", "এখানে সার্ভারের আসল জব অবস্থা দেখানো হয়।")}</p>}
            {job && !jobRunning && ["queued", "running"].includes(job.status) && <Warn>{L("The last job seems stuck (no result after several minutes). You can retry.", "শেষ জবটি আটকে গেছে মনে হচ্ছে (কয়েক মিনিটেও ফল নেই)। আবার চেষ্টা করুন।")}</Warn>}
            <AnalysisProgress job={job} starting={starting} onCancel={() => job && void cancelJob(job.id).catch((e) => toast.error(e.message))} onRetry={() => void analyze()} />
            {viz.analysis && !jobRunning && <Button variant="outline" onClick={() => void computeDraft(viz, files, {}, setup)}>{L("Continue to calibration", "ক্যালিব্রেশনে যান")}</Button>}
          </Card>
        </div>
      )}

      {step === "calibrate" && draft && (
        <Card className="p-4 md:p-6 space-y-4">
          <h2 className="font-semibold">{L("Scale calibration", "স্কেল ক্যালিব্রেশন")}</h2>
          {draft.status === "error" && <Warn>{draft.reason}</Warn>}
          {draft.status === "ready" && <p className="text-sm text-emerald-700 dark:text-emerald-400" data-testid="calib-current">{L("Current scale", "বর্তমান স্কেল")}: {draft.scaleLabel}. {L("You can recalibrate below, or go to Verify.", "নিচে আবার ক্যালিব্রেট করতে পারেন, বা Verify-তে যান।")}</p>}
          {!dxfFile && viz.analysis && draft.status === "ready" && draft.mode === "render" && <RenderDimensions defaultUnit={unit} hasArea={!!setup.approxAreaSqft} onApply={(d) => void computeDraft(viz, files, { renderDims: d, forceMode: "render" }, setup)} />}
          {dxfFile && draft.status === "needs_calibration" && dxfModel.current && (
            <DxfCalibration model={dxfModel.current} defaultUnit={unit} onApply={(wallId, known, u) => void computeDraft(viz, files, { dxfCal: { wallId, known, unit: u } }, setup)} />
          )}
          {!dxfFile && viz.analysis && draft.status === "needs_dimensions" && (
            <RenderDimensions defaultUnit={unit} hasArea={!!setup.approxAreaSqft} reason={draft.reason} onApply={(d) => void computeDraft(viz, files, { renderDims: d, forceMode: "render" }, setup)} />
          )}
          {!dxfFile && viz.analysis && (draft.status === "needs_calibration" || (draft.status === "ready" && draft.mode === "plan") || (draft.status === "error" && primaryOf(viz.analysis as StoredAnalysis)?.analysis.walls.length >= 3)) && imgUrl && (() => {
            const p = primaryOf(viz.analysis as StoredAnalysis)!;
            return <RasterCalibration imageUrl={imgUrl} width={p.width ?? 1} height={p.height ?? 1} analysis={p.analysis} defaultUnit={unit} reason={draft.status === "needs_calibration" ? draft.reason : undefined}
              canUseArea={!!setup.approxAreaSqft} onApply={(c) => void computeDraft(viz, files, { calibration: c }, setup)} onAreaFallback={() => void computeDraft(viz, files, { area: true }, setup)} />;
          })()}
          {!dxfFile && viz.analysis && (
            <div className="border-t pt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{L("AI classified this as:", "AI একে চিহ্নিত করেছে:")} <b>{sourceKind}</b>.</span>
              <Button size="sm" variant="outline" onClick={() => void computeDraft(viz, files, { forceMode: "render" }, setup)}>{L("Treat as render/photo (conceptual)", "রেন্ডার/ছবি ধরুন (কনসেপ্টুয়াল)")}</Button>
              <Button size="sm" variant="outline" onClick={() => void computeDraft(viz, files, { forceMode: "plan" }, setup)}>{L("Treat as floor plan", "ফ্লোর প্ল্যান ধরুন")}</Button>
            </div>
          )}
          {viz.analysis && ((viz.analysis as StoredAnalysis).warnings?.length ?? 0) > 0 && <ul className="text-xs list-disc pl-4 text-amber-700 dark:text-amber-400">{(viz.analysis as StoredAnalysis).warnings!.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </Card>
      )}

      {step === "verify" && model && (
        <Card className="p-4 md:p-6"><h2 className="font-semibold mb-3">{L("Verify before generating 3D", "৩ডি তৈরির আগে যাচাই করুন")}</h2>
          <VerifyPanel model={model} onChange={setModel} onConfirm={(m) => void confirm(m)} busy={busy} scaleLabel={scaleLabel} /></Card>
      )}

      {step === "view" && viz.model && isModel(viz.model) && (
        <div className="space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            <Viewer3D model={viz.model} name={viz.name} />
            <div className="space-y-4">
              <ExplainPanel model={viz.model} />
              <Card className="p-4 space-y-3 text-sm">
                <div><Label className="text-xs">{L("Save to project", "প্রজেক্টে সেভ")}</Label>
                  <Select value={viz.project_id ?? "none"} onValueChange={(v) => void assignProject(v)} disabled={!canEdit || user?.id !== viz.user_id}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{L("— No project —", "— কোনো প্রজেক্ট নয় —")}</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
                  {user?.id !== viz.user_id && <p className="text-[11px] text-muted-foreground mt-1">{L("Only the owner can move it to another project.", "শুধু মালিক অন্য প্রজেক্টে সরাতে পারবেন।")}</p>}</div>
                {canEdit && <Button variant="outline" className="w-full" onClick={() => { setModel(viz.model); setScaleLabel(undefined); setStep("verify"); }}><Check className="h-4 w-4 mr-1" />{L("Edit & re-verify", "এডিট ও পুনরায় যাচাই")}</Button>}
                <p className="text-[11px] text-muted-foreground">{L("Construction PDF report and video are in the download menu.", "PDF রিপোর্ট ও ভিডিও ডাউনলোড মেনুতে আছে।")}</p>
              </Card>
            </div>
          </div>
        </div>
      )}
      {(step === "upload" || step === "setup" || step === "calibrate") && <Disclaimer />}
    </Shell>
  );
}
