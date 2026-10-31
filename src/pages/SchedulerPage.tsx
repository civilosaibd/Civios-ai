import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useActiveProjectId } from "@/lib/projectSelection";
import { listProjectArtifacts } from "@/lib/projectArtifacts";
import { useProjectArtifactAutosave } from "@/hooks/useProjectArtifactAutosave";
import { useCloudState } from "@/lib/cloudState";
import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarRange, Plus, Trash2, RotateCcw, Download, AlertTriangle, Save, FolderOpen } from "lucide-react";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";
import { QA_TEMPLATE, schedule, TEMPLATE, type DepType, type QAItem, type Task } from "@/lib/scheduler";


export default function SchedulerPage() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const projectId = useActiveProjectId();
  const bn = lang === "bn";
  const T = (en: string, b: string) => (bn ? b : en);
  const [tasks, setTasks] = useCloudState<Task[]>("civilos.schedule", TEMPLATE);
  const [qa, setQa] = useCloudState<QAItem[]>("civilos.qa", QA_TEMPLATE);
  const [start, setStart] = useCloudState<string>("civilos.scheduleStart", new Date().toISOString().slice(0, 10));
  type SavedSchedule = { id: string; name: string; tasks: Task[]; qa: QAItem[]; start: string; updatedAt: string };
  const [savedSchedules, setSavedSchedules] = useCloudState<SavedSchedule[]>("civilos.saved-schedules", []);
  const [scheduleName, setScheduleName] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [projectArtifactId, setProjectArtifactId] = useState<string | undefined>();
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadedProjectId(null);
    setProjectArtifactId(undefined);
    setProjectLoadError(null);
    setSelectedScheduleId("");
    if (!projectId) return;
    void listProjectArtifacts(projectId).then((items) => {
      if (cancelled) return;
      const saved = items.find((item) => item.artifact_type === "project-schedule");
      const data = saved?.data ?? {};
      if (Array.isArray(data.tasks) && data.tasks.every((task) => task && typeof task.id === "string" && typeof task.name === "string" && Number.isFinite(task.duration))) setTasks(data.tasks as Task[]);
      else setTasks(TEMPLATE);
      if (Array.isArray(data.qa) && data.qa.every((item) => item && typeof item.id === "string" && typeof item.done === "boolean")) setQa(data.qa as QAItem[]);
      else setQa(QA_TEMPLATE);
      if (typeof data.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.start)) setStart(data.start);
      else setStart(new Date().toISOString().slice(0, 10));
      if (Array.isArray(data.savedSchedules)) setSavedSchedules(data.savedSchedules as SavedSchedule[]);
      else setSavedSchedules([]);
      setProjectArtifactId(saved?.id);
      setLoadedProjectId(projectId);
    }).catch((error) => {
      if (!cancelled) { setProjectLoadError(error instanceof Error ? error.message : "Could not load this project's schedule."); setLoadedProjectId(projectId); }
    });
    return () => { cancelled = true; };
  }, [projectId, setTasks, setQa, setStart, setSavedSchedules]);

  const projectSave = useProjectArtifactAutosave({
    projectId: projectId ?? "", artifactId: projectArtifactId, artifactType: "project-schedule",
    title: "Construction Schedule & QA/QC", description: "Project-scoped WBS, dependencies, progress, dates and QA/QC checklist",
    data: { tasks, qa, start, savedSchedules }, enabled: !!projectId && loadedProjectId === projectId && !projectLoadError,
    debounceMs: 1600,
  });
  useEffect(() => { if (projectSave.artifactId && projectSave.artifactId !== projectArtifactId) setProjectArtifactId(projectSave.artifactId); }, [projectSave.artifactId, projectArtifactId]);

  const { rows, total, cycle } = useMemo(() => schedule(tasks), [tasks]);
  const date = (d: number) => { const x = new Date(start); x.setDate(x.getDate() + d); return x.toLocaleDateString(bn ? "bn-BD" : "en-GB", { day: "2-digit", month: "short" }); };
  const upd = (id: string, p: Partial<Task>) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const add = () => {
    const id = `t${Date.now()}`; const last = tasks[tasks.length - 1];
    setTasks([...tasks, { id, wbs: `${tasks.length + 1}.0`, name: "New task", nameBn: "নতুন কাজ", duration: 5, deps: last ? [{ id: last.id, type: "FS", lag: 0 }] : [], progress: 0 }]);
  };
  const remove = (id: string) => setTasks((ts) => ts.filter((t) => t.id !== id).map((t) => ({ ...t, deps: t.deps.filter((d) => d.id !== id) })));
  const overall = tasks.length ? Math.round(rows.reduce((s, r) => s + r.progress * r.duration, 0) / rows.reduce((s, r) => s + r.duration, 0)) : 0;
  const qaDone = qa.filter((q) => q.done).length;

  const saveSchedule = () => {
    const name = scheduleName.trim();
    if (!name) return toast.error(T("Enter a schedule name first.", "আগে শিডিউলের নাম লিখুন।"));
    if (name.length > 80) return toast.error(T("Schedule name must be 80 characters or fewer.", "শিডিউলের নাম সর্বোচ্চ ৮০ অক্ষর হতে পারে।"));
    const existing = savedSchedules.find((s) => s.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    const id = existing?.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `schedule-${Date.now()}`);
    const record: SavedSchedule = { id, name, tasks: JSON.parse(JSON.stringify(tasks)) as Task[], qa: JSON.parse(JSON.stringify(qa)) as QAItem[], start, updatedAt: new Date().toISOString() };
    setSavedSchedules((items) => [record, ...items.filter((s) => s.id !== id)].slice(0, 50));
    setSelectedScheduleId(id);
    toast.success(existing ? T("Saved schedule updated.", "শিডিউল আপডেট হয়েছে।") : T("Schedule saved.", "শিডিউল সংরক্ষণ হয়েছে।"));
  };

  const loadSchedule = () => {
    const record = savedSchedules.find((s) => s.id === selectedScheduleId);
    if (!record) return toast.error(T("Choose a saved schedule first.", "আগে সংরক্ষিত শিডিউল নির্বাচন করুন।"));
    if (!Array.isArray(record.tasks) || !Array.isArray(record.qa) || typeof record.start !== "string") return toast.error(T("This saved schedule is invalid and was not loaded.", "সংরক্ষিত শিডিউলটি সঠিক নয়, লোড করা হয়নি।"));
    setTasks(record.tasks);
    setQa(record.qa);
    setStart(record.start);
    setScheduleName(record.name);
    toast.success(T(`Loaded “${record.name}”.`, `“${record.name}” লোড হয়েছে।`));
  };

  const deleteSchedule = () => {
    const record = savedSchedules.find((s) => s.id === selectedScheduleId);
    if (!record) return toast.error(T("Choose a saved schedule first.", "আগে সংরক্ষিত শিডিউল নির্বাচন করুন।"));
    setSavedSchedules((items) => items.filter((s) => s.id !== record.id));
    setSelectedScheduleId("");
    toast.success(T("Saved schedule deleted.", "সংরক্ষিত শিডিউল মুছে ফেলা হয়েছে।"));
  };

  const exportCsv = () => {
    const head = "WBS,Task,Duration,Start,Finish,Float,Critical,Progress%,Dependencies\n";
    const body = rows.map((r) => [r.wbs, `"${bn ? r.nameBn : r.name}"`, r.duration, date(r.es), date(r.ef), r.float, r.critical ? "Yes" : "No", r.progress,
      `"${r.deps.map((d) => `${tasks.find((t) => t.id === d.id)?.wbs}${d.type}${d.lag ? `+${d.lag}` : ""}`).join("; ")}"`].join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + head + body], { type: "text/csv" })); a.download = "civilos-schedule.csv"; a.click();
  };

  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const nameW = vw < 640 ? 112 : 220;
  const chartW = vw < 640 ? Math.max(160, vw - nameW - 72) : 680;
  const dayW = Math.max(vw < 640 ? 0.8 : 3, Math.min(12, chartW / Math.max(total, 1)));
  const stages = [...new Set(qa.map((q) => q.stage))];

  return (
    <SidebarProvider>
      <SEO title="Project Scheduler — CivilOS AI" description="Construction schedule with WBS, Gantt chart, FS/SS/FF/SF dependencies, critical path and QA/QC checklists." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2"><SidebarTrigger />
              <h1 className="font-heading font-semibold flex items-center gap-2"><CalendarRange className="h-4 w-4 text-accent" /> {T("Project Scheduler", "প্রজেক্ট সময়সূচি")}</h1>
            </div>
            <div className="flex items-center gap-2"><span className="hidden sm:inline text-xs text-muted-foreground">{projectId ? (projectSave.status === "saving" ? T("Saving to project…", "প্রজেক্টে সেভ হচ্ছে…") : projectSave.status === "saved" ? T("Saved to project", "প্রজেক্টে সেভ হয়েছে") : projectSave.status === "error" ? T("Save failed", "সেভ হয়নি") : T("Project linked", "প্রজেক্ট সংযুক্ত")) : T("Personal workspace", "ব্যক্তিগত ওয়ার্কস্পেস")}</span><ThemeToggle /></div>
          </header>
          <main className="p-4 md:p-6 space-y-4 min-w-0">
            {projectLoadError && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{T("Could not load this project schedule: ", "প্রজেক্টের শিডিউল লোড করা যায়নি: ")}{projectLoadError}</div>}
            {projectSave.error && <div className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">{projectSave.error}</div>}
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-accent" /><div><h2 className="font-semibold text-sm">{T("Saved schedule plans", "সংরক্ষিত শিডিউল")}</h2><p className="text-xs text-muted-foreground">{T("Save separate plans for different projects. Saving an existing name updates that plan.", "বিভিন্ন প্রজেক্টের জন্য আলাদা শিডিউল রাখুন। একই নাম দিলে আগেরটি আপডেট হবে।")}</p></div></div>
              <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
                <Input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} maxLength={80} placeholder={T("Schedule name (e.g. Sample Residence)", "শিডিউলের নাম (যেমন: Sample Residence)")} aria-label={T("Schedule name", "শিডিউলের নাম")} />
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedScheduleId} onChange={(e) => { setSelectedScheduleId(e.target.value); const s = savedSchedules.find((x) => x.id === e.target.value); if (s) setScheduleName(s.name); }} aria-label={T("Saved schedule", "সংরক্ষিত শিডিউল")}>
                  <option value="">{T("Choose saved schedule", "সংরক্ষিত শিডিউল বাছুন")}</option>
                  {savedSchedules.map((s) => <option key={s.id} value={s.id}>{s.name} · {new Date(s.updatedAt).toLocaleDateString(bn ? "bn-BD" : "en-GB")}</option>)}
                </select>
                <Button onClick={saveSchedule}><Save className="h-4 w-4 mr-1" />{T("Save plan", "সংরক্ষণ")}</Button>
                <div className="flex gap-2"><Button variant="outline" onClick={loadSchedule} disabled={!selectedScheduleId}><FolderOpen className="h-4 w-4 mr-1" />{T("Load", "লোড")}</Button><Button variant="outline" onClick={deleteSchedule} disabled={!selectedScheduleId} aria-label={T("Delete saved schedule", "সংরক্ষিত শিডিউল মুছুন")}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
              <p className="text-xs text-muted-foreground">{T(`${savedSchedules.length}/50 saved plans · changes to the current schedule are not added to a saved plan until you save again.`, `${savedSchedules.length}/৫০টি সংরক্ষিত শিডিউল · বর্তমান শিডিউলের পরিবর্তন সংরক্ষিত প্ল্যানে যোগ করতে আবার Save করুন।`)}</p>
            </Card>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3"><Label className="text-xs">{T("Start date", "শুরুর তারিখ")}</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 h-9" /></Card>
              <Card className="p-3"><p className="text-xs text-muted-foreground">{T("Total duration", "মোট সময়")}</p><p className="font-heading font-semibold text-lg">{total} {T("days", "দিন")}</p></Card>
              <Card className="p-3"><p className="text-xs text-muted-foreground">{T("Finish date", "শেষের তারিখ")}</p><p className="font-heading font-semibold text-lg">{date(total)}</p></Card>
              <Card className="p-3"><p className="text-xs text-muted-foreground">{T("Overall progress", "মোট অগ্রগতি")}</p><p className="font-heading font-semibold text-lg">{overall}%</p></Card>
            </div>
            {cycle && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{T("Circular dependency found — check task links.", "চক্রাকার নির্ভরতা পাওয়া গেছে — কাজের সংযোগ যাচাই করুন।")}</p>}

            <Tabs defaultValue="gantt">
              <TabsList><TabsTrigger value="gantt">Gantt</TabsTrigger><TabsTrigger value="wbs">{T("Tasks (WBS)", "কাজের তালিকা")}</TabsTrigger><TabsTrigger value="qa">{T("QA/QC", "মান যাচাই")} ({qaDone}/{qa.length})</TabsTrigger></TabsList>

              <TabsContent value="gantt">
                <Card className="p-4 overflow-x-auto">
                  <div className="flex justify-between mb-3 gap-2 flex-wrap">
                    <div className="flex gap-3 text-xs items-center"><span className="inline-block w-3 h-3 rounded-sm bg-destructive" />{T("Critical path", "ক্রিটিক্যাল পাথ")}<span className="inline-block w-3 h-3 rounded-sm bg-primary" />{T("Has float", "সময় হাতে আছে")}</div>
                    <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />CSV / Excel</Button>
                  </div>
                  <div style={{ minWidth: nameW + total * dayW + 8 }}>
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center h-8 border-b border-border/50">
                        <div className="shrink-0 text-xs truncate pr-2" style={{ width: nameW }}><span className="text-muted-foreground mr-1">{r.wbs}</span>{bn ? r.nameBn : r.name}</div>
                        <div className="relative h-full flex-1">
                          <div className={`absolute top-1.5 h-5 rounded ${r.critical ? "bg-destructive/80" : "bg-primary/80"}`} style={{ left: r.es * dayW, width: Math.max(2, r.duration * dayW) }} title={`${date(r.es)} → ${date(r.ef)}`}>
                            <div className="h-full rounded bg-foreground/30" style={{ width: `${r.progress}%` }} />
                          </div>
                          {r.float > 0 && <div className="absolute top-3.5 h-1 bg-muted-foreground/40" style={{ left: r.ef * dayW, width: r.float * dayW }} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="wbs">
                <Card className="p-3 overflow-x-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead><tr className="text-xs text-muted-foreground text-left">
                      <th className="p-1">WBS</th><th className="p-1">{T("Task", "কাজ")}</th><th className="p-1">{T("Days", "দিন")}</th><th className="p-1">{T("Depends on", "নির্ভর করে")}</th><th className="p-1">{T("Start", "শুরু")}</th><th className="p-1">{T("Finish", "শেষ")}</th><th className="p-1">{T("Float", "ফ্লোট")}</th><th className="p-1">%</th><th />
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t align-top">
                          <td className="p-1 w-16"><Input className="h-8" value={r.wbs} onChange={(e) => upd(r.id, { wbs: e.target.value })} /></td>
                          <td className="p-1"><Input className="h-8" value={bn ? r.nameBn : r.name} onChange={(e) => upd(r.id, bn ? { nameBn: e.target.value } : { name: e.target.value })} /></td>
                          <td className="p-1 w-20"><Input className="h-8" type="number" min={0} value={r.duration} onChange={(e) => upd(r.id, { duration: Math.max(0, +e.target.value || 0) })} /></td>
                          <td className="p-1 space-y-1 min-w-[230px]">
                            {r.deps.map((d, i) => (
                              <div key={i} className="flex gap-1">
                                <select className="h-8 rounded border bg-background text-xs px-1 flex-1" value={d.id} onChange={(e) => upd(r.id, { deps: r.deps.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })}>
                                  {tasks.filter((t) => t.id !== r.id).map((t) => <option key={t.id} value={t.id}>{t.wbs} {bn ? t.nameBn : t.name}</option>)}
                                </select>
                                <select className="h-8 rounded border bg-background text-xs px-1" value={d.type} onChange={(e) => upd(r.id, { deps: r.deps.map((x, j) => (j === i ? { ...x, type: e.target.value as DepType } : x)) })}>
                                  {["FS", "SS", "FF", "SF"].map((k) => <option key={k}>{k}</option>)}
                                </select>
                                <Input className="h-8 w-14 text-xs" type="number" value={d.lag} title={T("Lag days", "বিরতি দিন")} onChange={(e) => upd(r.id, { deps: r.deps.map((x, j) => (j === i ? { ...x, lag: +e.target.value || 0 } : x)) })} />
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => upd(r.id, { deps: r.deps.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            ))}
                            {tasks.length > 1 && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => upd(r.id, { deps: [...r.deps, { id: tasks.find((t) => t.id !== r.id)!.id, type: "FS", lag: 0 }] })}><Plus className="h-3 w-3 mr-1" />{T("Link", "সংযোগ")}</Button>}
                          </td>
                          <td className="p-1 text-xs whitespace-nowrap pt-2">{date(r.es)}</td>
                          <td className="p-1 text-xs whitespace-nowrap pt-2">{date(r.ef)}</td>
                          <td className={`p-1 text-xs pt-2 ${r.critical ? "text-destructive font-semibold" : ""}`}>{r.float}</td>
                          <td className="p-1 w-20"><Input className="h-8" type="number" min={0} max={100} value={r.progress} onChange={(e) => upd(r.id, { progress: Math.min(100, Math.max(0, +e.target.value || 0)) })} /></td>
                          <td className="p-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />{T("Add task", "কাজ যোগ")}</Button>
                    <Button size="sm" variant="outline" onClick={() => setTasks(TEMPLATE)}><RotateCcw className="h-4 w-4 mr-1" />{T("Reset to building template", "বাড়ির টেমপ্লেটে ফেরত")}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">FS = {T("finish→start", "শেষ→শুরু")} · SS = {T("start→start", "শুরু→শুরু")} · FF = {T("finish→finish", "শেষ→শেষ")} · SF = {T("start→finish", "শুরু→শেষ")}</p>
                </Card>
              </TabsContent>

              <TabsContent value="qa">
                <div className="grid md:grid-cols-2 gap-4">
                  {stages.map((s) => (
                    <Card key={s} className="p-4 space-y-2">
                      <p className="font-semibold text-sm">{s}</p>
                      {qa.filter((q) => q.stage === s).map((q) => (
                        <div key={q.id} className="space-y-1">
                          <label className="flex items-start gap-2 text-sm">
                            <Checkbox checked={q.done} onCheckedChange={(v) => setQa(qa.map((x) => (x.id === q.id ? { ...x, done: !!v } : x)))} className="mt-0.5" />
                            <span className={q.done ? "line-through text-muted-foreground" : ""}>{bn ? q.bn : q.en}</span>
                          </label>
                          <Input className="h-7 text-xs ml-6 w-[calc(100%-1.5rem)]" placeholder={T("Note / observation", "মন্তব্য")} value={q.note} onChange={(e) => setQa(qa.map((x) => (x.id === q.id ? { ...x, note: e.target.value } : x)))} />
                        </div>
                      ))}
                    </Card>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setQa(QA_TEMPLATE)}><RotateCcw className="h-4 w-4 mr-1" />{T("Reset checklist", "চেকলিস্ট রিসেট")}</Button>
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground">{(user ? T("Saved to your account — available on all your devices.", "আপনার অ্যাকাউন্টে সংরক্ষিত — সব ডিভাইসে দেখা যাবে।") : T("Saved on this device. Sign in to keep it in your account.", "এই ডিভাইসে সংরক্ষিত। অ্যাকাউন্টে রাখতে লগইন করুন।"))}</p>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
