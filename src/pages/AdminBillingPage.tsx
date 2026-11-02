import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatBDT } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";
import { Check, X, ShieldAlert, Receipt, RefreshCw, Search, ChevronLeft, ChevronRight, CreditCard, Users, History, CalendarClock, AlertCircle } from "lucide-react";

type Payment = {
 id:string; user_id:string; plan_id:string|null; subscription_id:string|null; amount:number; currency:string;
 billing_cycle:string; payment_provider:string; payment_method:string|null; transaction_id:string|null;
 sender_number:string|null; status:string; admin_note:string|null; invoice_number:string; verified_at:string|null;
 created_at:string; plan_name:string; account_name:string|null; account_email:string|null;
};
type Subscription = {
 id:string; user_id:string; plan_id:string; status:string; billing_cycle:string; start_date:string;
 renewal_date:string|null; cancelled_at:string|null; payment_provider:string|null; created_at:string;
 plan_name:string; account_name:string|null; account_email:string|null;
};
const PAGE_SIZE=25;
const tone=(s:string)=>s==="verified"||s==="active"?"default":s==="pending"?"secondary":"destructive";

export default function AdminBillingPage(){
 const {user,loading:authLoading}=useAuth(); const navigate=useNavigate(); const {toast}=useToast();
 const [isAdmin,setIsAdmin]=useState<boolean|null>(null); const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState<string|null>(null); const [tab,setTab]=useState("payments");
 const [paymentStatus,setPaymentStatus]=useState("all"); const [subscriptionStatus,setSubscriptionStatus]=useState("all");
 const [search,setSearch]=useState(""); const [page,setPage]=useState(1);
 const [payments,setPayments]=useState<Payment[]>([]); const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
 const [total,setTotal]=useState(0); const [subscriptionTotal,setSubscriptionTotal]=useState(0);
 const [hasMore,setHasMore]=useState(false); const [subscriptionHasMore,setSubscriptionHasMore]=useState(false);
 const [stats,setStats]=useState({pending:0,verified:0,failed:0}); const [selected,setSelected]=useState<Payment|null>(null);
 const [auditOpen,setAuditOpen]=useState(false); const [auditRows,setAuditRows]=useState<any[]>([]); const [auditLoading,setAuditLoading]=useState(false);

 useEffect(()=>{if(!authLoading&&!user)navigate("/auth?redirect=/admin/billing");},[user,authLoading,navigate]);
 useEffect(()=>{if(!user)return;let cancelled=false;void(async()=>{const {data,error}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});if(cancelled)return;setIsAdmin(!error&&data===true);if(error||data!==true)setLoading(false);})();return()=>{cancelled=true;};},[user]);

 const loadPayments=useCallback(async(targetPage=1)=>{
  setLoading(true);
  const {data,error}=await supabase.functions.invoke("admin-billing-data",{body:{action:"payment-list",page:targetPage,pageSize:PAGE_SIZE,status:paymentStatus,search}});
  if(error||data?.error)toast({title:"Could not load payment records",description:data?.error||error?.message,variant:"destructive"});
  else{setPayments(data.payments||[]);setStats(data.stats||{pending:0,verified:0,failed:0});setTotal(data.total||0);setHasMore(!!data.has_more);setPage(targetPage);}
  setLoading(false);
 },[paymentStatus,search,toast]);
 const loadSubscriptions=useCallback(async(targetPage=1)=>{
  setLoading(true);
  const {data,error}=await supabase.functions.invoke("admin-billing-data",{body:{action:"subscription-list",page:targetPage,pageSize:PAGE_SIZE,status:subscriptionStatus}});
  if(error||data?.error)toast({title:"Could not load subscriptions",description:data?.error||error?.message,variant:"destructive"});
  else{setSubscriptions(data.subscriptions||[]);setSubscriptionTotal(data.total||0);setSubscriptionHasMore(!!data.has_more);setPage(targetPage);}
  setLoading(false);
 },[subscriptionStatus,toast]);
 useEffect(()=>{if(isAdmin!==true)return;if(tab==="payments")void loadPayments(1);if(tab==="subscriptions")void loadSubscriptions(1);},[isAdmin,tab,paymentStatus,subscriptionStatus,search,loadPayments,loadSubscriptions]);

 const review=async(row:Payment,decision:"verify"|"reject")=>{
  const note=decision==="reject"?(window.prompt("Reason for rejecting this payment:","Payment could not be verified. Please contact support.")||"").trim():"";
  if(decision==="reject"&&!note)return;
  if(!window.confirm(decision==="verify"?"Verify this payment and activate/update the user's subscription?":"Reject this pending payment?"))return;
  setBusy(row.id);
  const {data,error}=await supabase.functions.invoke("admin-billing-data",{body:{action:"review-payment",paymentId:row.id,decision,note}});
  if(error||data?.error)toast({title:"Payment review failed",description:data?.error||error?.message,variant:"destructive"});
  else{toast({title:decision==="verify"?"Payment verified":"Payment rejected",description:decision==="verify"?"Subscription activated through the secure billing workflow.":"Rejection and reason recorded."});setSelected(null);await loadPayments(page);}
  setBusy(null);
 };
 const loadAudit=async()=>{
  setAuditLoading(true);const {data,error}=await supabase.functions.invoke("admin-billing-data",{body:{action:"audit-list",limit:100}});
  if(error||data?.error)toast({title:"Unable to load billing audit",description:data?.error||error?.message,variant:"destructive"});
  else{setAuditRows(data.events||[]);setAuditOpen(true);}setAuditLoading(false);
 };

 if(authLoading||isAdmin===null)return <div className="min-h-screen grid place-items-center"><Skeleton className="h-10 w-48"/></div>;
 return <>
  <SEO title="Admin · Billing & Subscriptions" description="Secure payment verification, subscription oversight and billing audit history."/>
  <SidebarProvider><div className="min-h-screen flex w-full bg-muted/30"><DashboardSidebar/><div className="flex-1 min-w-0 flex flex-col">
   <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6"><SidebarTrigger/><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">Billing & Subscriptions</h1>{isAdmin&&<Button size="sm" variant="outline" onClick={()=>void loadAudit()} disabled={auditLoading}><History className="h-4 w-4 mr-1"/>Audit</Button>}<NotificationBell/><ThemeToggle/></header>
   <main className="flex-1 p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">
    {!isAdmin?<div className="rounded-xl border bg-card p-10 text-center space-y-2"><ShieldAlert className="h-9 w-9 mx-auto text-muted-foreground/50"/><p className="font-medium">Admin access required</p></div>:<>
     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Pending payments</p><p className="text-2xl font-bold mt-1">{stats.pending}</p><Badge variant="secondary" className="mt-2">Needs review</Badge></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Verified payments</p><p className="text-2xl font-bold mt-1">{stats.verified}</p><Badge className="mt-2">Verified</Badge></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Rejected payments</p><p className="text-2xl font-bold mt-1">{stats.failed}</p><Badge variant="destructive" className="mt-2">Failed / rejected</Badge></div>
     </div>
     <Tabs value={tab} onValueChange={v=>{setTab(v);setPage(1);}}>
      <TabsList><TabsTrigger value="payments" className="gap-2"><CreditCard className="h-4 w-4"/>Payments</TabsTrigger><TabsTrigger value="subscriptions" className="gap-2"><Users className="h-4 w-4"/>Subscriptions</TabsTrigger></TabsList>
      <TabsContent value="payments" className="space-y-4 mt-4">
       <div className="flex flex-col sm:flex-row gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search invoice, transaction ID, sender or user ID…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <Select value={paymentStatus} onValueChange={v=>{setPaymentStatus(v);setPage(1);}}><SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Payment status"/></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="verified">Verified</SelectItem><SelectItem value="failed">Failed / rejected</SelectItem></SelectContent></Select>
        <Button variant="outline" onClick={()=>void loadPayments(1)} disabled={loading}><RefreshCw className="h-4 w-4"/></Button></div>
       {loading?<div className="space-y-3"><Skeleton className="h-28 w-full"/><Skeleton className="h-28 w-full"/></div>:payments.length===0?<div className="rounded-xl border bg-card p-10 text-center"><Receipt className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2"/><p className="font-medium">No matching payments</p><p className="text-sm text-muted-foreground">Try another status or search term.</p></div>:
        <div className="space-y-3">{payments.map(row=><article key={row.id} className="rounded-xl border bg-card p-4 space-y-3"><div className="flex flex-col md:flex-row md:items-start justify-between gap-3"><div className="min-w-0 space-y-1">
         <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.plan_name} · {formatBDT(Number(row.amount))}</h3><Badge variant={tone(row.status) as any}>{row.status}</Badge></div>
         <p className="text-xs text-muted-foreground break-all">{row.invoice_number} · {row.billing_cycle} · {row.payment_method||row.payment_provider}</p>
         <p className="text-sm">{row.account_name||"CivilOS user"}{row.account_email?<span className="text-muted-foreground"> · {row.account_email}</span>:null}</p>
         <p className="text-xs text-muted-foreground break-all">Transaction: {row.transaction_id||"Not provided"} · Sender: {row.sender_number||"Not provided"}</p>
         <p className="text-xs text-muted-foreground">Submitted {new Date(row.created_at).toLocaleString()}</p>
        </div><div className="flex flex-wrap gap-2 shrink-0"><Button size="sm" variant="outline" onClick={()=>setSelected(row)}>Details</Button>{row.status==="pending"&&<><Button size="sm" disabled={busy===row.id} onClick={()=>void review(row,"verify")}><Check className="h-4 w-4 mr-1"/>Verify</Button><Button size="sm" variant="destructive" disabled={busy===row.id} onClick={()=>void review(row,"reject")}><X className="h-4 w-4 mr-1"/>Reject</Button></>}</div></div></article>)}</div>}
       <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Showing {total===0?0:(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,total)} of {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>void loadPayments(page-1)}><ChevronLeft className="h-4 w-4"/>Previous</Button><Button size="sm" variant="outline" disabled={!hasMore||loading} onClick={()=>void loadPayments(page+1)}>Next<ChevronRight className="h-4 w-4"/></Button></div></div>
      </TabsContent>
      <TabsContent value="subscriptions" className="space-y-4 mt-4">
       <div className="flex justify-end gap-2"><Select value={subscriptionStatus} onValueChange={v=>{setSubscriptionStatus(v);setPage(1);}}><SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Subscription status"/></SelectTrigger><SelectContent><SelectItem value="all">All subscriptions</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="trialing">Trialing</SelectItem></SelectContent></Select><Button variant="outline" onClick={()=>void loadSubscriptions(1)} disabled={loading}><RefreshCw className="h-4 w-4"/></Button></div>
       {loading?<div className="space-y-3"><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></div>:subscriptions.length===0?<div className="rounded-xl border bg-card p-10 text-center"><CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2"/><p className="font-medium">No subscriptions found</p></div>:
        <div className="space-y-3">{subscriptions.map(row=><article key={row.id} className="rounded-xl border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div className="space-y-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.plan_name}</h3><Badge variant={tone(row.status) as any}>{row.status}</Badge></div><p className="text-sm">{row.account_name||"CivilOS user"}{row.account_email?<span className="text-muted-foreground"> · {row.account_email}</span>:null}</p><p className="text-xs text-muted-foreground break-all">User ID: {row.user_id}</p></div><div className="text-xs text-muted-foreground md:text-right space-y-1"><p>Started: {new Date(row.start_date).toLocaleDateString()}</p><p>Renews: {row.renewal_date?new Date(row.renewal_date).toLocaleDateString():"Not scheduled"}</p><p>Billing: {row.billing_cycle} · {row.payment_provider||"—"}</p></div></article>)}</div>}
       <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Showing {subscriptionTotal===0?0:(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,subscriptionTotal)} of {subscriptionTotal}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>void loadSubscriptions(page-1)}><ChevronLeft className="h-4 w-4"/>Previous</Button><Button size="sm" variant="outline" disabled={!subscriptionHasMore||loading} onClick={()=>void loadSubscriptions(page+1)}>Next<ChevronRight className="h-4 w-4"/></Button></div></div>
       <p className="text-xs text-muted-foreground flex gap-2 items-start"><AlertCircle className="h-4 w-4 shrink-0"/>Subscription records are read-only here. Changes must go through verified payment or the user's secure cancellation workflow.</p>
      </TabsContent>
     </Tabs>
    </>}
   </main>
  </div></div></SidebarProvider>
  <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Payment details</DialogTitle></DialogHeader>{selected&&<div className="space-y-3 text-sm">
   <div className="grid grid-cols-2 gap-3"><div><p className="text-muted-foreground text-xs">Invoice</p><p className="font-medium break-all">{selected.invoice_number}</p></div><div><p className="text-muted-foreground text-xs">Status</p><Badge variant={tone(selected.status) as any}>{selected.status}</Badge></div><div><p className="text-muted-foreground text-xs">Amount</p><p className="font-semibold">{formatBDT(Number(selected.amount))}</p></div><div><p className="text-muted-foreground text-xs">Plan</p><p>{selected.plan_name}</p></div></div>
   <div className="rounded-lg border p-3 space-y-2"><p>Account: {selected.account_name||"—"} · {selected.account_email||selected.user_id}</p><p>Method: {selected.payment_method||selected.payment_provider}</p><p>Transaction ID: {selected.transaction_id||"—"}</p><p>Sender: {selected.sender_number||"—"}</p><p>Submitted: {new Date(selected.created_at).toLocaleString()}</p>{selected.verified_at&&<p>Verified: {new Date(selected.verified_at).toLocaleString()}</p>}{selected.admin_note&&<p>Admin note: {selected.admin_note}</p>}</div>
   {selected.status==="pending"&&<div className="flex gap-2 justify-end"><Button variant="outline" onClick={()=>void review(selected,"reject")} disabled={busy===selected.id}>Reject</Button><Button onClick={()=>void review(selected,"verify")} disabled={busy===selected.id}>Verify payment</Button></div>}
  </div>}</DialogContent></Dialog>
  <Dialog open={auditOpen} onOpenChange={setAuditOpen}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Billing audit history</DialogTitle></DialogHeader>{auditRows.length===0?<p className="text-sm text-muted-foreground">No payment review events recorded yet.</p>:<div className="space-y-2">{auditRows.map((row:any)=><div key={row.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant={row.action==="payment_verified"?"default":"destructive"}>{row.action.replace("payment_","")}</Badge><span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span></div><p className="mt-2">{row.target_name||"Account"} · {row.target_email||row.target_user_id}</p><p className="text-xs text-muted-foreground">Reviewed by {row.actor_email||row.actor_user_id} · {formatBDT(Number(row.amount))} · {row.previous_status} → {row.new_status}</p>{row.note&&<p className="text-xs mt-1">Note: {row.note}</p>}</div>)}</div>}</DialogContent></Dialog>
 </>;
}
