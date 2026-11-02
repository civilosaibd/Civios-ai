import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Activity, Cpu, Search, Download, RefreshCw, ShieldAlert, FolderKanban, FileSpreadsheet, FileText, HardDrive } from "lucide-react";

type UsageRow = {
  id: string; user_id: string; period: string; ai_credits: number; projects: number;
  boq_generations: number; bbs_generations: number; drawings: number; reports: number;
  storage_mb: number; created_at: string; updated_at: string;
  owner_name?: string | null; owner_email?: string | null;
};

const number = (value: number) => new Intl.NumberFormat().format(Number(value || 0));
const storage = (value: number) => value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${number(value)} MB`;

export default function AdminAIUsagePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !user) navigate("/auth?redirect=/admin/usage"); }, [user, authLoading, navigate]);

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-ai-usage-data", {
      body: { action: "list", page: nextPage, period, search },
    });
    if (error || data?.error) {
      if (data?.error?.includes("Admin access")) setIsAdmin(false);
      else toast.error(data?.error || "Unable to load AI usage. Check the admin-ai-usage-data Edge Function deployment.");
      setRows([]); setTotal(0); setHasMore(false);
    } else {
      setIsAdmin(true); setRows(data?.rows || []); setTotal(data?.total || 0);
      setHasMore(!!data?.has_more); setPage(nextPage);
    }
    setLoading(false);
  }, [period, search]);

  useEffect(() => { if (user) void load(1); }, [user, period, search, load]);

  const applySearch = () => { setSearch(searchInput.trim()); setPage(1); };
  const exportCsv = () => {
    const columns = ["user_id","owner_name","owner_email","period","ai_credits","projects","boq_generations","bbs_generations","drawings","reports","storage_mb","updated_at"];
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [columns.join(","), ...rows.map((row) => columns.map((key) => quote((row as any)[key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `civilos-ai-usage-${period || "all"}-page-${page}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const sum = (key: keyof UsageRow) => rows.reduce((totalValue, row) => totalValue + Number(row[key] || 0), 0);

  return (
    <>
      <SEO title="Admin · AI Usage Analytics" description="Inspect monthly AI and feature quota counters." />
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-muted/30">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6">
              <SidebarTrigger /><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">AI Usage Analytics</h1>
              <Button variant="ghost" size="icon" onClick={() => void load(page)} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <NotificationBell /><ThemeToggle />
            </header>
            <main className="flex-1 p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">
              {loading && isAdmin === null ? <><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></>
                : isAdmin === false ? <div className="rounded-xl border bg-card p-10 text-center space-y-2"><ShieldAlert className="h-9 w-9 mx-auto text-muted-foreground/50" /><p className="font-medium text-sm">Admin access required</p></div>
                : <>
                  <div className="rounded-xl border bg-card p-4 flex gap-3 items-start"><Activity className="h-5 w-5 mt-0.5 text-primary" /><div><p className="font-medium text-sm">Usage counters, not API-cost telemetry</p><p className="text-xs text-muted-foreground mt-1">These are monthly quota counters stored in usage_records. They do not represent model tokens, OpenRouter spend, latency, or provider-level costs.</p></div></div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Matching user-period records</p><p className="text-2xl font-semibold">{number(total)}</p></div>
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">AI credits · current page</p><p className="text-2xl font-semibold">{number(sum("ai_credits"))}</p></div>
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">BOQ + BBS · current page</p><p className="text-2xl font-semibold">{number(sum("boq_generations") + sum("bbs_generations"))}</p></div>
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Drawing + report runs · current page</p><p className="text-2xl font-semibold">{number(sum("drawings") + sum("reports"))}</p></div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="sm:w-48" />
                    <div className="flex flex-1 gap-2"><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }} placeholder="Search by exact user UUID" /><Button variant="outline" onClick={applySearch}><Search className="h-4 w-4" /></Button></div>
                    <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4 mr-1" />Export page CSV</Button>
                  </div>
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center gap-2"><div><h2 className="font-semibold">Monthly usage records</h2><p className="text-xs text-muted-foreground">Server-side pagination · 25 rows per page</p></div><Badge variant="outline">{number(total)} records</Badge></div>
                    {loading ? <div className="p-4 space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                      : rows.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground"><Cpu className="h-8 w-8 mx-auto mb-2 opacity-40" />No usage records found for this filter.</div>
                      : <div className="divide-y">{rows.map((row) => <article key={row.id} className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-sm">{row.owner_name || "User"} <Badge variant="secondary" className="ml-2">{row.period}</Badge></p><p className="text-xs text-muted-foreground break-all">{row.owner_email || row.user_id}</p></div><p className="text-xs text-muted-foreground">Updated {new Date(row.updated_at).toLocaleString()}</p></div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                          <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">AI Credits</p><p className="font-semibold">{number(row.ai_credits)}</p></div>
                          <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">Projects</p><p className="font-semibold">{number(row.projects)}</p></div>
                          <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">BOQ</p><p className="font-semibold">{number(row.boq_generations)}</p></div>
                          <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">BBS</p><p className="font-semibold">{number(row.bbs_generations)}</p></div>
                          <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">Drawings</p><p className="font-semibold">{number(row.drawings)}</p></div>
                          <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">Reports</p><p className="font-semibold">{number(row.reports)}</p></div>
                          <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">Storage</p><p className="font-semibold">{storage(row.storage_mb)}</p></div>
                        </div>
                        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">User and record identifiers</summary><p className="mt-1 break-all">User: {row.user_id}<br />Record: {row.id}</p></details>
                      </article>)}</div>}
                    <div className="p-3 border-t flex justify-between items-center gap-2"><p className="text-xs text-muted-foreground">Showing {rows.length ? (page - 1) * 25 + 1 : 0}–{(page - 1) * 25 + rows.length} of {total}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={!hasMore || loading} onClick={() => void load(page + 1)}>Next</Button></div></div>
                  </div>
                </>}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}
