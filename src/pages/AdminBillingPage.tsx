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
import { formatBDT } from "@/lib/subscription";
import { toast } from "sonner";
import { Check, X, ShieldAlert, Receipt, RefreshCw, Search, Download, CreditCard, CalendarClock } from "lucide-react";

type Kind = "payments" | "subscriptions";
type Row = {
  id: string; user_id: string; plan_id: string | null; subscription_id?: string | null;
  amount?: number; currency?: string; billing_cycle: string; payment_provider?: string | null;
  payment_method?: string | null; transaction_id?: string | null; sender_number?: string | null;
  status: string; admin_note?: string | null; invoice_number?: string; verified_at?: string | null;
  created_at: string; updated_at?: string; start_date?: string; renewal_date?: string | null;
  cancelled_at?: string | null; owner_name?: string | null; owner_email?: string | null;
  plan_name?: string | null; plan_code?: string | null;
};

const money = (value: number | undefined, currency = "BDT") =>
  currency === "BDT" ? formatBDT(Number(value || 0)) : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));

export default function AdminBillingPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [kind, setKind] = useState<Kind>("payments");
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (!authLoading && !user) navigate("/auth?redirect=/admin/billing"); }, [user, authLoading, navigate]);

  const load = useCallback(async (nextPage = 1, nextKind: Kind = kind, nextStatus = status, nextSearch = search) => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-billing-data", {
      body: { action: "list", kind: nextKind, page: nextPage, status: nextStatus, search: nextSearch },
    });
    if (error || data?.error) {
      if (data?.error?.includes("Admin access")) setIsAdmin(false);
      else toast.error(data?.error || "Unable to load billing records. Check the admin-billing-data Edge Function deployment.");
      setRows([]); setTotal(0); setHasMore(false);
    } else {
      setIsAdmin(true);
      setRows(data?.rows || []); setTotal(data?.total || 0); setHasMore(!!data?.has_more); setPage(nextPage);
    }
    setLoading(false);
  }, [kind, status, search]);

  useEffect(() => { if (user) void load(1, kind, status, search); }, [user, kind, status, search, load]);

  const switchKind = (next: Kind) => { setKind(next); setStatus("all"); setPage(1); };
  const applySearch = () => { setSearch(searchInput.trim()); setPage(1); };
  const review = async (row: Row, decision: "verified" | "failed") => {
    let note = "";
    if (decision === "failed") {
      note = window.prompt("Write a rejection reason (minimum 8 characters):")?.trim() || "";
      if (note.length < 8) return toast.error("A clear rejection reason is required.");
    } else if (!window.confirm(`Verify ${row.invoice_number || row.id} for ${money(row.amount, row.currency)} and activate the yearly subscription?`)) return;
    setBusy(row.id);
    const { data, error } = await supabase.functions.invoke("admin-billing-data", {
      body: { action: "review-payment", paymentId: row.id, status: decision, note },
    });
    if (error || data?.error) toast.error(data?.error || "Payment review failed.");
    else {
      toast.success(decision === "verified" ? "Payment verified and subscription activated." : "Payment rejected.");
      if (data?.auditWarning) toast.warning("Action succeeded, but its audit record needs investigation.");
      await load(page, "payments", status, search);
    }
    setBusy(null);
  };

  const exportCsv = () => {
    const cols = kind === "payments"
      ? ["id","invoice_number","owner_name","owner_email","user_id","plan_name","amount","currency","billing_cycle","payment_method","transaction_id","sender_number","status","created_at","verified_at"]
      : ["id","owner_name","owner_email","user_id","plan_name","status","billing_cycle","start_date","renewal_date","cancelled_at","created_at"];
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((row) => cols.map((key) => quote((row as any)[key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `civilos-admin-${kind}-page-${page}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const statuses = kind === "payments" ? ["all","pending","verified","failed"] : ["all","active","trialing","cancelled","expired"];
  const pendingOnPage = rows.filter((row) => row.status === "pending").length;

  return (
    <>
      <SEO title="Admin · Billing & Subscriptions" description="Secure payment verification and subscription administration." />
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-muted/30">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6">
              <SidebarTrigger />
              <h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">Billing & Subscription Center</h1>
              <Button variant="ghost" size="icon" onClick={() => void load(page)} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <NotificationBell /><ThemeToggle />
            </header>
            <main className="flex-1 p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">
              {loading && isAdmin === null ? (
                <><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></>
              ) : isAdmin === false ? (
                <div className="rounded-xl border bg-card p-10 text-center space-y-2">
                  <ShieldAlert className="h-9 w-9 mx-auto text-muted-foreground/50" />
                  <p className="font-medium text-sm">Admin access required</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Records matching filters</p><p className="text-2xl font-semibold">{total.toLocaleString()}</p></div>
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Pending on this page</p><p className="text-2xl font-semibold">{kind === "payments" ? pendingOnPage : "—"}</p></div>
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Page</p><p className="text-2xl font-semibold">{page}</p></div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant={kind === "payments" ? "default" : "outline"} onClick={() => switchKind("payments")}><CreditCard className="h-4 w-4 mr-2" />Payments</Button>
                    <Button variant={kind === "subscriptions" ? "default" : "outline"} onClick={() => switchKind("subscriptions")}><CalendarClock className="h-4 w-4 mr-2" />Subscriptions</Button>
                    <div className="flex-1" />
                    <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4 mr-1" />Export page CSV</Button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex gap-2">
                      <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }} placeholder={kind === "payments" ? "Search invoice, transaction ID or user UUID" : "Search user UUID"} />
                      <Button variant="outline" onClick={applySearch}><Search className="h-4 w-4" /></Button>
                    </div>
                    <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                      {statuses.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
                    </select>
                  </div>

                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="p-4 border-b flex items-center justify-between gap-2">
                      <div><h2 className="font-semibold">{kind === "payments" ? "Payment records" : "Subscription records"}</h2><p className="text-xs text-muted-foreground">Server-side search and pagination · 25 records per page</p></div>
                      <Badge variant="outline">{total.toLocaleString()} total</Badge>
                    </div>
                    {loading ? <div className="p-4 space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                      : rows.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground"><Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />No records found.</div>
                      : <div className="divide-y">{rows.map((row) => (
                        <article key={row.id} className="p-4 flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-sm">{row.plan_name || "Unknown plan"}</span>
                              <Badge variant={row.status === "verified" || row.status === "active" ? "default" : row.status === "pending" || row.status === "trialing" ? "secondary" : "outline"}>{row.status}</Badge>
                              <span className="text-xs text-muted-foreground">{row.billing_cycle}</span>
                              {kind === "payments" && <span className="font-semibold text-sm">{money(row.amount, row.currency)}</span>}
                            </div>
                            <p className="text-xs text-muted-foreground break-all">{row.owner_name || "Unknown user"} · {row.owner_email || row.user_id}</p>
                            {kind === "payments" ? (
                              <>
                                <p className="text-xs text-muted-foreground break-all">{row.invoice_number} · {row.payment_method || row.payment_provider} · TrxID: {row.transaction_id || "—"} · Sender: {row.sender_number || "—"}</p>
                                <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()} {row.verified_at ? `· Verified ${new Date(row.verified_at).toLocaleString()}` : ""}</p>
                                {row.admin_note && <p className="text-xs text-muted-foreground">Admin note: {row.admin_note}</p>}
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-muted-foreground">Started: {row.start_date ? new Date(row.start_date).toLocaleDateString() : "—"} · Renews: {row.renewal_date ? new Date(row.renewal_date).toLocaleDateString() : "No renewal date"}</p>
                                <p className="text-xs text-muted-foreground">Provider: {row.payment_provider || "—"} · Created: {new Date(row.created_at).toLocaleString()}</p>
                              </>
                            )}
                            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Record identifiers</summary><p className="mt-1 break-all">Record: {row.id}<br />User: {row.user_id}{row.subscription_id ? <><br />Subscription: {row.subscription_id}</> : null}</p></details>
                          </div>
                          {kind === "payments" && row.status === "pending" && (
                            <div className="flex shrink-0 gap-2">
                              <Button size="sm" disabled={busy === row.id || row.billing_cycle !== "yearly"} title={row.billing_cycle !== "yearly" ? "Legacy monthly payment cannot be approved" : undefined} onClick={() => void review(row, "verified")}><Check className="h-3.5 w-3.5 mr-1" />Verify</Button>
                              <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void review(row, "failed")}><X className="h-3.5 w-3.5 mr-1" />Reject</Button>
                            </div>
                          )}
                        </article>
                      ))}</div>}
                    <div className="p-3 border-t flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Showing {rows.length ? (page - 1) * 25 + 1 : 0}–{(page - 1) * 25 + rows.length} of {total}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>Previous</Button>
                        <Button size="sm" variant="outline" disabled={!hasMore || loading} onClick={() => void load(page + 1)}>Next</Button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Payment verification runs through the existing atomic approve/reject database functions. Historical monthly payments are retained but cannot be approved under the current yearly-only billing policy.</p>
                </>
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}
