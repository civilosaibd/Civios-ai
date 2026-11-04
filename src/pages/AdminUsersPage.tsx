import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, RefreshCw, Search, ShieldAlert, Eye, Ban, UserCheck, ChevronLeft, ChevronRight } from "lucide-react";

type Account = { id:string; email:string|null; phone:string|null; display_name:string|null; email_confirmed_at:string|null; created_at:string; last_sign_in_at:string|null; role:string; is_suspended:boolean; banned_until:string|null; subscription:any };
export default function AdminUsersPage(){
  const {user,loading:authLoading}=useAuth(); const navigate=useNavigate();
  const [accounts,setAccounts]=useState<Account[]>([]); const [page,setPage]=useState(1); const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true); const [search,setSearch]=useState(""); const [searchInput,setSearchInput]=useState("");
  const [selected,setSelected]=useState<Account|null>(null); const [details,setDetails]=useState<any|null>(null); const [detailsLoading,setDetailsLoading]=useState(false); const [busy,setBusy]=useState<string|null>(null); const [auditOpen,setAuditOpen]=useState(false); const [auditRows,setAuditRows]=useState<any[]>([]); const [auditLoading,setAuditLoading]=useState(false); const [canViewUsers,setCanViewUsers]=useState(false); const [canSeeAudit,setCanSeeAudit]=useState(false);
  useEffect(()=>{if(!authLoading&&!user)navigate("/auth?redirect=/admin/users");},[user,authLoading,navigate]);
  const load=useCallback(async(nextPage=1,append=false)=>{
    setLoading(true);
    const {data,error}=await supabase.functions.invoke("admin-user-data",{body:{action:"list",page:nextPage}});
    if(error||data?.error){toast.error(data?.error||error?.message||"Users permission required");if(!append)setAccounts([]);setHasMore(false);}
    else{const rows=data.users||[];setAccounts(current=>append?[...current,...rows]:rows);setPage(nextPage);setHasMore(!!data.has_more);}
    setLoading(false);
  },[]);
  useEffect(()=>{if(!user)return;let active=true;void (async()=>{const [{data:superAdmin,error:superError},{data:legacyAdmin,error:legacyError},{data:usersView,error:usersError},{data:auditView,error:auditError}]=await Promise.all([supabase.rpc("is_super_admin"),supabase.rpc("has_role",{_user_id:user.id,_role:"admin"}),supabase.rpc("has_admin_permission",{_feature_key:"users",_action:"view"}),supabase.rpc("has_admin_permission",{_feature_key:"audit",_action:"view"})]);if(!active)return;if(superError||legacyError||usersError||auditError){setCanViewUsers(false);setCanSeeAudit(false);setLoading(false);return;}const mayViewUsers=superAdmin===true||legacyAdmin===true||usersView===true;setCanViewUsers(mayViewUsers);setCanSeeAudit(superAdmin===true||legacyAdmin===true||auditView===true);if(mayViewUsers)void load(1);else setLoading(false);})();return()=>{active=false;};},[user,load]);
  const filtered=useMemo(()=>accounts.filter(a=>[a.display_name,a.email,a.phone,a.id].some(v=>String(v||"").toLowerCase().includes(search.toLowerCase()))),[accounts,search]);
  const openDetails=async(account:Account)=>{
    setSelected(account);setDetails(null);setDetailsLoading(true);
    const {data,error}=await supabase.functions.invoke("admin-user-data",{body:{action:"details",userId:account.id}});
    if(error||data?.error)toast.error(data?.error||"Unable to load account details.");else setDetails(data);
    setDetailsLoading(false);
  };
  const loadAudit=async()=>{
    setAuditLoading(true);
    const {data,error}=await supabase.functions.invoke("admin-user-data",{body:{action:"audit-list",limit:100}});
    if(error||data?.error)toast.error(data?.error||"Audit view permission is required to view this history.");
    else{setAuditRows(data.events||[]);setAuditOpen(true);}
    setAuditLoading(false);
  };
  const setStatus=async(account:Account,status:"suspended"|"active")=>{
    const reason=status==="suspended"?(window.prompt("Reason for suspension (minimum 8 characters):")||"").trim():"";
    if(status==="suspended"&&reason.length<8)return toast.error("A clear reason is required.");
    if(!window.confirm(`${status==="suspended"?"Suspend":"Reactivate"} ${account.email||account.id}?`))return;
    setBusy(account.id);
    const {data,error}=await supabase.functions.invoke("admin-user-data",{body:{action:"account-status",userId:account.id,status,reason}});
    if(error||data?.error)toast.error(data?.error||"Account status update failed.");
    else{setAccounts(rows=>rows.map(row=>row.id===account.id?{...row,is_suspended:data.status==="suspended",banned_until:data.user?.banned_until||null}:row));toast.success(status==="suspended"?"Account suspended":"Account reactivated");}
    setBusy(null);
  };
  return <>
    <SEO title="Admin · User Accounts" description="User directory and audited account status controls."/>
    <SidebarProvider><div className="min-h-screen flex w-full bg-muted/30"><DashboardSidebar/><div className="flex-1 min-w-0 flex flex-col">
      <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6"><SidebarTrigger/><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">{canViewUsers?"User Accounts":"Access Audit"}</h1>{canSeeAudit&&<Button variant="outline" size="sm" onClick={()=>void loadAudit()} disabled={auditLoading} className="inline-flex"><ShieldAlert className="h-4 w-4 mr-1"/>{auditLoading?"Loading…":"Access Audit"}</Button>}{canViewUsers&&<Button variant="ghost" size="icon" onClick={()=>void load(page)} aria-label="Refresh"><RefreshCw className="h-4 w-4"/></Button>}<NotificationBell/><ThemeToggle/></header>
      <main className="flex-1 p-4 md:p-6 space-y-4 max-w-7xl w-full mx-auto">
        {canViewUsers ? <>
        <div className="rounded-xl border bg-card p-4 flex gap-3"><Users className="h-5 w-5 text-primary mt-0.5"/><div><p className="font-medium text-sm">Permission-controlled user directory</p><p className="text-xs text-muted-foreground mt-1">Only accounts and limited profile metadata are shown. Private files, payment account identifiers, credentials, tokens and agent memory values are excluded. Account suspension blocks new sign-ins; existing access tokens may remain valid until expiry.</p></div></div>
        <div className="flex flex-col sm:flex-row gap-2"><div className="flex-1 flex gap-2"><Input value={searchInput} onChange={e=>setSearchInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")setSearch(searchInput.trim());}} placeholder="Search loaded users by name, email, phone or UUID"/><Button variant="outline" onClick={()=>setSearch(searchInput.trim())}><Search className="h-4 w-4"/></Button></div><Badge variant="outline" className="h-10 px-3">{accounts.length} loaded · page {page}</Badge></div>
        <div className="rounded-xl border bg-card overflow-hidden"><div className="p-4 border-b"><h2 className="font-semibold">Registered accounts</h2><p className="text-xs text-muted-foreground">100 accounts per page · search applies to loaded page(s)</p></div>
          {loading?<div className="p-4 space-y-3"><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-full"/></div>:filtered.length===0?<div className="p-10 text-center text-sm text-muted-foreground"><ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-40"/>No accounts found in loaded pages.</div>:<div className="divide-y">{filtered.map(account=><article key={account.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 min-w-0"><p className="font-semibold text-sm">{account.display_name||"Unnamed user"}</p><p className="text-xs text-muted-foreground break-all">{account.email||account.phone||account.id}</p><p className="text-xs text-muted-foreground mt-1">Joined {new Date(account.created_at).toLocaleDateString()} · Last sign-in {account.last_sign_in_at?new Date(account.last_sign_in_at).toLocaleString():"Never"}</p></div>
            <div className="flex flex-wrap items-center gap-2"><Badge variant={account.email_confirmed_at?"default":"secondary"}>{account.email_confirmed_at?"Verified":"Unverified"}</Badge><Badge variant={account.is_suspended?"destructive":"outline"}>{account.is_suspended?"Suspended":"Active"}</Badge><Badge variant="outline">{account.subscription?.status||"No subscription"}</Badge></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>void openDetails(account)}><Eye className="h-3.5 w-3.5 mr-1"/>Details</Button><Button size="sm" variant={account.is_suspended?"default":"destructive"} disabled={busy===account.id||account.role!=="user"||account.id===user?.id} title={account.role!=="user"?"Admin team accounts are protected":account.id===user?.id?"You cannot suspend your own account":undefined} onClick={()=>void setStatus(account,account.is_suspended?"active":"suspended")}>{account.is_suspended?<><UserCheck className="h-3.5 w-3.5 mr-1"/>Reactivate</>:<><Ban className="h-3.5 w-3.5 mr-1"/>Suspend</>}</Button></div>
          </article>)}</div>}
          <div className="p-3 border-t flex justify-between items-center gap-2"><p className="text-xs text-muted-foreground">Page {page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>void load(page-1)}><ChevronLeft className="h-4 w-4 mr-1"/>Previous</Button><Button size="sm" variant="outline" disabled={!hasMore||loading} onClick={()=>void load(page+1,true)}>Load next page<ChevronRight className="h-4 w-4 ml-1"/></Button></div></div>
        </div>
        </> : canSeeAudit ? <div className="rounded-xl border bg-card p-6 space-y-2"><ShieldAlert className="h-6 w-6 text-primary"/><h2 className="font-semibold">Audit access only</h2><p className="text-sm text-muted-foreground">Your assigned permission allows you to review privileged account-access events. User directory and account-management controls are not available with this permission.</p><Button variant="outline" onClick={()=>void loadAudit()} disabled={auditLoading}>{auditLoading?"Loading…":"Open Access Audit"}</Button></div> : <div className="rounded-xl border bg-card p-6"><h2 className="font-semibold">Access not granted</h2><p className="text-sm text-muted-foreground mt-1">Your account does not have Users view or Audit view permission for this page.</p></div>}
      </main>
    </div></div></SidebarProvider>
    <Dialog open={auditOpen} onOpenChange={setAuditOpen}><DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Privileged User Access Audit</DialogTitle></DialogHeader>{auditRows.length===0?<p className="text-sm text-muted-foreground">No privileged access events found.</p>:<div className="space-y-2">{auditRows.map((row:any)=><div key={row.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><Badge variant="outline">{row.action}</Badge><span className="text-xs text-muted-foreground">{new Date(row.occurred_at||row.accessed_at).toLocaleString()}</span></div><p className="text-xs text-muted-foreground mt-2">Admin: {row.admin_email||row.admin_user_id} · Target: {row.target_email||row.target_user_id}</p>{row.result&&<p className="text-xs mt-1">Result: {row.result}</p>}{row.reason&&<p className="text-xs text-muted-foreground mt-1">Reason: {row.reason}</p>}</div>)}</div>}</DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={open=>{if(!open){setSelected(null);setDetails(null);}}}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>User account details</DialogTitle></DialogHeader>{detailsLoading?<Skeleton className="h-48 w-full"/>:details?<div className="space-y-4"><div className="rounded-lg border p-3 space-y-1"><p className="font-semibold">{details.user?.metadata?.full_name||details.user?.metadata?.name||details.user?.email}</p><p className="text-xs text-muted-foreground break-all">{details.user?.email} · {details.user?.phone||"No phone"}</p><p className="text-xs text-muted-foreground">Email verified: {details.user?.email_confirmed_at?"Yes":"No"} · Status: {details.user?.is_suspended?"Suspended":"Active"}</p><p className="text-xs text-muted-foreground">Created: {details.user?.created_at?new Date(details.user.created_at).toLocaleString():"—"} · Providers: {(details.user?.providers||[]).join(", ")||"—"}</p></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{Object.entries(details.records||{}).map(([key,value])=><div key={key} className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{key.replaceAll("_"," ")}</p><p className="text-lg font-semibold">{Array.isArray(value)?value.length:0}</p></div>)}</div>{details.unavailable_tables?.length>0&&<p className="text-xs text-muted-foreground">Unavailable data sources: {details.unavailable_tables.join(", ")}</p>}<p className="text-xs text-muted-foreground">{details.security_notice}</p></div>:<p className="text-sm text-muted-foreground">No detail data.</p>}</DialogContent></Dialog>
  </>;
}
