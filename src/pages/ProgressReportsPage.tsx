import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarRange, Download, FileBarChart, Loader2, Printer, RefreshCw, TriangleAlert, Users, Package } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { toast } from "sonner";

type SiteLog = {
  id: string; log_date: string; weather: string | null; activities: string | null; issues: string | null;
  manpower: { role: string; count: number }[] | null; materials: { name: string; qty: string }[] | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const csvCell = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';

export default function ProgressReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);

  const load = async () => {
    if (!user) return;
    if (from > to) { toast.error("Start date must be on or before end date."); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from("site_logs")
      .select("id,log_date,weather,activities,issues,manpower,materials")
      .eq("user_id", user.id).gte("log_date", from).lte("log_date", to)
      .order("log_date", { ascending: true }).limit(1000);
    if (queryError) {
      setError("Could not load site diary data. Check your connection and database permissions.");
      toast.error("Could not load progress data.");
    } else {
      setLogs((data ?? []) as unknown as SiteLog[]);
      setLoaded(true);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const summary = useMemo(() => {
    const manpower = logs.reduce((sum, log) => sum + (log.manpower ?? []).reduce((s, m) => s + Math.max(0, Number(m.count) || 0), 0), 0);
    const materials = logs.reduce((sum, log) => sum + (log.materials ?? []).filter(m => m.name && m.qty).length, 0);
    const issueLogs = logs.filter(log => Boolean(log.issues?.trim()));
    const uniqueDates = new Set(logs.map(log => log.log_date)).size;
    return { manpower, materials, issueLogs, uniqueDates };
  }, [logs]);

  const reportText = useMemo(() => [
    "CIVILOS AI — SITE PROGRESS REPORT",
    `Reporting period: ${from} to ${to}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "SUMMARY",
    `Site diary entries: ${logs.length}`,
    `Days with entries: ${summary.uniqueDates}`,
    `Recorded manpower total (sum of daily counts): ${summary.manpower}`,
    `Material line items recorded: ${summary.materials}`,
    `Entries with reported issues/delays: ${summary.issueLogs.length}`,
    "",
    "DAILY LOGS",
    ...logs.map(log => [
      `${log.log_date} | Weather: ${log.weather || "Not recorded"}`,
      `Activities: ${log.activities || "Not recorded"}`,
      `Issues / delays: ${log.issues || "None recorded"}`,
      `Manpower: ${(log.manpower ?? []).map(m => `${m.role}: ${m.count}`).join("; ") || "None recorded"}`,
      `Materials: ${(log.materials ?? []).map(m => `${m.name}: ${m.qty}`).join("; ") || "None recorded"}`,
      ""
    ].join("\n"))
  ].join("\n"), [from, to, logs, summary]);

  const downloadCsv = () => {
    const rows = [
      ["Date", "Weather", "Activities", "Issues / Delays", "Manpower", "Materials"],
      ...logs.map(log => [
        log.log_date, log.weather ?? "", log.activities ?? "", log.issues ?? "",
        (log.manpower ?? []).map(m => `${m.role}: ${m.count}`).join("; "),
        (log.materials ?? []).map(m => `${m.name}: ${m.qty}`).join("; ")
      ])
    ];
    const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `civilos-progress-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success("CSV report downloaded.");
  };

  const downloadTxt = () => {
    const url = URL.createObjectURL(new Blob([reportText], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `civilos-progress-${from}-to-${to}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success("Text report downloaded.");
  };

  return (
    <SidebarProvider>
      <SEO title="Progress Reports — CivilOS AI" description="Summarize your site diary by date and export project progress records." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
            <div className="flex items-center gap-2"><SidebarTrigger /><FileBarChart className="h-4 w-4 text-accent" /><h1 className="font-heading font-semibold">Progress Reports</h1></div>
            <ThemeToggle />
          </header>
          <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
            <div><p className="text-sm text-muted-foreground">Build a date-scoped report from your saved Site Diary entries.</p><h2 className="mt-1 text-2xl font-bold">Site progress overview</h2></div>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5" /> Reporting period</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1"><Label htmlFor="progress-from">From</Label><Input id="progress-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></div>
                <div className="flex-1 space-y-1"><Label htmlFor="progress-to">To</Label><Input id="progress-to" type="date" value={to} min={from} max={today()} onChange={e => setTo(e.target.value)} /></div>
                <Button onClick={() => void load()} disabled={loading || !user}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh report</Button>
              </CardContent>
            </Card>
            {error && <Card className="border-destructive/40 p-4 text-sm text-destructive"><TriangleAlert className="mr-2 inline h-4 w-4" />{error}</Card>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4"><p className="text-sm text-muted-foreground">Diary entries</p><p className="mt-1 text-3xl font-bold">{logs.length}</p></Card>
              <Card className="p-4"><p className="text-sm text-muted-foreground">Days recorded</p><p className="mt-1 text-3xl font-bold">{summary.uniqueDates}</p></Card>
              <Card className="p-4"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Manpower count sum</p><p className="mt-1 text-3xl font-bold">{summary.manpower}</p><p className="text-xs text-muted-foreground">Sum of daily counts, not unique workers</p></Card>
              <Card className="p-4"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Package className="h-4 w-4" /> Material line items</p><p className="mt-1 text-3xl font-bold">{summary.materials}</p></Card>
            </div>
            <Card><CardHeader><CardTitle>Issues and delays</CardTitle></CardHeader><CardContent>
              {summary.issueLogs.length ? <div className="space-y-2">{summary.issueLogs.map(log => <div key={log.id} className="rounded-lg border p-3"><p className="text-sm font-semibold">{log.log_date}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{log.issues}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No issues or delays recorded for this period.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Daily activity records</CardTitle></CardHeader><CardContent>
              {!loaded && loading ? <p className="text-sm text-muted-foreground">Loading site diary…</p> : logs.length === 0 ? <div className="space-y-3 text-sm text-muted-foreground"><p>No Site Diary entries found for this period.</p><Button asChild variant="outline"><Link to="/site-diary">Open Site Diary</Link></Button></div> : <div className="space-y-3">{logs.map(log => <div key={log.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{log.log_date}</p><span className="text-xs text-muted-foreground">{log.weather || "Weather not recorded"}</span></div>{log.activities && <p className="mt-2 whitespace-pre-wrap text-sm">{log.activities}</p>}{log.issues && <p className="mt-2 whitespace-pre-wrap text-sm text-destructive">Issue: {log.issues}</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Manpower: {(log.manpower ?? []).map(m => `${m.role} ${m.count}`).join(", ") || "—"}</span><span>Materials: {(log.materials ?? []).map(m => `${m.name} ${m.qty}`).join(", ") || "—"}</span></div></div>)}</div>}
            </CardContent></Card>
            <div className="flex flex-wrap gap-2"><Button onClick={downloadCsv} disabled={!logs.length}><Download className="mr-2 h-4 w-4" />Export CSV</Button><Button variant="outline" onClick={downloadTxt} disabled={!logs.length}><Download className="mr-2 h-4 w-4" />Download report TXT</Button><Button variant="outline" onClick={() => window.print()} disabled={!logs.length}><Printer className="mr-2 h-4 w-4" />Print / Save PDF</Button></div>
            <p className="text-xs text-muted-foreground">This report summarizes entries recorded in Site Diary only. Missing records are not interpreted as completed work; verify progress with the site team before using it for contractual or payment decisions.</p>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
