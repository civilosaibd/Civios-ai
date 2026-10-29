import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  FolderOpen, Plus, ArrowRight, Sparkles, Calculator, FileText, Hammer,
  Search, Upload, Receipt, Bot, Crown, Activity, HardHat, Compass,
} from "lucide-react";
import SEO from "@/components/SEO";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscription, formatLimit } from "@/lib/subscription";

interface ProjectRow {
  id: string;
  name: string;
  file_name: string | null;
  updated_at: string;
}

const quickActions = [
  { icon: Plus, label: "New Project", detail: "Start a workspace", to: "/upload", tone: "blue" },
  { icon: Calculator, label: "New BOQ", detail: "Quantities & costs", to: "/boq", tone: "orange" },
  { icon: Bot, label: "AI Assistant", detail: "Ask an engineer", to: "/ai-engineer", tone: "violet" },
  { icon: Upload, label: "Upload File", detail: "Analyze a document", to: "/file-assistant", tone: "cyan" },
  { icon: Hammer, label: "Site Report", detail: "Log site progress", to: "/site-diary", tone: "emerald" },
  { icon: Receipt, label: "New Invoice", detail: "Manage billing", to: "/invoices", tone: "amber" },
];

const quickAccess = [
  { icon: Sparkles, name: "AI Engineering Assistant", desc: "Civil engineering guidance in one workspace", to: "/ai-engineer", tone: "violet" },
  { icon: Calculator, name: "BOQ Generator", desc: "Quantities, rates and cost breakdowns", to: "/boq", tone: "orange" },
  { icon: FileText, name: "Tender Analysis", desc: "Review tender documents efficiently", to: "/tender", tone: "blue" },
  { icon: Hammer, name: "Site Diary", desc: "Daily progress and material records", to: "/site-diary", tone: "emerald" },
];

const toneStyles: Record<string, { icon: string; surface: string; border: string }> = {
  blue: { icon: "text-blue-600 dark:text-blue-300", surface: "bg-blue-500/10", border: "hover:border-blue-500/50" },
  orange: { icon: "text-orange-600 dark:text-orange-300", surface: "bg-orange-500/10", border: "hover:border-orange-500/50" },
  violet: { icon: "text-violet-600 dark:text-violet-300", surface: "bg-violet-500/10", border: "hover:border-violet-500/50" },
  cyan: { icon: "text-cyan-600 dark:text-cyan-300", surface: "bg-cyan-500/10", border: "hover:border-cyan-500/50" },
  emerald: { icon: "text-emerald-600 dark:text-emerald-300", surface: "bg-emerald-500/10", border: "hover:border-emerald-500/50" },
  amber: { icon: "text-amber-600 dark:text-amber-300", surface: "bg-amber-500/10", border: "hover:border-amber-500/50" },
};

const DashboardPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState(false);
  const [search, setSearch] = useState("");
  const { plan, activeSub, usage, limitOf, percentUsed } = useSubscription();

  const planUsage = [
    { label: "AI credits", used: usage.ai_credits, limit: limitOf("ai_credits"), pct: percentUsed("ai_credits", "ai_credits"), tone: "bg-violet-500" },
    { label: "Projects", used: usage.projects, limit: limitOf("projects"), pct: percentUsed("projects", "projects"), tone: "bg-blue-500" },
    { label: "Storage", used: Math.round(usage.storage_mb), limit: limitOf("storage_mb"), pct: percentUsed("storage_mb", "storage_mb"), tone: "bg-emerald-500" },
  ];

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const loadProjects = async () => {
      setLoading(true);
      setProjectsError(false);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, file_name, updated_at")
          .order("updated_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!cancelled) setProjects((data as ProjectRow[]) || []);
      } catch {
        if (!cancelled) {
          setProjects([]);
          setProjectsError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadProjects();
    return () => { cancelled = true; };
  }, [user]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Engineer";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Display only real project/usage data; never substitute fabricated analytics.
  const stats = [
    { label: "Recent projects", value: projects.length, hint: "Latest five shown below", icon: FolderOpen, tone: "blue" },
    { label: "Current plan", value: plan?.name || "Free", hint: "Your active workspace plan", icon: Crown, tone: "amber" },
    { label: "AI credits used", value: usage.ai_credits, hint: "Usage recorded for your account", icon: Sparkles, tone: "violet" },
    { label: "Storage used", value: `${Math.round(usage.storage_mb)} MB`, hint: "Current storage consumption", icon: Upload, tone: "emerald" },
  ];

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (query) navigate(`/projects?q=${encodeURIComponent(query)}`);
  };

  return (
    <>
      <SEO title="Dashboard" description="Your CivilOS AI engineering workspace — projects, estimates, usage and engineering tools." />
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-muted/30">
          <DashboardSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-xl md:px-6">
              <SidebarTrigger />
              <form onSubmit={onSearch} role="search" className="relative hidden w-full max-w-lg flex-1 sm:block">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search your projects…"
                  aria-label="Search projects"
                  className="h-9 rounded-xl border-border/70 bg-muted/40 pl-9 focus-visible:bg-background"
                />
              </form>
              <div className="flex-1 sm:hidden" />
              <Button size="sm" variant="outline" asChild className="hidden gap-1.5 rounded-xl md:inline-flex">
                <Link to="/billing"><Crown className="h-3.5 w-3.5 text-amber-500" /> Upgrade</Link>
              </Button>
              <NotificationBell />
              <ThemeToggle />
              <Button size="sm" asChild className="rounded-xl">
                <Link to="/upload"><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">New project</span><span className="sm:hidden">New</span></Link>
              </Button>
            </header>

            <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 overflow-x-hidden p-3 sm:p-5 lg:space-y-7 lg:p-8">
              <section className="relative isolate overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-5 text-white shadow-xl shadow-blue-950/10 sm:p-7 lg:p-9">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:32px_32px]" />
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-1/4 -z-10 h-64 w-64 rounded-full bg-orange-400/15 blur-3xl" />
                <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
                  <div className="max-w-2xl space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-blue-100 backdrop-blur">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.7)]" />
                      <Sparkles className="h-3.5 w-3.5 text-orange-300" /> CivilOS AI Engineering Workspace
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-200">{today}</p>
                      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{greeting}, {displayName} <span aria-hidden="true">👋</span></h1>
                      <p className="max-w-xl text-sm leading-6 text-blue-100/80 sm:text-base">
                        Your projects, quantities, site activities and engineering tools—organized in one workspace.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <Button asChild size="lg" className="rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-950/20 hover:bg-orange-400">
                        <Link to="/upload">Start a project <ArrowRight className="h-4 w-4" /></Link>
                      </Button>
                      <Button asChild size="lg" variant="outline" className="rounded-xl border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                        <Link to="/projects">View projects</Link>
                      </Button>
                    </div>
                  </div>
                  <div className="hidden shrink-0 md:block" aria-hidden="true">
                    <div className="relative flex h-40 w-40 items-center justify-center rounded-[2rem] border border-white/15 bg-white/[0.06] shadow-2xl backdrop-blur">
                      <div className="absolute inset-3 rounded-[1.5rem] border border-dashed border-cyan-200/30" />
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-slate-950 shadow-lg shadow-cyan-950/40">
                        <HardHat className="h-10 w-10" />
                      </div>
                      <Compass className="absolute right-3 top-3 h-5 w-5 text-orange-300" />
                      <Activity className="absolute bottom-4 left-4 h-5 w-5 text-emerald-300" />
                    </div>
                  </div>
                </div>
              </section>

              <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {quickActions.map((action) => {
                  const tone = toneStyles[action.tone];
                  return (
                    <Link key={action.label} to={action.to}
                      className={`group flex min-h-28 flex-col justify-between rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-4 ${tone.border}`}>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${tone.surface}`}>
                        <action.icon className={`h-5 w-5 ${tone.icon}`} />
                      </span>
                      <span className="mt-3 block">
                        <span className="block text-sm font-semibold leading-tight">{action.label}</span>
                        <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{action.detail}</span>
                      </span>
                    </Link>
                  );
                })}
              </section>

              <section aria-label="Workspace overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {stats.map((stat) => {
                  const tone = toneStyles[stat.tone];
                  return (
                    <article key={stat.label} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5">
                      <div aria-hidden="true" className={`absolute -right-5 -top-5 h-20 w-20 rounded-full opacity-70 blur-2xl ${tone.surface}`} />
                      <div className="relative flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground sm:text-sm">{stat.label}</p>
                          <p className="mt-3 break-words text-2xl font-bold tracking-tight sm:text-3xl">{stat.value}</p>
                        </div>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.surface}`}>
                          <stat.icon className={`h-5 w-5 ${tone.icon}`} />
                        </span>
                      </div>
                      <p className="relative mt-3 text-[11px] leading-4 text-muted-foreground">{stat.hint}</p>
                    </article>
                  );
                })}
              </section>

              <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                <div className="flex flex-col justify-between gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:p-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10"><Crown className="h-4.5 w-4.5 text-amber-500" /></span>
                      <div>
                        <h2 className="font-semibold">Plan & usage</h2>
                        <p className="text-xs text-muted-foreground">Track your current workspace allowance</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xl font-bold">{plan?.name || "Free"} <span className="text-sm font-normal text-muted-foreground">plan</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activeSub?.renewal_date
                        ? `Renews ${new Date(activeSub.renewal_date).toLocaleDateString()}`
                        : "Free plan — explore upgrades whenever you need more capacity."}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" asChild className="rounded-xl self-start sm:self-center">
                    <Link to="/billing">Manage plan <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
                <div className="grid gap-5 p-4 sm:grid-cols-3 sm:p-5">
                  {planUsage.map((item) => {
                    const pct = Number.isFinite(item.pct) ? Math.max(0, Math.min(100, item.pct)) : 0;
                    return (
                      <div key={item.label} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium">{item.label}</span>
                          <span className="tabular-nums text-muted-foreground">{item.used}{item.label === "Storage" ? " MB" : ""} / {formatLimit(item.limit)}</span>
                        </div>
                        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full transition-[width] duration-500 ${item.tone}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>{pct >= 85 ? "Almost at limit" : "Usage"}</span>
                          <span>{Math.round(pct)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {planUsage.some((item) => Number.isFinite(item.pct) && item.pct >= 85) && (
                  <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 sm:px-5">
                    You are approaching a usage limit. <Link to="/billing" className="font-semibold underline underline-offset-4">Review available plans</Link>.
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4 sm:p-5">
                  <div>
                    <h2 className="text-base font-semibold sm:text-lg">Recent projects</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Continue working on your latest engineering files.</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="rounded-xl">
                    <Link to="/projects">All projects <ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </div>
                <div className="p-4 sm:p-5">
                  {loading ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading recent projects" aria-busy="true">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="space-y-3 rounded-xl border bg-background p-4">
                          <Skeleton className="h-10 w-10 rounded-xl" />
                          <Skeleton className="h-4 w-2/3" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      ))}
                    </div>
                  ) : projectsError ? (
                    <div role="status" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-8 text-center">
                      <p className="font-medium">Projects could not be loaded</p>
                      <p className="mt-1 text-sm text-muted-foreground">Check your connection and try opening your project list.</p>
                      <Button size="sm" variant="outline" asChild className="mt-4 rounded-xl"><Link to="/projects">Open projects</Link></Button>
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-10 text-center">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10"><FolderOpen className="h-6 w-6 text-blue-500" /></span>
                      <p className="mt-4 font-semibold">Your first project starts here</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Create a project to organize drawings, estimates and engineering documents in one place.</p>
                      <Button size="sm" asChild className="mt-4 rounded-xl"><Link to="/upload"><Plus className="h-4 w-4" /> Create project</Link></Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {projects.map((project) => (
                        <Link key={project.id} to={`/projects/${project.id}`}
                          className="group rounded-xl border border-border/70 bg-background p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 transition-transform group-hover:scale-105 dark:text-blue-300"><FolderOpen className="h-5 w-5" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{project.name}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">{project.file_name || "Project workspace"}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                          </div>
                          <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                            Updated {project.updated_at ? new Date(project.updated_at).toLocaleDateString() : "Date unavailable"}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold sm:text-lg">Engineering tools</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Jump straight into a frequently used CivilOS AI workflow.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {quickAccess.map((module) => {
                    const tone = toneStyles[module.tone];
                    return (
                      <Link key={module.name} to={module.to}
                        className={`group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tone.border}`}>
                        <div className="flex items-start justify-between gap-3">
                          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone.surface}`}><module.icon className={`h-5 w-5 ${tone.icon}`} /></span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                        </div>
                        <h3 className="mt-4 text-sm font-semibold">{module.name}</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{module.desc}</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
              <footer className="pb-2 pt-1 text-center text-[11px] text-muted-foreground">
                CivilOS AI · Your engineering work, in one place.
              </footer>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default DashboardPage;
