import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Download, ShieldAlert, ShieldCheck, ChevronLeft, ChevronRight, History, FileSearch } from "lucide-react";

type AuditEvent = {
  id: string; admin_user_id: string; target_id: string | null; action: string;
  result: string; details: Record<string, unknown>; created_at: string; source: string;
};

const sourceLabels: Record<string,string> = {
  users: "Users", affiliate: "Affiliate", projects: "Projects", billing: "Billing",
  ai_usage: "AI Usage", reports: "Reports", settings: "Settings", team: "Admin Team",
};
const label = (value: string) => value.replaceAll("_"," ").replace(/\b\w/g, (s) => s.toUpperCase());

export default function AdminAuditPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [source, setSource] = useState("all");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 50;

  useEffect(() => { if (!authLoading && !user) navigate("/auth?redirect=/admin/audit"); }, [user, authLoading, navigate]);

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_global_audit_events", {
      _limit: pageSize, _offset: (nextPage - 1) * pageSize,
      _action: action === "all" ? null : action,
      _source: source === "all" ? null : source,
    });
    if (error) {
      if (error.message?.toLowerCase().includes("permission required") || error.message?.toLowerCase().includes("admin access")) setIsAdmin(false);
      else toast.error(error.message || "Unable to load audit history. Apply the audit migration first.");
      setEvents([]); setTotal(0);
    } else {
      const result = data as unknown as { events: AuditEvent[]; total: number; available_sources: string[] };
      setIsAdmin(true); setEvents(result.events || []); setTotal(Number(result.total || 0));
      setSources(result.available_sources || []); setPage(nextPage);
    }
    setLoading(false);
  }, [action, source]);

  useEffect(() => { if (user) void load(1); }, [user, load]);

  const exportCsv = () => {
    const columns = ["created_at","source","action","result","admin_user_id","target_id","details"];
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g,'""')}"`;
    const csv = [columns.join(","), ...events.map((event) => columns.map((key) => quote(key === "details" ? JSON.stringify(event.details) : (event as any)[key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `civilos-admin-audit-page-${page}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const actions = [
    "view_user_details","suspend_account","reactivate_account",
    "view_project_details","update_project_status",
    "view_billing","approve_payment","reject_payment",
    "list_ai_usage","inspect_ai_usage","view_business_report",
    "update_system_settings","view_affiliate_directory","update_withdrawal_status",
    "review_commission","invite_created","invite_revoked","sub_admin_activated",
    "sub_admin_suspended","sub_admin_removed","permission_granted","permission_revoked","role_changed",
  ];
  const hasNext = page * pageSize < total;

  return <>
    <SEO title="Admin · Unified Audit Log" description="Centralized read-only administrative activity and security audit timeline." />
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <DashboardSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6">
            <SidebarTrigger /><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">Unified Audit Log</h1>
            <Button variant="ghost" size="icon" onClick={() => void load(page)} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
            <NotificationBell /><ThemeToggle />
          </header>
          <main className="flex-1 p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">
            {loading && isAdmin === null ? <><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></>
              : isAdmin === false ? <div className="rounded-xl border bg-card p-10 text-center"><ShieldAlert className="h-9 w-9 mx-auto mb-2 text-muted-foreground/50" /><p className="font-medium">Admin access required</p></div>
              : <>
                <div className="rounded-xl border bg-card p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1"><p className="font-medium text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Privileged activity history</p><p className="text-xs text-muted-foreground mt-1">Read-only timeline of recorded admin access and actions. Events appear only after the corresponding module migrations and functions are deployed.</p></div>
                  <Badge variant="outline">{total.toLocaleString()} matching events</Badge>
                  <Button variant="outline" size="sm" onClick={exportCsv} disabled={!events.length}><Download className="h-4 w-4 mr-1" />Export page CSV</Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select className="h-10 rounded-md border bg-background px-3 text-sm" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
                    <option value="all">All sources</option>{sources.map((s) => <option key={s} value={s}>{sourceLabels[s] || label(s)}</option>)}
                  </select>
                  <select className="h-10 rounded-md border bg-background px-3 text-sm" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
                    <option value="all">All actions</option>{actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}
                  </select>
                  <div className="flex-1" /><Button variant="outline" onClick={() => { setSource("all"); setAction("all"); setPage(1); }}>Clear filters</Button>
                </div>
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="p-4 border-b flex items-center justify-between"><div><h2 className="font-semibold">Administrative events</h2><p className="text-xs text-muted-foreground">Newest first · 50 records per page</p></div><History className="h-5 w-5 text-muted-foreground" /></div>
                  {loading ? <div className="p-4 space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
                    : events.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground"><FileSearch className="h-8 w-8 mx-auto mb-2 opacity-40" />No audit events found for the selected filters.</div>
                    : <div className="divide-y">{events.map((event) => <article key={event.source + event.id} className="p-4 space-y-2">
                      <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <div className="flex-1 min-w-0"><p className="font-medium text-sm">{label(event.action)}</p><p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p></div>
                        <Badge variant="outline">{sourceLabels[event.source] || label(event.source)}</Badge>
                        <Badge variant={event.result === "failed" ? "destructive" : event.result === "succeeded" ? "default" : "secondary"}>{event.result}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground break-all">Admin: {event.admin_user_id}{event.target_id ? <><br />Target: {event.target_id}</> : null}</div>
                      {event.details && Object.keys(event.details).length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Event details</summary><pre className="mt-2 p-3 rounded-lg bg-muted/50 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(event.details,null,2)}</pre></details>}
                    </article>)}</div>}
                  <div className="p-3 border-t flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Page {page} · {total.toLocaleString()} total</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}><ChevronLeft className="h-4 w-4 mr-1" />Previous</Button><Button size="sm" variant="outline" disabled={!hasNext || loading} onClick={() => void load(page + 1)}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button></div></div>
                </div>
              </>}
          </main>
        </div>
      </div>
    </SidebarProvider>
  </>;
}
