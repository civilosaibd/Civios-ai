import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";

export default function AdminAffiliatePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [commissions, setCommissions] = useState<Tables<"referral_commissions">[]>([]);

  useEffect(() => { (async () => {
    if (!user) return;
    const { data } = await (supabase as any).from("user_roles").select("role").eq("user_id", user.id).eq("role","admin").maybeSingle();
    if (!data) { toast.error("Admin only"); nav("/"); return; }
    setIsAdmin(true);
    load();
  })(); }, [user]);

  const load = async () => {
    const { data } = await (supabase as any).from("withdrawals").select("*").order("requested_at",{ascending:false});
    setWithdrawals(data || []);
    const { data: c } = await supabase.from("referral_commissions").select("*").order("created_at", { ascending: false }).limit(200);
    setCommissions(c || []);
    setTotalPaid((data||[]).filter((w:any)=>w.status==="paid").reduce((s:number,w:any)=>s+Number(w.amount),0));
  };

  // Status changes are validated by a DB trigger (pending→approved|rejected, approved→paid|rejected);
  // timestamps are set server-side. Surface any error instead of failing silently.
  const setStatus = async (id: string, status: "approved" | "rejected" | "paid", okMsg: string) => {
    const { error } = await (supabase as any).from("withdrawals").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(okMsg); load();
  };
  // Flagged commissions (e.g. same sender number as the referrer) are held until an admin decides.
  const review = async (id: string, approve: boolean) => {
    const { error } = await supabase.rpc("review_commission", { _commission_id: id, _approve: approve });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "Commission approved" : "Commission rejected"); load();
  };
  const approve = (id: string) => setStatus(id, "approved", "Withdrawal approved");
  const reject = (id: string) => setStatus(id, "rejected", "Withdrawal rejected");
  const markPaid = (id: string) => setStatus(id, "paid", "Marked as paid");

  const sum = (status: string) => commissions.filter(c => c.status === status).reduce((t, c) => t + Number(c.commission_amount), 0);

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10">
        <div className="container max-w-5xl space-y-6">
          <h1 className="font-heading text-2xl md:text-3xl font-bold">Affiliate Admin</h1>
          <Card><CardHeader><CardTitle className="text-sm">Total Commission Paid</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">৳{totalPaid.toLocaleString()}</CardContent></Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardHeader><CardTitle className="text-sm">Approved Commission</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">৳{sum("approved").toLocaleString()}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Waiting for review</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">৳{sum("flagged").toLocaleString()}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Commission rows</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{commissions.length}</CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Commissions</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg divide-y">
                {commissions.length===0 ? <p className="p-6 text-center text-sm text-muted-foreground">No commissions yet</p> :
                  commissions.map(c => (
                    <div key={c.id} className="p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <div>
                        <p className="font-medium">৳{Number(c.commission_amount).toLocaleString()} <span className="text-xs text-muted-foreground">({Math.round(Number(c.rate)*100)}% of ৳{Number(c.base_amount).toLocaleString()})</span></p>
                        <p className="text-xs text-muted-foreground">Referrer {c.referrer_id.slice(0,8)} ← user {c.referred_user_id.slice(0,8)} · {new Date(c.created_at).toLocaleString()}</p>
                        {c.flag_reason && <p className="text-xs text-orange-600">{c.flag_reason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{c.status}</Badge>
                        {c.status==="flagged" && <>
                          <Button size="sm" variant="outline" onClick={()=>review(c.id,true)}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={()=>review(c.id,false)}>Reject</Button>
                        </>}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Withdrawal Requests</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg divide-y">
                {withdrawals.length===0 ? <p className="p-6 text-center text-sm text-muted-foreground">No requests</p> :
                  withdrawals.map(w => (
                    <div key={w.id} className="p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium">৳{Number(w.amount).toLocaleString()} · {w.method}</p>
                        <p className="text-xs text-muted-foreground">{w.account_number} · {new Date(w.requested_at).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">User: {w.user_id.slice(0,8)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{w.status}</Badge>
                        {w.status==="pending" && <Button size="sm" variant="outline" onClick={()=>approve(w.id)}>Approve</Button>}
                        {(w.status==="pending" || w.status==="approved") && <Button size="sm" variant="outline" onClick={()=>reject(w.id)}>Reject</Button>}
                        {w.status==="approved" && <Button size="sm" onClick={()=>markPaid(w.id)}>Mark Paid</Button>}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
