import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileBarChart, Download, Printer, AlertTriangle } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { MAX_NOTES, MAX_TITLE, SECTION_IDS, SECTION_LABELS, availability, buildReport, normalizeWorkspace, type ProjectLike, type SectionId } from "@/lib/reportBuilder";
import { renderReportHtml } from "@/lib/reportHtml";
import { hasNonLatin } from "@/lib/reportPdf";

type ProjectRow = ProjectLike & { id: string };
const WS_KEYS = ["civilos.schedule", "civilos.qa", "civilos.defects", "civilos.finance"];
const NONE = "__none__";

export default function ReportsPage() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const bn = lang === "bn";
  const L = (en: string, b: string) => (bn ? b : en);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [ws, setWs] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);
  const [projectId, setProjectId] = useState(NONE);
  const [title, setTitle] = useState("Project Report");
  const [company, setCompany] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Record<SectionId, boolean>>(() => Object.fromEntries(SECTION_IDS.map((s) => [s, true])) as Record<SectionId, boolean>);
  const frame = useRef<HTMLIFrameElement>(null);

  // READ-ONLY: this page never writes to the account.
  useEffect(() => {
    if (!user) return;
    let off = false;
    (async () => {
      const [p, w] = await Promise.all([
        supabase.from("projects").select("id,name,client_name,location,project_type,status,start_date,end_date,budget,estimate").order("created_at", { ascending: false }).limit(200),
        supabase.from("user_workspace").select("key,value").eq("user_id", user.id).in("key", WS_KEYS),
      ]);
      if (off) return;
      if (p.error || w.error) toast.error(L("Could not load your data", "ডেটা লোড করা যায়নি"));
      setProjects((p.data ?? []) as unknown as ProjectRow[]);
      const map: Record<string, unknown> = {};
      for (const r of w.data ?? []) {
        let v: unknown = r.value;
        if (localStorage.getItem(`${r.key}:unsaved`) === user.id) { try { const raw = localStorage.getItem(r.key); if (raw) v = JSON.parse(raw); } catch { /* keep server copy */ } }
        map[r.key] = v;
      }
      setWs(map); setReady(true);
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const project = useMemo(() => projects.find((x) => x.id === projectId) ?? null, [projects, projectId]);
  const data = useMemo(() => normalizeWorkspace(ws), [ws]);
  const av = useMemo(() => availability({ project, ...data }), [project, data]);
  const sections = SECTION_IDS.filter((s) => picked[s] && av[s].ok);

  const { model, html, error } = useMemo(() => {
    try {
      const m = buildReport({ title, company, preparedBy, notes, project, ...data, sections: SECTION_IDS.filter((s) => picked[s]) });
      return { model: m, html: renderReportHtml(m), error: "" };
    } catch (e) { return { model: null, html: "", error: e instanceof Error ? e.message : "error" }; }
  }, [title, company, preparedBy, notes, project, data, picked]);

  const downloadPdf = async () => {
    if (!model) return;
    try {
      const { renderReportPdf } = await import("@/lib/reportPdf");
      const doc = renderReportPdf(model);
      doc.save(`${(model.projectName || model.title).replace(/[^\w-]+/g, "_").slice(0, 60) || "report"}-${model.generated}.pdf`);
      toast.success(L("PDF downloaded", "PDF ডাউনলোড হয়েছে"));
    } catch { toast.error(L("Could not create the PDF", "PDF তৈরি করা যায়নি")); }
  };
  const printIt = () => { const w = frame.current?.contentWindow; if (w) { w.focus(); w.print(); } };

  const nonLatin = model ? hasNonLatin(model) : false;

  return (
    <SidebarProvider>
      <SEO title="Report Builder — CivilOS AI" description="Build a professional project report (PDF) from your estimate, schedule, QA/QC, defects and finance data." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2"><SidebarTrigger />
              <h1 className="font-heading font-semibold flex items-center gap-2"><FileBarChart className="h-4 w-4 text-accent" /> {L("Report Builder", "রিপোর্ট বিল্ডার")}</h1>
            </div>
            <ThemeToggle />
          </header>
          {!loading && !user ? (
            <main className="p-6"><Card className="p-6 space-y-3 max-w-md"><p>{L("Sign in to build reports from your projects and saved data.", "প্রজেক্ট ও সেভ করা ডেটা থেকে রিপোর্ট বানাতে সাইন ইন করুন।")}</p><Button asChild><Link to="/auth">{L("Sign in", "সাইন ইন")}</Link></Button></Card></main>
          ) : (
            <main className="p-4 md:p-6 grid lg:grid-cols-[360px_minmax(0,1fr)] gap-5">
              <div className="space-y-4 min-w-0">
                <Card className="p-4 space-y-3">
                  <div className="space-y-1"><Label className="text-xs">{L("Project", "প্রজেক্ট")}</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger aria-label={L("Project", "প্রজেক্ট")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{L("No project (saved tools only)", "প্রজেক্ট ছাড়া (সেভ করা টুল)")}</SelectItem>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">{L("Report title", "রিপোর্টের শিরোনাম")}</Label><Input value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">{L("Company", "কোম্পানি")}</Label><Input value={company} maxLength={100} onChange={(e) => setCompany(e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">{L("Prepared by", "প্রস্তুতকারক")}</Label><Input value={preparedBy} maxLength={100} onChange={(e) => setPreparedBy(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">{L("Notes (shown in the summary)", "নোট (সারসংক্ষেপে দেখাবে)")}</Label><Textarea rows={3} value={notes} maxLength={MAX_NOTES} onChange={(e) => setNotes(e.target.value)} /></div>
                </Card>

                <Card className="p-4 space-y-2" data-testid="section-list">
                  <p className="text-sm font-semibold">{L("Sections", "সেকশন")}</p>
                  {!ready && <p className="text-xs text-muted-foreground">{L("Loading your data…", "ডেটা লোড হচ্ছে…")}</p>}
                  {SECTION_IDS.map((s) => (
                    <label key={s} className={`flex items-start gap-2 text-sm ${av[s].ok ? "" : "opacity-60"}`}>
                      <Checkbox className="mt-0.5" checked={picked[s] && av[s].ok} disabled={!av[s].ok} onCheckedChange={(v) => setPicked((p) => ({ ...p, [s]: v === true }))} />
                      <span>{bn ? SECTION_LABELS[s].bn : SECTION_LABELS[s].en}{!av[s].ok && <span className="block text-xs text-muted-foreground">{av[s].reason}</span>}</span>
                    </label>
                  ))}
                </Card>

                <Card className="p-4 space-y-2">
                  <Button className="w-full" onClick={downloadPdf} disabled={!model || sections.length === 0}><Download className="h-4 w-4 mr-2" />{L("Download PDF (English)", "PDF ডাউনলোড (ইংরেজি)")}</Button>
                  <Button className="w-full" variant="outline" onClick={printIt} disabled={!model || sections.length === 0}><Printer className="h-4 w-4 mr-2" />{L("Print / Save as PDF (supports Bengali)", "প্রিন্ট / PDF সেভ (বাংলা সহ)")}</Button>
                  {nonLatin && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" />
                      {L("Your text has non-English characters. The downloaded PDF shows them as “?”. Use Print / Save as PDF to keep Bengali text.", "আপনার লেখায় বাংলা অক্ষর আছে। ডাউনলোড করা PDF-এ সেগুলো “?” দেখাবে। বাংলা রাখতে প্রিন্ট / PDF সেভ ব্যবহার করুন।")}</p>
                  )}
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </Card>
              </div>

              <Card className="p-0 overflow-hidden min-w-0">
                <p className="text-xs text-muted-foreground px-4 pt-3">{L("Preview", "প্রিভিউ")}</p>
                <iframe ref={frame} title={L("Report preview", "রিপোর্ট প্রিভিউ")} data-testid="report-preview" srcDoc={html} sandbox="allow-same-origin allow-modals" className="w-full h-[70vh] bg-white border-0" />
              </Card>
            </main>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
