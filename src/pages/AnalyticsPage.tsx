import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BarChart3, Building2, CalendarClock, CheckCircle2, CircleDollarSign, FolderKanban, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";

type ProjectRow = {
  id: string; name: string; client_name: string | null; location: string | null;
  project_type: string | null; status: string | null; budget: number | null;
  start_date: string | null; end_date: string | null; updated_at: string;
};

const statusLabel: Record<string, string> = {
  planning: "Planning", active: "Active", completed: "Completed",
};
const money = (value: number) => new Intl.NumberFormat(undefined, {
  style: "currency", currency: "BDT", maximumFractionDigits: 0,
}).format(value);

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const loadProjects = async (quiet = false) => {
    if (!user) return;
    if (quiet) setRefreshing(true); else setLoading(true);
    setLoadError("");
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,client_name,location,project_type,status,budget,start_date,end_date,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      setLoadError(error.message);
      toast.error("Could not load project analytics");
    } else {
      setProjects((data as ProjectRow[]) || []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { if (user) void loadProjects(); }, [user]);

  const stats = useMemo(() => {
    const active = projects.filter(p => p.status === "active").length;
    const completed = projects.filter(p => p.status === "completed").length;
    const planning = projects.filter(p => !p.status || p.status === "planning").length;
    const budgets = projects.reduce((sum, p) => sum + (typeof p.budget === "number" && Number.isFinite(p.budget) ? p.budget : 0), 0);
    const budgeted = projects.filter(p => typeof p.budget === "number" && Number.isFinite(p.budget)).length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const deadlines = projects.filter(p => p.end_date && new Date(p.end_date + "T00:00:00") >= today && p.status !== "completed")
      .sort((a,b) => (a.end_date || "").localeCompare(b.end_date || "")).slice(0, 6);
    const overdue = projects.filter(p => p.end_date && new Date(p.end_date + "T23:59:59") < new Date() && p.status !== "completed").length;
    const types = new Map<string, number>();
    projects.forEach(p => { const key = p.project_type?.trim() || "Unspecified"; types.set(key, (types.get(key) || 0) + 1); });
    return { active, completed, planning, budgets, budgeted, deadlines, overdue, types: [...types.entries()].sort((a,b) => b[1]-a[1]) };
  }, [projects]);

  const metricCards = [
    { label: "Total projects", value: projects.length.toLocaleString(), icon: FolderKanban, hint: "Projects visible to your account" },
    { label: "Active projects", value: stats.active.toLocaleString(), icon: Building2, hint: "Marked as active" },
    { label: "Completed", value: stats.completed.toLocaleString(), icon: CheckCircle2, hint: "Marked as completed" },
    { label: "Recorded budgets", value: money(stats.budgets), icon: CircleDollarSign, hint: `${stats.budgeted} projects have a budget value` },
  ];

  return (
    <>
      <SEO title="Project Analytics" description="Review your project status, recorded budgets, project types and upcoming deadlines." />
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-muted/30">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6">
              <SidebarTrigger />
              <h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">Project Analytics</h1>
              <NotificationBell />
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={() => void loadProjects(true)} disabled={refreshing || loading}>
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Refresh</span>
              </Button>
            </header>
            <main className="flex-1 p-4 md:p-6 space-y-6 overflow-x-hidden">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Data from your existing CivilOS project records</p>
                  <h2 className="font-heading text-2xl md:text-3xl font-bold">Project overview</h2>
                  <p className="text-sm text-muted-foreground mt-1">Budget totals include only recorded budget values; this page does not estimate actual spending.</p>
                </div>
                <Button asChild><Link to="/projects">View projects</Link></Button>
              </div>

              {loadError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>Could not refresh project data. Showing any previously loaded records. Details: {loadError}</span></div>}

              {loading ? (
                <div className="flex items-center justify-center min-h-48 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading project analytics…</div>
              ) : (
                <>
                  <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {metricCards.map(item => <Card key={item.label}><CardContent className="p-5">
                      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{item.label}</p><item.icon className="h-5 w-5 text-primary" /></div>
                      <p className="mt-3 text-2xl md:text-3xl font-bold break-words">{item.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                    </CardContent></Card>)}
                  </section>

                  <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Project status</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        {[{label:"Planning",value:stats.planning},{label:"Active",value:stats.active},{label:"Completed",value:stats.completed}].map(row => {
                          const pct = projects.length ? Math.round(row.value / projects.length * 100) : 0;
                          return <div key={row.label} className="space-y-1.5">
                            <div className="flex justify-between text-sm"><span>{row.label}</span><span className="text-muted-foreground">{row.value} · {pct}%</span></div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{width:`${pct}%`}} /></div>
                          </div>;
                        })}
                        <p className="text-xs text-muted-foreground">Status counts use the values saved on each project record.</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><FolderKanban className="h-5 w-5" />Project types</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {stats.types.length ? stats.types.slice(0, 8).map(([type,count]) => <div key={type} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{type}</span><Badge variant="secondary">{count}</Badge></div>) : <p className="text-sm text-muted-foreground">No project type data yet.</p>}
                      </CardContent>
                    </Card>
                  </section>

                  <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <Card className="xl:col-span-2">
                      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Upcoming end dates</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {stats.deadlines.length ? stats.deadlines.map(p => {
                          const days = Math.ceil((new Date((p.end_date || "") + "T00:00:00").getTime() - new Date(new Date().setHours(0,0,0,0)).getTime()) / 86400000);
                          return <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b last:border-0 pb-3 last:pb-0">
                            <div className="min-w-0"><Link className="font-medium hover:underline break-words" to={`/projects/${p.id}`}>{p.name}</Link><p className="text-xs text-muted-foreground">{p.client_name || p.location || "Client/location not recorded"}</p></div>
                            <div className="flex items-center gap-2 shrink-0"><Badge variant="outline">{statusLabel[p.status || "planning"] || p.status || "Unknown"}</Badge><span className="text-sm text-muted-foreground">{days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}</span></div>
                          </div>;
                        }) : <p className="text-sm text-muted-foreground">No upcoming end dates recorded for unfinished projects.</p>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Attention</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <div className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">Projects needing deadline review</p><p className="text-2xl font-bold mt-1">{stats.overdue}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">Projects without a recorded budget</p><p className="text-2xl font-bold mt-1">{Math.max(0, projects.length - stats.budgeted)}</p></div>
                        <p className="text-xs text-muted-foreground">These indicators depend on the project dates and budget fields being kept up to date.</p>
                      </CardContent>
                    </Card>
                  </section>
                </>
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}
