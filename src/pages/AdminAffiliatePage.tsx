import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Download, RefreshCw, Search, Users, Wallet, TrendingUp, ShieldCheck, Check, X, Clock } from "lucide-react";

type Affiliate = {
  user_id: string; name: string | null; email: string | null; phone: string | null; referral_code: string | null;
  referrals: number; conversions: number; share_actions: number; link_clicks: number; first_tier_commissions: number; subsequent_tier_commissions: number;
  earned: number; under_review: number; available: number; referrals_detail: any[];
};
type Withdrawal = {
  id: string; user_id: string; amount: number; method: string; account_number: string; status: string;
  requested_at: string; approved_at?: string | null; paid_at?: string | null; admin_note?: string | null;
  transaction_reference?: string | null;
};
type Payload = { affiliates: Affiliate[]; commissions: any[]; withdrawals: Withdrawal[]; totals: Record<string, number>; can_manage?: boolean };

const money = (value: number) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";

export default function AdminAffiliatePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [canManageAffiliate, setCanManageAffiliate] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [reviewing, setReviewing] = useState<Withdrawal | null>(null);
  const [nextStatus, setNextStatus] = useState<"approved" | "rejected" | "paid">("approved");
  const [adminNote, setAdminNote] = useState("");
  const [transactionReference, setTransactionReference] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("admin-affiliate-data", { body: { action: "list" } });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result as Payload);
      setCanManageAffiliate(!!result.can_manage);
      setIsAdmin(true);
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("permission required")) setIsAdmin(false);
      toast.error(error?.message || "Unable to load affiliate administration data.");
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) { setIsAdmin(false); nav("/auth?redirect=/admin/affiliate"); return; }
    void load();
  }, [user, nav, load]);

  const affiliates = useMemo(() => (data?.affiliates || []).filter((a) => {
    const term = search.trim().toLowerCase();
    return !term || [a.name, a.email, a.phone, a.referral_code, a.user_id].some((v) => String(v || "").toLowerCase().includes(term));
  }), [data, search]);

  const filteredWithdrawals = useMemo(() => (data?.withdrawals || []).filter((w) => {
    const term = search.trim().toLowerCase();
    const matchesStatus = statusFilter === "all" || w.status === statusFilter;
    const affiliate = data?.affiliates.find((a) => a.user_id === w.user_id);
    const matchesSearch = !term || [affiliate?.name, affiliate?.email, affiliate?.phone, w.account_number, w.user_id].some((v) => String(v || "").toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  }), [data, search, statusFilter]);

  const updateWithdrawal = async () => {
    if (!reviewing) return;
    if (nextStatus === "paid" && !transactionReference.trim()) return toast.error("Payment transaction reference is required.");
    if (!window.confirm(`Confirm withdrawal ${nextStatus} for ${money(Number(reviewing.amount))}?`)) return;
    setBusy(reviewing.id);
    try {
      const { data: result, error } = await supabase.functions.invoke("admin-affiliate-data", {
        body: { action: "withdrawal-update", withdrawalId: reviewing.id, status: nextStatus, adminNote, transactionReference },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast.success(`Withdrawal ${nextStatus}`);
      setReviewing(null); setAdminNote(""); setTransactionReference("");
      await load();
    } catch (error: any) { toast.error(error?.message || "Withdrawal update failed."); }
    finally { setBusy(null); }
  };

  const reviewCommission = async (id: string, approve: boolean) => {
    if (!window.confirm(approve ? "Approve this flagged commission?" : "Reject this flagged commission?")) return;
    setBusy(id);
    const { error } = await supabase.rpc("review_commission", { _commission_id: id, _approve: approve });
    if (error) toast.error(error.message);
    else { toast.success(approve ? "Commission approved" : "Commission rejected"); await load(); }
    setBusy(null);
  };

  const exportCsv = () => {
    const rows = [
      ["Affiliate", "Email", "Phone", "Referral Code", "Share Actions", "Link Clicks", "Referrals", "Conversions", "First 30% Payments", "Subsequent 10% Payments", "Earned", "Under Review", "Available"],
      ...(data?.affiliates || []).map((a) => [a.name || "", a.email || "", a.phone || "", a.referral_code || "", a.share_actions, a.link_clicks, a.referrals, a.conversions, a.first_tier_commissions, a.subsequent_tier_commissions, a.earned, a.under_review, a.available]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "civilos-affiliate-admin-report.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (isAdmin !== true) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Checking administrator access…</div>;

  return <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1 py-8">
      <div className="container max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary"/><h1 className="text-2xl md:text-3xl font-bold">Affiliate Control Center</h1></div><p className="mt-1 text-sm text-muted-foreground">Affiliate profiles, tiered commissions and payout review. Privileged access is audit-logged.</p></div>
          <div className="flex gap-2"><Button variant="outline" onClick={exportCsv} disabled={!data || !canManageAffiliate}><Download className="h-4 w-4 mr-2"/>Export CSV</Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}/>Refresh</Button></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="pt-5"><Users className="h-5 w-5 text-primary mb-2"/><p className="text-xs text-muted-foreground">Affiliates</p><p className="text-2xl font-bold">{data?.totals.affiliates ?? "—"}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><TrendingUp className="h-5 w-5 text-green-600 mb-2"/><p className="text-xs text-muted-foreground">Referrals / Conversions</p><p className="text-2xl font-bold">{data ? `${data.totals.referrals} / ${data.totals.conversions}` : "—"}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><Wallet className="h-5 w-5 text-primary mb-2"/><p className="text-xs text-muted-foreground">Approved Commission</p><p className="text-2xl font-bold">{money(data?.totals.commission_approved || 0)}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><Clock className="h-5 w-5 text-orange-500 mb-2"/><p className="text-xs text-muted-foreground">Paid Withdrawals</p><p className="text-2xl font-bold">{money(data?.totals.withdrawals_paid || 0)}</p></CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search name, email, phone, referral code or account…" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All payout statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></select>
        </div>

        <Card><CardHeader><CardTitle>Affiliate Directory</CardTitle><p className="text-xs text-muted-foreground">First eligible verified payment: 30% · Subsequent eligible verified payments: 10%. Share actions count in-app share/copy clicks; link clicks are counted once per browser session. External shares cannot be verified.</p></CardHeader><CardContent>
          {loading && !data ? <p className="py-8 text-center text-sm text-muted-foreground">Loading affiliate records…</p> : affiliates.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No affiliate records match this search.</p> :
            <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Affiliate</th><th className="p-3">Share Actions</th><th className="p-3">Link Clicks</th><th className="p-3">Referrals</th><th className="p-3">Conversions</th><th className="p-3">30% / 10%</th><th className="p-3">Earned</th><th className="p-3">Review</th><th className="p-3">Available</th><th className="p-3">Details</th></tr></thead><tbody>
              {affiliates.map((a) => <tr key={a.user_id} className="border-b last:border-0"><td className="p-3"><p className="font-medium">{a.name || "Name unavailable"}</p><p className="text-xs text-muted-foreground">{a.email || "Email unavailable"} · {a.phone || "Phone unavailable"}</p><p className="text-xs text-muted-foreground">{a.referral_code || a.user_id.slice(0, 8)}</p></td><td className="p-3 tabular-nums">{a.share_actions}</td><td className="p-3 tabular-nums">{a.link_clicks}</td><td className="p-3 tabular-nums">{a.referrals}</td><td className="p-3 tabular-nums">{a.conversions}</td><td className="p-3 tabular-nums">{a.first_tier_commissions} / {a.subsequent_tier_commissions}</td><td className="p-3 font-medium">{money(a.earned)}</td><td className="p-3">{money(a.under_review)}</td><td className="p-3 font-semibold">{money(a.available)}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => setSelectedAffiliate(a)}>View</Button></td></tr>)}
            </tbody></table></div>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Withdrawal & Payout Queue</CardTitle><p className="text-xs text-muted-foreground">Minimum withdrawal is ৳500. Marking a request paid requires a transaction reference.</p></CardHeader><CardContent>
          {filteredWithdrawals.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No withdrawal requests found.</p> :
            <div className="space-y-3">{filteredWithdrawals.map((w) => { const a = data?.affiliates.find((x) => x.user_id === w.user_id); return <div key={w.id} className="rounded-xl border p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{money(Number(w.amount))}</p><Badge variant="outline">{w.status}</Badge><Badge variant="secondary">{w.method}</Badge></div><p className="text-sm mt-1">{a?.name || "Affiliate"} · {a?.email || w.user_id}</p><p className="text-xs text-muted-foreground break-all">Payout account: {w.account_number} · Requested {date(w.requested_at)}</p>{w.transaction_reference && <p className="text-xs text-muted-foreground">Transaction: {w.transaction_reference}</p>}{w.admin_note && <p className="text-xs text-muted-foreground">Admin note: {w.admin_note}</p>}</div>
              <div className="flex flex-wrap gap-2">{canManageAffiliate && w.status === "pending" && <><Button size="sm" variant="outline" disabled={busy === w.id} onClick={() => { setReviewing(w); setNextStatus("approved"); }}>Approve</Button><Button size="sm" variant="destructive" disabled={busy === w.id} onClick={() => { setReviewing(w); setNextStatus("rejected"); }}>Reject</Button></>}{canManageAffiliate && w.status === "approved" && <><Button size="sm" disabled={busy === w.id} onClick={() => { setReviewing(w); setNextStatus("paid"); }}>Mark Paid</Button><Button size="sm" variant="destructive" disabled={busy === w.id} onClick={() => { setReviewing(w); setNextStatus("rejected"); }}>Reject</Button></>}</div>
            </div>; })}</div>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Commission Review</CardTitle><p className="text-xs text-muted-foreground">Flagged commissions are held until an administrator reviews them.</p></CardHeader><CardContent>
          {(data?.commissions || []).filter((c) => c.status === "flagged").length === 0 ? <p className="text-sm text-muted-foreground py-5">No flagged commissions awaiting review.</p> : <div className="space-y-3">{(data?.commissions || []).filter((c) => c.status === "flagged").map((c) => <div key={c.id} className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><p className="font-medium">{money(Number(c.commission_amount))} · {Math.round(Number(c.rate) * 100)}% commission</p><p className="text-xs text-muted-foreground">Referrer {c.referrer_id.slice(0, 8)} · referred user {c.referred_user_id.slice(0, 8)} · {date(c.created_at)}</p><p className="text-xs text-orange-600">{c.flag_reason || "Flagged for review"}</p></div>{canManageAffiliate && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void reviewCommission(c.id, true)}><Check className="h-4 w-4 mr-1"/>Approve</Button><Button size="sm" variant="destructive" disabled={busy === c.id} onClick={() => void reviewCommission(c.id, false)}><X className="h-4 w-4 mr-1"/>Reject</Button></div>}</div>)}</div>}
        </CardContent></Card>
      </div>
    </main>
    <Footer/>

    <Dialog open={!!selectedAffiliate} onOpenChange={(open) => !open && setSelectedAffiliate(null)}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Affiliate Profile</DialogTitle></DialogHeader>{selectedAffiliate && <div className="space-y-4"><div><p className="font-semibold">{selectedAffiliate.name || "Name unavailable"}</p><p className="text-sm text-muted-foreground">{selectedAffiliate.email} · {selectedAffiliate.phone}</p><p className="text-xs text-muted-foreground">Referral code: {selectedAffiliate.referral_code || "—"} · User ID: {selectedAffiliate.user_id}</p></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[{label:"Share actions",value:selectedAffiliate.share_actions},{label:"Link clicks",value:selectedAffiliate.link_clicks},{label:"Referrals",value:selectedAffiliate.referrals},{label:"Conversions",value:selectedAffiliate.conversions},{label:"30% tier",value:selectedAffiliate.first_tier_commissions},{label:"10% tier",value:selectedAffiliate.subsequent_tier_commissions}].map((x)=><div key={x.label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{x.label}</p><p className="text-xl font-semibold">{x.value}</p></div>)}</div><div className="grid grid-cols-3 gap-2 text-sm"><div><p className="text-muted-foreground">Earned</p><b>{money(selectedAffiliate.earned)}</b></div><div><p className="text-muted-foreground">Under review</p><b>{money(selectedAffiliate.under_review)}</b></div><div><p className="text-muted-foreground">Available</p><b>{money(selectedAffiliate.available)}</b></div></div><h3 className="font-semibold text-sm">Referred users</h3>{selectedAffiliate.referrals_detail.length === 0 ? <p className="text-sm text-muted-foreground">No referrals.</p> : selectedAffiliate.referrals_detail.map((r:any)=><div key={r.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{r.referred_name || r.referred_email || r.referred_user_id}</p><p className="text-xs text-muted-foreground">{r.referred_email || r.referred_user_id} · {date(r.created_at)} · {r.plan || "Plan not set"}</p><Badge variant="outline" className="mt-1">{r.status}</Badge></div>)}</div>}</DialogContent></Dialog>

    <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}><DialogContent><DialogHeader><DialogTitle>Confirm payout action: {nextStatus}</DialogTitle></DialogHeader>{reviewing && <div className="space-y-3"><p className="text-sm">Amount: <b>{money(Number(reviewing.amount))}</b> · Method: <b>{reviewing.method}</b></p><p className="text-xs text-muted-foreground break-all">Account: {reviewing.account_number}</p>{nextStatus === "paid" && <div><label className="text-sm font-medium">Payment transaction reference *</label><Input value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)} placeholder="Enter bank / bKash / Nagad TrxID"/></div>}<div><label className="text-sm font-medium">Admin note</label><Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Optional review note"/></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button><Button variant={nextStatus === "rejected" ? "destructive" : "default"} disabled={!!busy} onClick={() => void updateWithdrawal()}>{busy ? "Saving…" : `Confirm ${nextStatus}`}</Button></div></div>}</DialogContent></Dialog>
  </div>;
}
