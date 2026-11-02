import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Activity, Bot, FolderKanban, FileSpreadsheet, DraftingCompass, FileText, HardDrive, Search, RefreshCw, ChevronLeft, ChevronRight, ShieldAlert, Users } from "lucide-react";

type UsageRow = {
 id:string; user_id:string; period:string; ai_credits:number; projects:number; boq_generations:number;
 bbs_generations:number; drawings:number; reports:number; storage_mb:number;
 display_name:string|null; avatar_url:string|null; email:string|null;
};
type Summary = {
 period:string; accounts:number; ai_credits:number; projects:number; boq_generations:number;
 bbs_generations:number; drawings:number; reports:number; storage_mb:number;
};
const PAGE_SIZE=25;
const fmt=(value:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:1}).format(Number(value)||0);
const Stat=({label,value,icon:Icon,unit=""}:{label:string;value:number;icon:any;unit?:string})=><Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><Icon className="h-5 w-5"/></div><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{fmt(value)}{unit}</p></div></CardContent></Card>;

export default function AdminAIUsagePage(){
 const {user,loading:authLoading}=useAuth();const navigate=useNavigate();const {toast}=useToast();
 const [isAdmin,setIsAdmin]=useState<boolean|null>(null);const [loading,setLoading]=useState(true);
 const [period,setPeriod]=useState(new Date().toISOString().slice(0,7));const [search,setSearch]=useState("");const [page,setPage]=useState(1);
 const [summary,setSummary]=useState<Summary|null>(null);const [records,setRecords]=useState<UsageRow[]>([]);
 const [total,setTotal]=useState(0);const [hasMore,setHasMore]=useState(false);const [metricNote,setMetricNote]=useState("");

 useEffect(()=>{if(!authLoading&&!user)navigate("/auth?redirect=/admin/ai-usage");},[user,authLoading,navigate]);
 useEffect(()=>{if(!user)return;let cancelled=false;void(async()=>{const {data,error}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});if(cancelled)return;setIsAdmin(!error&&data===true);if(error||data!==true)setLoading(false);})();return()=>{cancelled=true;};},[user]);
 const load=useCallback(async(targetPage=1)=>{
  setLoading(true);
  const {data,error}=await supabase.functions.invoke("admin-ai-usage-data",{body:{action:"list",period,page:targetPage,search}});
  if(error||data?.error)toast({title:"Could not load AI usage data",description:data?.error||error?.message,variant:"destructive"});
  else{setSummary(data.summary||null);setRecords(data.records||[]);setTotal(data.total||0);setHasMore(!!data.has_more);setPage(targetPage);setMetricNote(data.metric_note||"");}
  setLoading(false);
 },[period,search,toast]);
 useEffect(()=>{if(isAdmin===true)void load(1);},[isAdmin,load]);
 if(authLoading||isAdmin===null)return <div className="min-h-screen grid place-items-center"><Skeleton className="h-10 w-48"/></div>;
 return <>
  <SEO title="Admin · AI Usage Monitoring" description="Monthly CivilOS AI usage counters and account-level activity oversight."/>
  <SidebarProvider><div className="min-h-screen flex w-full bg-muted/30"><DashboardSidebar/><div className="flex-1 min-w-0 flex flex-col">
   <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6"><SidebarTrigger/><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">AI Usage Monitoring</h1><Button size="sm" variant="outline" onClick={()=>void load(page)} disabled={loading}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button><NotificationBell/><ThemeToggle/></header>
   <main className="flex-1 p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">
    {!isAdmin?<div className="rounded-xl border bg-card p-10 text-center space-y-2"><ShieldAlert className="h-9 w-9 mx-auto text-muted-foreground/50"/><p className="font-medium">Admin access required</p></div>:<>
     <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between"><div><h2 className="text-xl font-semibold">Usage overview</h2><p className="text-sm text-muted-foreground">Account activity counters stored for the selected month.</p></div><div className="w-full sm:w-52"><label className="text-xs text-muted-foreground mb-1 block">Reporting month</label><Input type="month" value={period} onChange={e=>{setPeriod(e.target.value);setPage(1);}}/></div></div>
     {loading&&!summary?<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-20 w-full"/>)}</div>:summary?<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat label="Accounts tracked" value={summary.accounts} icon={Users}/>
      <Stat label="AI credits used" value={summary.ai_credits} icon={Bot}/>
      <Stat label="Projects" value={summary.projects} icon={FolderKanban}/>
      <Stat label="BOQ generations" value={summary.boq_generations} icon={FileSpreadsheet}/>
      <Stat label="BBS generations" value={summary.bbs_generations} icon={FileSpreadsheet}/>
      <Stat label="Drawings" value={summary.drawings} icon={DraftingCompass}/>
      <Stat label="Reports" value={summary.reports} icon={FileText}/>
      <Stat label="Storage used" value={summary.storage_mb} icon={HardDrive} unit=" MB"/>
     </div>:null}
     <div className="rounded-xl border bg-card p-4 space-y-3"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h3 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4"/>Account usage records</h3><p className="text-xs text-muted-foreground">Sorted by AI credits, highest first.</p></div><div className="relative w-full sm:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Filter by exact user ID (UUID)" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
      {loading?<div className="space-y-2"><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-full"/></div>:records.length===0?<div className="py-12 text-center"><Activity className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2"/><p className="font-medium">No usage records for this month</p><p className="text-xs text-muted-foreground">No account counters were found for {period}.</p></div>:
       <div className="space-y-3">{records.map(row=><div key={row.id} className="rounded-lg border p-3 space-y-3"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div className="min-w-0"><p className="font-medium truncate">{row.display_name||"CivilOS user"}</p><p className="text-xs text-muted-foreground break-all">{row.email||row.user_id}</p></div><Badge variant="secondary">{row.period}</Badge></div><div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs"><div><p className="text-muted-foreground">AI credits</p><p className="font-semibold">{fmt(row.ai_credits)}</p></div><div><p className="text-muted-foreground">Projects</p><p className="font-semibold">{fmt(row.projects)}</p></div><div><p className="text-muted-foreground">BOQ</p><p className="font-semibold">{fmt(row.boq_generations)}</p></div><div><p className="text-muted-foreground">BBS</p><p className="font-semibold">{fmt(row.bbs_generations)}</p></div><div><p className="text-muted-foreground">Drawings</p><p className="font-semibold">{fmt(row.drawings)}</p></div><div><p className="text-muted-foreground">Reports</p><p className="font-semibold">{fmt(row.reports)}</p></div><div><p className="text-muted-foreground">Storage</p><p className="font-semibold">{fmt(row.storage_mb)} MB</p></div></div></div>)}</div>}
      <div className="flex items-center justify-between text-sm pt-2"><span className="text-muted-foreground">Showing {total===0?0:(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,total)} of {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>void load(page-1)}><ChevronLeft className="h-4 w-4"/>Previous</Button><Button size="sm" variant="outline" disabled={!hasMore||loading} onClick={()=>void load(page+1)}>Next<ChevronRight className="h-4 w-4"/></Button></div></div>
     </div>
     <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">{metricNote||"Metrics reflect only existing usage_records counters."} No model token counts, AI provider costs, latency, or per-request logs are available from this source.</p>
    </>}
   </main>
  </div></div></SidebarProvider>
 </>;
}
