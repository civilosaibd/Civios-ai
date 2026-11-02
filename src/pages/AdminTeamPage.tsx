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
import { ShieldCheck, UserPlus, Copy, RefreshCw, UserCheck, UserX, Trash2, History } from "lucide-react";

type Permission = { id: string; membership_id: string; feature_key: string; action: string };
type Member = { id: string; user_id: string; role: "super_admin" | "sub_admin"; status: "active" | "suspended"; email: string | null; display_name: string | null; permissions: Permission[] };
type Invitation = { id: string; invited_email: string; status: string; expires_at: string; created_at: string };

export default function AdminTeamPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [members,setMembers] = useState<Member[]>([]);
  const [invitations,setInvitations] = useState<Invitation[]>([]);
  const [audit,setAudit] = useState<any[]>([]);
  const [email,setEmail] = useState("");
  const [inviteUrl,setInviteUrl] = useState("");
  const [busy,setBusy] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [permissionDraft,setPermissionDraft] = useState<Record<string,{users:string[];projects:string[];billing:string[];affiliate:string[]}>>({});

  useEffect(()=>{ if(!authLoading && !user) navigate("/auth?redirect=/admin/team"); },[user,authLoading,navigate]);

  const call = async (action:string,extra:Record<string,unknown>={}) => {
    const {data,error}=await supabase.functions.invoke("admin-rbac",{body:{action,...extra}});
    if(error || data?.error) throw new Error(data?.error || error?.message || "Admin team request failed");
    return data;
  };
  const load = useCallback(async()=>{
    setLoading(true);
    try {
      const data=await call("list");
      setMembers(data.memberships || []); setInvitations(data.invitations || []); setAudit(data.audit || []);
      const drafts:Record<string,{users:string[];projects:string[];billing:string[];affiliate:string[]}>={};
      for(const m of (data.memberships || []) as Member[]) drafts[m.id]={
        users:m.permissions.filter(p=>p.feature_key==="users").map(p=>p.action),
        projects:m.permissions.filter(p=>p.feature_key==="projects").map(p=>p.action),
        billing:m.permissions.filter(p=>p.feature_key==="billing").map(p=>p.action),
        affiliate:m.permissions.filter(p=>p.feature_key==="affiliate").map(p=>p.action),
      };
      setPermissionDraft(drafts);
    } catch(e:any) { toast.error(e.message || "Super Admin access required"); }
    setLoading(false);
  },[]);
  useEffect(()=>{ if(user) void load(); },[user,load]);

  const invite=async()=>{
    const value=email.trim().toLowerCase();
    if(!value) return toast.error("Enter the invitee email address.");
    setBusy("invite");
    try { const data=await call("invite",{email:value}); setInviteUrl(data.invite_url); setEmail(""); toast.success("Invitation created. Copy and share the secure link."); await load(); }
    catch(e:any){toast.error(e.message);}
    setBusy(null);
  };
  const updatePermissions=async(member:Member,featureKey:"users"|"projects"|"billing"|"affiliate")=>{
    const actions=permissionDraft[member.id]?.[featureKey] || [];
    setBusy(member.id);
    try { await call("set-permissions",{membershipId:member.id,featureKey,permissions:actions}); toast.success(`${featureKey==="users"?"Users":featureKey==="projects"?"Projects":featureKey==="billing"?"Billing":"Affiliate"} permissions updated.`); await load(); }
    catch(e:any){toast.error(e.message);}
    setBusy(null);
  };
  const setFeatureDraft=(membershipId:string,featureKey:"users"|"projects"|"billing"|"affiliate",action:"view"|"manage",checked:boolean)=>{
    setPermissionDraft(current=>{
      const previous=current[membershipId] || {users:[],projects:[],billing:[],affiliate:[]};
      let next=checked?[...new Set([...previous[featureKey],action])]:previous[featureKey].filter(value=>value!==action);
      if(action==="manage" && checked) next=[...new Set([...next,"view"])];
      if(action==="view" && !checked) next=next.filter(value=>value!=="manage");
      return {...current,[membershipId]:{...previous,[featureKey]:next}};
    });
  };
  const setStatus=async(member:Member,status:"active"|"suspended")=>{
    if(!window.confirm(`${status==="suspended"?"Suspend":"Reactivate"} sub-admin ${member.email || member.user_id}?`)) return;
    setBusy(member.id);
    try { await call("set-status",{membershipId:member.id,status}); toast.success(`Sub-admin ${status}.`); await load(); }
    catch(e:any){toast.error(e.message);}
    setBusy(null);
  };
  const remove=async(member:Member)=>{
    if(!window.confirm(`Permanently remove sub-admin access for ${member.email || member.user_id}? This also removes assigned feature permissions.`)) return;
    setBusy(member.id);
    try { await call("remove-subadmin",{membershipId:member.id}); toast.success("Sub-admin access removed."); await load(); }
    catch(e:any){toast.error(e.message);}
    setBusy(null);
  };
  const revoke=async(inv:Invitation)=>{
    if(!window.confirm(`Revoke invitation for ${inv.invited_email}?`)) return;
    setBusy(inv.id);
    try { await call("revoke-invitation",{invitationId:inv.id}); toast.success("Invitation revoked."); await load(); }
    catch(e:any){toast.error(e.message);}
    setBusy(null);
  };
  const copy=async(value:string)=>{
    try { await navigator.clipboard.writeText(value); toast.success("Copied to clipboard."); }
    catch { toast.error("Clipboard unavailable. Select and copy the link manually."); }
  };

  return <>
    <SEO title="Admin · Team & Permissions" description="Super Admin management for invited sub-admins and feature permissions." />
    <SidebarProvider><div className="min-h-screen flex w-full bg-muted/30"><DashboardSidebar /><div className="flex-1 min-w-0 flex flex-col">
      <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6"><SidebarTrigger/><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">Super Admin · Team & Permissions</h1><Button variant="ghost" size="icon" onClick={()=>void load()} aria-label="Refresh"><RefreshCw className="h-4 w-4"/></Button><NotificationBell/><ThemeToggle/></header>
      <main className="flex-1 p-4 md:p-6 space-y-5 max-w-6xl w-full mx-auto">
        <div className="rounded-xl border bg-card p-4 flex gap-3"><ShieldCheck className="h-5 w-5 text-primary mt-0.5"/><div><p className="font-medium text-sm">Super Admin controlled access</p><p className="text-xs text-muted-foreground mt-1">Only the primary Super Admin can invite, assign permissions, suspend or remove sub-admins. Users, Projects, Billing and Affiliate permissions are enabled; additional module permissions will appear only after their backend and database guards are integrated.</p></div></div>
        <section className="rounded-xl border bg-card p-5 space-y-3"><div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary"/><h2 className="font-semibold">Invite a Sub-Admin</h2></div><div className="flex flex-col sm:flex-row gap-2"><Input type="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void invite();}}/><Button onClick={()=>void invite()} disabled={busy==="invite"}><UserPlus className="h-4 w-4 mr-2"/>Create invitation</Button></div>{inviteUrl && <div className="rounded-lg bg-muted/50 p-3 space-y-2"><p className="text-xs font-medium">Secure invitation link · expires in 7 days</p><div className="flex flex-col sm:flex-row gap-2"><Input readOnly value={inviteUrl} className="text-xs"/><Button variant="outline" onClick={()=>void copy(inviteUrl)}><Copy className="h-4 w-4 mr-1"/>Copy link</Button></div><p className="text-[11px] text-muted-foreground">The invitation link is shown once. Share it only with the invited person. The app does not send invitation emails in this phase.</p></div>}</section>
        <section className="rounded-xl border bg-card overflow-hidden"><div className="p-4 border-b"><h2 className="font-semibold">Admin Team</h2><p className="text-xs text-muted-foreground">Super Admin is protected. Sub-admins can receive only permissions that have server-side guards: Users, Projects, Billing and Affiliate.</p></div>
          {loading?<div className="p-4 space-y-3"><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></div>:members.length===0?<p className="p-8 text-sm text-muted-foreground text-center">No memberships found.</p>:<div className="divide-y">{members.map(member=><article key={member.id} className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-2"><div className="flex-1 min-w-0"><p className="font-semibold text-sm">{member.display_name || member.email || "Admin account"}</p><p className="text-xs text-muted-foreground break-all">{member.email || member.user_id}</p></div><Badge variant={member.role==="super_admin"?"default":"secondary"}>{member.role.replace("_"," ")}</Badge><Badge variant={member.status==="active"?"outline":"destructive"}>{member.status}</Badge></div>
            {member.role==="sub_admin" && <><div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(["users","projects","billing","affiliate"] as const).map(featureKey=><div key={featureKey} className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold">{featureKey==="users"?"Users":featureKey==="projects"?"Projects":"Billing"} workspace permissions</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(permissionDraft[member.id]?.[featureKey]||[]).includes("view")} onChange={e=>setFeatureDraft(member.id,featureKey,"view",e.target.checked)}/>{featureKey==="users"?"View user directory and account details":featureKey==="projects"?"View project directory and project details":featureKey==="billing"?"View payments and subscription records":"View affiliate, referral and payout records"}</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(permissionDraft[member.id]?.[featureKey]||[]).includes("manage")} onChange={e=>setFeatureDraft(member.id,featureKey,"manage",e.target.checked)}/>{featureKey==="users"?"Manage user accounts (suspend / reactivate)":featureKey==="projects"?"Manage project status":featureKey==="billing"?"Verify or reject pending payments":"Review commissions and approve/reject payouts"}</label>
                <Button size="sm" onClick={()=>void updatePermissions(member,featureKey)} disabled={busy===member.id}>Save {featureKey} permissions</Button>
              </div>)}
            </div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy===member.id} onClick={()=>void setStatus(member,member.status==="active"?"suspended":"active")}>{member.status==="active"?<><UserX className="h-3.5 w-3.5 mr-1"/>Suspend</>:<><UserCheck className="h-3.5 w-3.5 mr-1"/>Reactivate</>}</Button><Button size="sm" variant="destructive" disabled={busy===member.id} onClick={()=>void remove(member)}><Trash2 className="h-3.5 w-3.5 mr-1"/>Remove access</Button></div></>}
          </article>)}</div>}
        </section>
        <section className="rounded-xl border bg-card overflow-hidden"><div className="p-4 border-b"><h2 className="font-semibold">Pending & Recent Invitations</h2></div>{invitations.length===0?<p className="p-6 text-sm text-muted-foreground">No invitations yet.</p>:<div className="divide-y">{invitations.map(inv=><div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2"><div className="flex-1 min-w-0"><p className="text-sm font-medium">{inv.invited_email}</p><p className="text-xs text-muted-foreground">Expires {new Date(inv.expires_at).toLocaleString()}</p></div><Badge variant={inv.status==="pending"?"secondary":"outline"}>{inv.status}</Badge>{inv.status==="pending"&&<Button size="sm" variant="outline" disabled={busy===inv.id} onClick={()=>void revoke(inv)}>Revoke</Button>}</div>)}</div>}</section>
        <section className="rounded-xl border bg-card overflow-hidden"><div className="p-4 border-b flex items-center gap-2"><History className="h-4 w-4"/><h2 className="font-semibold">RBAC Audit History</h2></div>{audit.length===0?<p className="p-6 text-sm text-muted-foreground">No RBAC actions recorded yet.</p>:<div className="divide-y">{audit.slice(0,30).map((event:any)=><div key={event.id} className="p-3 text-xs flex flex-col sm:flex-row gap-1 sm:gap-3"><span className="font-medium">{event.action.replaceAll("_"," ")}</span><span className="text-muted-foreground break-all flex-1">Target: {event.target_user_id || "—"} · {event.feature_key || ""} {event.permission_action || ""}</span><span className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span></div>)}</div>}</section>
      </main>
    </div></div></SidebarProvider>
  </>;
}
