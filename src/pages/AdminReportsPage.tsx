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
import {
  RefreshCw, Download, ShieldAlert, Users, FolderKanban, CreditCard,
  Wallet, Handshake, Activity, TrendingUp, CalendarDays, Receipt,
} from "lucide-react";

type Metrics = {
  period_start: string; period_end: string;
  users_new: number; users_total: number; projects_new: number; projects_total: number;
  subscriptions_new: number; subscriptions_active: number;
  payments_new: number; payments_pending: number; payments_verified: number; payments_failed: number;
  verified_payment_total_bdt: number; referrals_new: number; referrals_converted: number;
  commissions_approved_bdt: number; withdrawals_pending: number; withdrawals_paid_bdt: number;
  ai_usage_records: number;
};

const count = (value: number) => new Intl.NumberFormat().format(Number(value || 0));
const taka = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateValue = (date: Date) => {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const monthStart = () => { const d = new Date(); return dateValue(new Date(d.getFullYear(), d.getMonth(), 1)); };
const tomorrow = () => { const d = new Date(); return dateValue(new Date(d.getFullYear(), d.getMonth() + 1, 1)); };

function MetricCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: any }) {
  return <div className="rounded-xl border bg-card p-4 min-w-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold mt-1 break-words">{value}</p>{hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}</div><div className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div></div></div>;
}

export default function AdminReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(tomorrow());
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !user) navigate("/auth?redirect=/admin/reports"); }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!fromDate || !toDate) return;
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      toast.error("End date must be after start date."); return;
    }
    if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
      toast.error("Choose a reporting period of 366 days or less."); return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_dashboard_metrics", {
      _from: start.toISOString(), _to: end.toISOString(),
    });
    if (error) {
      if (error.message?.toLowerCase().includes("admin access")) setIsAdmin(false);
      else toast.error(error.message || "Unable to load admin business metrics. Apply the migration first.");
      setMetrics(null);
    } else {
      setIsAdmin(true); setMetrics(data as Metrics);
    }
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const exportCsv = () => {
    if (!metrics) return;
    const rows: [string, string | number][] = [
      ["Reporting period start", metrics.period_start], ["Reporting period end (exclusive)", metrics.period_end],
      ["Total users", metrics.users_total], ["New users", metrics.users_new],
      ["Total projects", metrics.projects_total], ["New projects", metrics.projects_new],
      ["Active subscriptions", metrics.subscriptions_active], ["New subscriptions", metrics.subscriptions_new],
      ["Payments submitted", metrics.payments_new], ["Pending payments", metrics.payments_pending],
      ["Verified payments", metrics.payments_verified], ["Failed payments", metrics.payments_failed],
      ["Verified payment volume (BDT)", metrics.verified_payment_total_bdt],
      ["New referrals", metrics.referrals_new], ["Converted referrals", metrics.referrals_converted],
      ["Approved commissions (BDT)", metrics.commissions_approved_bdt],
      ["Pending/approved withdrawals", metrics.withdrawals_pending],
      ["Paid withdrawals (BDT)", metrics.withdrawals_paid_bdt],
      ["AI usage user-month records", metrics.ai_usage_records],
    ];
    const csv = ["Metric,Value", ...rows.map(([key, value]) => `"${key.replace(/"/g, '""')}"," ${String(value).replace(/"/g, '""')}"`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `civilos-admin-report-${fromDate}-to-${toDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <>
    <SEO title="Admin · Business Reports" description="Central operational, billing, affiliate and product usage metrics." />
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <DashboardSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6">
            <SidebarTrigger /><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">Business Reports & Analytics</h1>
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
            <NotificationBell /><ThemeToggle />
          </header>
          <main className="flex-1 p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">
            {loading && isAdmin === null ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-52 w-full" /></>
              : isAdmin === false ? <div className="rounded-xl border bg-card p-10 text-center"><ShieldAlert className="h-9 w-9 mx-auto mb-2 text-muted-foreground/50" /><p className="font-medium">Admin access required</p></div>
              : <>
                <div className="rounded-xl border bg-card p-4 flex flex-col md:flex-row md:items-end gap-3">
                  <div className="flex-1"><label className="text-xs text-muted-foreground block mb-1">From date (inclusive)</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /></div>
                  <div className="flex-1"><label className="text-xs text-muted-foreground block mb-1">To date (exclusive)</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /></div>
                  <Button onClick={() => void load()} disabled={loading}><CalendarDays className="h-4 w-4 mr-2" />Generate report</Button>
                  <Button variant="outline" onClick={exportCsv} disabled={!metrics || loading}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
                </div>
                {loading ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-28 w-full" />)}</div>
                  : metrics ? <>
                    <div className="flex items-center gap-2"><Badge variant="outline">Live database aggregates</Badge><span className="text-xs text-muted-foreground">Period end is exclusive · maximum 366 days</span></div>
                    <section className="space-y-3"><h2 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" />Users & Projects</h2><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <MetricCard label="Total users" value={count(metrics.users_total)} hint={`+${count(metrics.users_new)} in period`} icon={Users} />
                      <MetricCard label="Total projects" value={count(metrics.projects_total)} hint={`+${count(metrics.projects_new)} in period`} icon={FolderKanban} />
                      <MetricCard label="Active subscriptions" value={count(metrics.subscriptions_active)} hint={`+${count(metrics.subscriptions_new)} created in period`} icon={Activity} />
                      <MetricCard label="AI usage records" value={count(metrics.ai_usage_records)} hint="User-month records for the start month" icon={TrendingUp} />
                    </div></section>
                    <section className="space-y-3"><h2 className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" />Payments & Revenue</h2><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <MetricCard label="Verified payment volume" value={taka(metrics.verified_payment_total_bdt)} hint="BDT payments verified in period" icon={Wallet} />
                      <MetricCard label="Verified payments" value={count(metrics.payments_verified)} icon={Receipt} />
                      <MetricCard label="Pending payments" value={count(metrics.payments_pending)} hint={`${count(metrics.payments_new)} submitted in period`} icon={CreditCard} />
                      <MetricCard label="Failed payments" value={count(metrics.payments_failed)} icon={Activity} />
                    </div></section>
                    <section className="space-y-3"><h2 className="font-semibold flex items-center gap-2"><Handshake className="h-4 w-4" />Affiliate Program</h2><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <MetricCard label="New referrals" value={count(metrics.referrals_new)} icon={Users} />
                      <MetricCard label="Converted referrals" value={count(metrics.referrals_converted)} icon={TrendingUp} />
                      <MetricCard label="Approved commissions" value={taka(metrics.commissions_approved_bdt)} hint="Commission entries created in period" icon={Wallet} />
                      <MetricCard label="Pending / approved withdrawals" value={count(metrics.withdrawals_pending)} icon={Activity} />
                    </div></section>
                    <section className="space-y-3"><h2 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" />Payouts</h2><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <MetricCard label="Paid withdrawals" value={taka(metrics.withdrawals_paid_bdt)} hint="BDT paid in period" icon={Wallet} />
                      <MetricCard label="Payments submitted" value={count(metrics.payments_new)} icon={Receipt} />
                    </div></section>
                    <p className="text-xs text-muted-foreground">Financial figures are operational aggregates from the current CivilOS database, not audited financial statements. Verified payment volume is gross verified BDT payments; it is not net revenue after refunds, fees, taxes or reversals. AI usage records count user-month rows, not tokens or API spend.</p>
                  </> : <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">No report data available. Confirm the metrics migration has been applied.</div>}
              </>}
          </main>
        </div>
      </div>
    </SidebarProvider>
  </>;
}
