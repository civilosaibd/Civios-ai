import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, BrainCircuit, CalendarClock, CheckCircle2, ClipboardList, Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";

type Project = {
  id: string;
  name: string;
  project_type: string | null;
  status: string | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  updated_at: string;
};

type InsightResult = {
  summary: string;
  insights: { title: string; priority: "high" | "medium" | "low"; detail: string; action: string }[];
  next_steps: string[];
  caveats: string[];
};

const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

function fallbackInsights(projects: Project[]): InsightResult {
  const now = today();
  const overdue = projects.filter((p) => p.end_date && new Date(p.end_date + "T23:59:59") < new Date() && p.status !== "completed");
  const missingBudget = projects.filter((p) => p.budget == null || !Number.isFinite(Number(p.budget)));
  const noEndDate = projects.filter((p) => !p.end_date && p.status !== "completed");
  const active = projects.filter((p) => p.status === "active").length;
  const upcoming = projects.filter((p) => p.end_date && new Date(p.end_date + "T00:00:00") >= now && p.status !== "completed");
  const insights: InsightResult["insights"] = [];
  if (overdue.length) insights.push({ title: "Review overdue projects", priority: "high", detail: `${overdue.length} unfinished project(s) have an end date in the past.`, action: "Open each project, confirm its real status and revise the end date or recovery plan." });
  if (missingBudget.length) insights.push({ title: "Complete project budget records", priority: "medium", detail: `${missingBudget.length} project(s) have no numeric budget recorded.`, action: "Add an approved budget where available; do not treat missing values as zero cost." });
  if (noEndDate.length) insights.push({ title: "Add target completion dates", priority: "medium", detail: `${noEndDate.length} unfinished project(s) have no end date.`, action: "Agree a realistic target date and keep the schedule updated." });
  if (upcoming.length) insights.push({ title: "Check upcoming deadlines", priority: "medium", detail: `${upcoming.length} unfinished project(s) have upcoming end dates.`, action: "Review progress, dependencies, material availability and workforce before each deadline." });
  if (!insights.length) insights.push({ title: "Keep project records current", priority: "low", detail: "No obvious date or budget gaps were detected in the available records.", action: "Update project status and budget fields regularly; this is a record-quality check, not a project audit." });
  return {
    summary: `Reviewed ${projects.length} project record(s). ${active} are marked active. These observations are calculated from saved status, budget and date fields only; they do not measure actual site progress, cash flow or structural safety.`,
    insights,
    next_steps: ["Verify flagged dates and statuses with the responsible site/project team.", "Update missing budget and schedule fields from approved project documents.", "Refresh this page after records have been updated."],
    caveats: ["This fallback is rule-based because AI analysis was unavailable or has not been run.", "A missing budget is not a zero budget; recorded budget is not actual expenditure."],
  };
}

function normalizeResult(value: unknown): InsightResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<InsightResult>;
  if (typeof v.summary !== "string" || !Array.isArray(v.insights) || !Array.isArray(v.next_steps)) return null;
  return {
    summary: v.summary,
    insights: v.insights.filter((x) => x && typeof x.title === "string" && typeof x.detail === "string" && typeof x.action === "string")
      .map((x) => ({ title: x.title, detail: x.detail, action: x.action, priority: x.priority === "high" || x.priority === "medium" ? x.priority : "low" })),
    next_steps: v.next_steps.filter((x): x is string => typeof x === "string"),
    caveats: Array.isArray(v.caveats) ? v.caveats.filter((x): x is string => typeof x === "string") : [],
  };
}

export default function AIInsightsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InsightResult | null>(null);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const loadProjects = async (quiet = false) => {
    if (!user) return;
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("projects")
      .select("id,name,project_type,status,budget,start_date,end_date,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (queryError) {
      setError(queryError.message);
      toast.error("Could not load project records");
    } else {
      const rows = (data || []) as Project[];
      setProjects(rows);
      setResult(fallbackInsights(rows));
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { if (user) void loadProjects(); }, [user]);

  const stats = useMemo(() => {
    const now = today();
    return {
      total: projects.length,
      active: projects.filter((p) => p.status === "active").length,
      completed: projects.filter((p) => p.status === "completed").length,
      overdue: projects.filter((p) => p.end_date && new Date(p.end_date + "T23:59:59") < new Date() && p.status !== "completed").length,
      upcoming: projects.filter((p) => p.end_date && new Date(p.end_date + "T00:00:00") >= now && p.status !== "completed").length,
    };
  }, [projects]);

  const analyze = async () => {
    if (!projects.length) {
      toast.error("There are no project records to analyze yet.");
      return;
    }
    setAnalyzing(true);
    setError("");
    try {
      // Send only project-level fields needed for analysis; client names and locations are excluded.
      const compact = projects.map(({ name, project_type, status, budget, start_date, end_date }) => ({
        name, type: project_type, status, budget, start_date, end_date,
      }));
      const { data, error: functionError } = await supabase.functions.invoke("ai-structured", {
        body: {
          mode: "insights",
          input: JSON.stringify({
            question: question.trim() || "Identify the most useful project-management insights and next actions.",
            as_of_date: new Date().toISOString().slice(0, 10),
            projects: compact,
          }),
        },
      });
      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);
      const normalized = normalizeResult(data?.result);
      if (!normalized) throw new Error("The AI response was incomplete. Showing rule-based insights instead.");
      setResult(normalized);
      toast.success("Project insights generated");
    } catch (e) {
      setResult(fallbackInsights(projects));
      const message = e instanceof Error ? e.message : "AI analysis is unavailable";
      setError(`AI analysis could not be completed: ${message}. Rule-based insights are shown instead.`);
      toast.error("Showing rule-based insights");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <SidebarProvider>
      <SEO title="AI Project Insights — CivilOS AI" description="Generate grounded project-management insights from saved CivilOS project records." url="/ai-insights" />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <main className="flex-1 min-w-0">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <SidebarTrigger />
            <BrainCircuit className="h-5 w-5 text-primary" />
            <div className="flex-1"><h1 className="font-heading font-bold leading-tight">AI Project Insights</h1><p className="text-xs text-muted-foreground">Evidence-based project review</p></div>
            <NotificationBell />
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => void loadProjects(true)} disabled={loading || refreshing || analyzing}>
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh
            </Button>
          </header>
          <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
            <div>
              <p className="text-sm text-muted-foreground">Insights use your saved project records, not live site sensors or external financial data.</p>
              <h2 className="mt-1 font-heading text-2xl md:text-3xl font-bold">Turn project records into next actions</h2>
              <p className="mt-2 text-sm text-muted-foreground">AI output is advisory. Verify dates, costs, contracts and engineering decisions against approved project documents.</p>
            </div>

            {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

            {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading project records…</div> : <>
              <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                {[
                  { label: "Projects", value: stats.total, icon: ClipboardList },
                  { label: "Active", value: stats.active, icon: TrendingUp },
                  { label: "Completed", value: stats.completed, icon: CheckCircle2 },
                  { label: "Overdue", value: stats.overdue, icon: AlertTriangle },
                  { label: "Upcoming dates", value: stats.upcoming, icon: CalendarClock },
                ].map((item) => <Card key={item.label}><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{item.label}</p><item.icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-2xl font-bold">{item.value}</p></CardContent></Card>)}
              </section>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Ask about your project portfolio</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} rows={2} placeholder="Optional: e.g. Which project records need attention first?" />
                  <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-xs text-muted-foreground">When you click Analyze, only project name, type, status, budget and dates are sent to the configured AI service. Client names and locations are excluded.</p><Button onClick={() => void analyze()} disabled={analyzing || loading || projects.length === 0}>{analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing…</> : <><Sparkles className="mr-2 h-4 w-4" />Analyze projects</>}</Button></div>
                </CardContent>
              </Card>

              {result && <div className="space-y-4">
                <Card><CardHeader><CardTitle>Portfolio summary</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-6">{result.summary}</p></CardContent></Card>
                <div className="grid gap-4 lg:grid-cols-2">
                  {result.insights.map((insight, index) => <Card key={`${insight.title}-${index}`}><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{insight.title}</CardTitle><Badge variant={insight.priority === "high" ? "destructive" : insight.priority === "medium" ? "secondary" : "outline"}>{insight.priority} priority</Badge></div></CardHeader><CardContent className="space-y-2"><p className="text-sm">{insight.detail}</p><div className="rounded-md bg-muted p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested action</p><p className="mt-1 text-sm">{insight.action}</p></div></CardContent></Card>)}
                </div>
                <Card><CardHeader><CardTitle>Recommended next steps</CardTitle></CardHeader><CardContent><ol className="list-decimal space-y-2 pl-5 text-sm">{result.next_steps.map((step, index) => <li key={index}>{step}</li>)}</ol>{result.caveats.length > 0 && <div className="mt-4 border-t pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limitations</p><ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{result.caveats.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</CardContent></Card>
              </div>}

              {projects.length === 0 && <Card><CardContent className="space-y-3 p-6 text-center"><p className="font-medium">No project records found</p><p className="text-sm text-muted-foreground">Create a project first to generate portfolio insights.</p><Button asChild><Link to="/projects">Open projects</Link></Button></CardContent></Card>}
            </>}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
