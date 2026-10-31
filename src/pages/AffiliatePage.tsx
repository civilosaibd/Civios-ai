import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Copy, MessageCircle, Wallet, TrendingUp, Users, Share2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { referralLink as buildReferralLink } from "@/lib/referral";

type AffiliateStats = { referred: number; converted: number; earned: number; in_review: number; withdrawn: number; requested: number; available: number; rate: number };
type CommissionRow = { id: string; base_amount: number; rate: number; commission_amount: number; status: string; created_at: string };

export default function AffiliatePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [refs, setRefs] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  // numbers come from the database (my_affiliate_stats) — the same source request_withdrawal checks
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wOpen, setWOpen] = useState(false);
  const [wForm, setWForm] = useState({ amount: "", method: "bKash", account_number: "" });

  const load = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const { data: p, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (profileError) throw profileError;
      setProfile(p);
      const [{ data: r, error: referralError }, { data: w, error: withdrawalError }, { data: st, error: statsError }, { data: c, error: commissionError }] = await Promise.all([
        (supabase as any).from("referrals").select("*").eq("referrer_id", user.id).order("created_at", { ascending: false }),
        (supabase as any).from("withdrawals").select("*").eq("user_id", user.id).order("requested_at", { ascending: false }),
        supabase.rpc("my_affiliate_stats"),
        supabase.from("referral_commissions").select("id, referrer_id, base_amount, rate, commission_amount, status, created_at").eq("referrer_id", user.id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (referralError) throw referralError;
      if (withdrawalError) throw withdrawalError;
      if (statsError) throw statsError;
      if (commissionError) throw commissionError;
      setRefs(r || []);
      setWithdrawals(w || []);
      if (st) setStats(st as unknown as AffiliateStats);
      setCommissions((c || []) as CommissionRow[]);
      if (!p?.referral_code) setLoadError("Your referral profile is not ready yet. Please refresh in a moment; if this continues, contact support.");
    } catch (error: any) {
      setLoadError(error?.message || "Could not load your referral information.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [user?.id]);

  const referralLink = profile ? buildReferralLink(window.location.origin, profile.referral_code) : "";
  const total = stats?.referred ?? refs.length;
  const converted = stats?.converted ?? refs.filter(r => r.status === "converted").length;
  const earned = Number(stats?.earned ?? 0);
  const inReview = Number(stats?.in_review ?? 0);
  const available = Number(stats?.available ?? 0);
  const conversionRate = total > 0 ? (converted / total) * 100 : 0;
  const referralTrend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString(undefined, { month: "short" }), count: refs.filter((r) => String(r.created_at || "").slice(0, 7) === key).length };
  });
  const maxReferralCount = Math.max(1, ...referralTrend.map((item) => item.count));
  const commissionStatusCounts = commissions.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const money = (n: number) => `৳${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const exportCsv = () => {
    const rows = [
      ["Record Type", "Date", "Status", "Amount", "Details"],
      ...refs.map((r) => ["Referral", r.created_at || "", r.status || "", String(r.commission_amount ?? ""), r.plan || ""]),
      ...commissions.map((c) => ["Commission", c.created_at, c.status, String(c.commission_amount), `${Math.round(Number(c.rate) * 100)}% of ${c.base_amount}`]),
      ...withdrawals.map((w) => ["Withdrawal", w.requested_at || "", w.status || "", String(w.amount ?? ""), w.method || ""]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "civilos-affiliate-report.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Affiliate report exported");
  };

  const copy = async () => {
    if (!referralLink) return toast.error("Your referral link is not available yet.");
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied!");
    } catch {
      toast.error("Could not copy automatically. Please select and copy the link.");
    }
  };

  const share = (net: string) => {
    const text = encodeURIComponent(`CivilOS AI ব্যবহার করুন — Bangladesh এর #1 AI Civil Engineering platform! ${referralLink}`);
    const urls: Record<string,string> = {
      fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`,
      wa: `https://wa.me/?text=${text}`,
      li: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`,
    };
    window.open(urls[net], "_blank");
  };

  const requestWithdraw = async () => {
    const amt = Number(wForm.amount);
    if (amt < 500) return toast.error("Minimum ৳500");
    if (amt > available) return toast.error("Amount exceeds available balance");
    // Server-side: enforces ৳500 minimum, real balance, allowed methods (no direct INSERT any more).
    const { error } = await supabase.rpc("request_withdrawal", {
      _amount: amt, _method: wForm.method, _account_number: wForm.account_number,
    });
    if (error) return toast.error(error.message);
    toast.success("Withdrawal requested");
    setWOpen(false); setWForm({ amount:"", method:"bKash", account_number:"" });
    load();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10">
        <div className="container max-w-5xl space-y-6">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold">Affiliate Program</h1>
            <p className="text-sm text-muted-foreground">প্রথম eligible successful payment-এ ৩০% এবং পরবর্তী verified payment-গুলোতে ১০% commission। Minimum withdrawal: ৳500।</p>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Loading your referral details…</p>}
          {loadError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</div>}

          <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={exportCsv} disabled={loading}><Download className="h-4 w-4 mr-2"/>Export CSV</Button><Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button></div>\n\n          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6"><Users className="h-5 w-5 text-accent mb-2"/><p className="text-xs text-muted-foreground">Total Referrals</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><TrendingUp className="h-5 w-5 text-green-500 mb-2"/><p className="text-xs text-muted-foreground">Conversions</p><p className="text-2xl font-bold">{converted}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><Wallet className="h-5 w-5 text-accent mb-2"/><p className="text-xs text-muted-foreground">Total Earned</p><p className="text-2xl font-bold">{money(earned)}</p>{inReview > 0 && <p className="text-xs text-muted-foreground mt-1">{money(inReview)} under review</p>}</CardContent></Card>
            <Card><CardContent className="pt-6"><Wallet className="h-5 w-5 text-orange-500 mb-2"/><p className="text-xs text-muted-foreground">Available</p><p className="text-2xl font-bold">{money(available)}</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Referral Growth</CardTitle><p className="text-xs text-muted-foreground">Monthly referral sign-ups · last 6 months · all loaded referral records</p></CardHeader>
              <CardContent>
                <div className="flex h-36 items-end gap-3 border-b pb-2">
                  {referralTrend.map((item) => (
                    <div key={item.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-xs font-medium tabular-nums">{item.count}</span>
                      <div className="w-full max-w-12 rounded-t-md bg-primary/80 transition-all" style={{ height: `${Math.max(item.count > 0 ? 8 : 2, (item.count / maxReferralCount) * 76)}%` }} />
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Conversion Overview</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Conversion rate</span><b>{conversionRate.toFixed(1)}%</b></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, conversionRate)}%` }}/></div></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Referred users</span><b>{total}</b></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Converted</span><b>{converted}</b></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Not converted</span><b>{Math.max(0, total - converted)}</b></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Commission Status Snapshot</CardTitle><p className="text-xs text-muted-foreground">Latest {commissions.length} commission records (maximum 50 loaded)</p></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Approved", value: commissionStatusCounts.approved || 0 },
                { label: "Under review", value: commissionStatusCounts.flagged || 0 },
                { label: "Rejected", value: commissionStatusCounts.rejected || 0 },
                { label: "Records shown", value: commissions.length },
              ].map((item) => <div key={item.label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p></div>)}
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle>Your Referral Link</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={referralLink}/>
                <Button onClick={copy}><Copy className="h-4 w-4"/></Button>
              </div>
              <p className="text-xs text-muted-foreground">Code: <b>{profile?.referral_code}</b></p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={()=>share("fb")}><Share2 className="h-4 w-4"/>Facebook</Button>
                <Button size="sm" variant="outline" onClick={()=>share("wa")}><MessageCircle className="h-4 w-4"/>WhatsApp</Button>
                <Button size="sm" variant="outline" onClick={()=>share("li")}><Share2 className="h-4 w-4"/>LinkedIn</Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Dialog open={wOpen} onOpenChange={setWOpen}>
              <DialogTrigger asChild><Button disabled={available<500}>Request Withdrawal</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Withdraw Earnings</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Amount (min ৳500)</Label><Input type="number" value={wForm.amount} onChange={e=>setWForm({...wForm,amount:e.target.value})}/></div>
                  <div><Label>Method</Label>
                    <Select value={wForm.method} onValueChange={v=>setWForm({...wForm,method:v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bKash">bKash</SelectItem>
                        <SelectItem value="Nagad">Nagad</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Account / Phone Number</Label><Input value={wForm.account_number} onChange={e=>setWForm({...wForm,account_number:e.target.value})}/></div>
                  <Button className="w-full" onClick={requestWithdraw}>Submit Request</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card><CardHeader><CardTitle>Referrals</CardTitle></CardHeader>
            <CardContent>
              {refs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No referrals yet — share your link!</p> :
                <div className="border rounded-lg divide-y">
                  {refs.map(r => (
                    <div key={r.id} className="p-3 flex justify-between text-sm">
                      <div>
                        <p className="font-medium">{r.referred_user_id?.slice(0,8)}...</p>
                        <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()} · {r.plan || "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{money(Number(r.commission_amount))}</p>
                        <Badge variant="outline">{r.status === "flagged" ? "under review" : r.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>}
            </CardContent>
          </Card>

          {commissions.length > 0 && (
            <Card><CardHeader><CardTitle>Recent Commission History</CardTitle><p className="text-xs text-muted-foreground">Showing the latest 50 records at most.</p></CardHeader>
              <CardContent>
                <div className="border rounded-lg divide-y">
                  {commissions.map(c => (
                    <div key={c.id} className="p-3 flex justify-between text-sm">
                      <div>
                        <p className="font-medium">{money(Number(c.commission_amount))}</p>
                        <p className="text-xs text-muted-foreground">{Math.round(Number(c.rate) * 100)}% of {money(Number(c.base_amount))} · {new Date(c.created_at).toLocaleDateString()}</p>
                      </div>
                      <Badge variant="outline">{c.status === "flagged" ? "under review" : c.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {withdrawals.length > 0 && (
            <Card><CardHeader><CardTitle>Withdrawal History</CardTitle></CardHeader>
              <CardContent>
                <div className="border rounded-lg divide-y">
                  {withdrawals.map(w => (
                    <div key={w.id} className="p-3 flex justify-between text-sm">
                      <div><p className="font-medium">৳{Number(w.amount).toLocaleString()}</p><p className="text-xs text-muted-foreground">{w.method} · {w.account_number}</p></div>
                      <Badge variant="outline">{w.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
