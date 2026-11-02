import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FolderKanban, Search, RefreshCw, ChevronLeft, ChevronRight, Eye, ShieldCheck, MapPin, CalendarDays } from "lucide-react";

type Project = { id:string; user_id:string; name:string; file_name:string|null; is_public:boolean; created_at:string; updated_at:string; status:string; client_name:string|null; location:string|null; project_type:string|null; budget:number|null; start_date:string|null; end_date:string|null; owner_name:string|null; email:string|null; phone:string|null };
type ProjectDetails = { project:any; owner:any; documents:any[]; activity:any[]; members:any[]; security_notice:string };
const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const date = (value?:string|null) => value ? new Date(value).toLocaleString() : "—";

export default function AdminProjectManagementPage() {
  const { user } = useAuth(); const nav = useNavigate();
  const [authorized,setAuthorized] = useState(false);
  const [canManageProjects,setCanManageProjects] = useState(false);
  const [rows,setRows] = useState<Project[]>([]);
  const [page,setPage] = useState(1); const [total,setTotal] = useState(0); const [hasMore,setHasMore] = useState(false);
  const [search,setSearch] = useState(""); const [loading,setLoading] = useState(false);
  const [selected,setSelected] = useState<Project|null>(null); const [details,setDetails] = useState<ProjectDetails|null>(null);
  const [detailLoading,setDetailLoading] = useState(false); const [status,setStatus] = useState("");
  const [saving,setSaving] = useState(false);

  const load = useCallback(async (targetPage=page, term=search) => {
    setLoading(true);
    try {
      const {data,error} = await supabase.functions.invoke("admin-project-data",{body:{action:"list",page:targetPage,search:term}});
      if(error) throw error; if(data?.error) throw new Error(data.error);
      setRows(data.projects||[]); setPage(data.page||targetPage); setTotal(data.total||0); setHasMore(!!data.has_more);
    } catch(e:any) { toast.error(e?.message||"Could not load project directory."); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{let active=true;(async()=>{
    if(!user){nav("/auth?redirect=/admin/projects");return;}
    const [{data:legacyAdmin,error:legacyError},{data:superAdmin},{data:canView},{data:canManage}] = await Promise.all([
      supabase.rpc("has_role",{_user_id:user.id,_role:"admin"}),
      supabase.rpc("is_super_admin"),
      supabase.rpc("has_admin_permission",{_feature_key:"projects",_action:"view"}),
      supabase.rpc("has_admin_permission",{_feature_key:"projects",_action:"manage"}),
    ]);
    if(!active)return;
    if(legacyError || (legacyAdmin!==true && superAdmin!==true && canView!==true)){toast.error("Projects: View permission required");nav("/");return;}
    setCanManageProjects(legacyAdmin===true||superAdmin===true||canManage===true);
    setAuthorized(true); await load(1,"");
  })();return()=>{active=false;};},[user,nav,load]);

  const openDetails=async(project:Project)=>{
    setSelected(project);setDetails(null);setStatus(project.status||"planning");setDetailLoading(true);
    const {data,error}=await supabase.functions.invoke("admin-project-data",{body:{action:"details",projectId:project.id}});
    if(error||data?.error)toast.error(data?.error||"Unable to load project details.");
    else setDetails(data as ProjectDetails);
    setDetailLoading(false);
  };
  const updateStatus=async()=>{
    if(!selected||!status)return;
    if(!window.confirm(`Change project status to "${status}"?`))return;
    setSaving(true);
    const {data,error}=await supabase.functions.invoke("admin-project-data",{body:{action:"update-status",projectId:selected.id,status}});
    if(error||data?.error)toast.error(data?.error||"Project status update failed.");
    else {toast.success("Project status updated");setSelected({...selected,status});await load(page,search);await openDetails({...selected,status});}
    setSaving(false);
  };

  if(!authorized)return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Checking administrator access…</div>;
  return <div className="min-h-screen flex flex-col"><Navbar/><main className="flex-1 py-8"><div className="container max-w-7xl space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="flex items-center gap-2"><FolderKanban className="h-6 w-6 text-primary"/><h1 className="text-2xl md:text-3xl font-bold">Project Management</h1></div><p className="text-sm text-muted-foreground mt-1">All user projects with owner details, project data, documents and activity history. Every privileged detail view is audited.</p></div><Button variant="outline" onClick={()=>void load(page,search)} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading?"animate-spin":""}`}/>Refresh</Button></div>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3"><Card><CardContent className="pt-5"><FolderKanban className="h-5 w-5 text-primary mb-2"/><p className="text-xs text-muted-foreground">Projects in directory</p><p className="text-2xl font-bold">{total}</p></CardContent></Card><Card><CardContent className="pt-5"><ShieldCheck className="h-5 w-5 text-green-600 mb-2"/><p className="text-xs text-muted-foreground">Current page</p><p className="text-2xl font-bold">{rows.length} / 25</p></CardContent></Card><Card><CardContent className="pt-5"><CalendarDays className="h-5 w-5 text-primary mb-2"/><p className="text-xs text-muted-foreground">Page</p><p className="text-2xl font-bold">{page}</p></CardContent></Card></div>
    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search project, owner client or location…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void load(1,search);}}/></div><Button onClick={()=>void load(1,search)} disabled={loading}>Search</Button></div>
    <Card><CardHeader><CardTitle>Project Directory</CardTitle></CardHeader><CardContent>
      {loading&&rows.length===0?<p className="py-10 text-center text-sm text-muted-foreground">Loading projects…</p>:rows.length===0?<p className="py-10 text-center text-sm text-muted-foreground">No projects found.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Project</th><th className="p-3">Owner</th><th className="p-3">Type / Location</th><th className="p-3">Budget</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3">Details</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} className="border-b last:border-0"><td className="p-3"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.file_name||p.id}</p></td><td className="p-3"><p>{p.owner_name||"Name unavailable"}</p><p className="text-xs text-muted-foreground">{p.email||p.user_id}</p></td><td className="p-3"><p>{p.project_type||"—"}</p><p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3"/>{p.location||"—"}</p></td><td className="p-3">{p.budget==null?"—":`৳${Number(p.budget).toLocaleString()}`}</td><td className="p-3"><Badge variant="outline">{p.status||"planning"}</Badge></td><td className="p-3 text-xs text-muted-foreground">{date(p.updated_at)}</td><td className="p-3"><Button size="sm" variant="outline" onClick={()=>void openDetails(p)}><Eye className="h-4 w-4 mr-1"/>Inspect</Button></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between pt-4"><p className="text-xs text-muted-foreground">Showing {rows.length} of {total} projects · server-side search and pagination</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>void load(page-1,search)}><ChevronLeft className="h-4 w-4"/>Previous</Button><Button size="sm" variant="outline" disabled={!hasMore||loading} onClick={()=>void load(page+1,search)}>Next<ChevronRight className="h-4 w-4"/></Button></div></div>
    </CardContent></Card>
  </div></main><Footer/>
  <Dialog open={!!selected} onOpenChange={open=>{if(!open){setSelected(null);setDetails(null);}}}><DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto"><DialogHeader><DialogTitle>Project inspection</DialogTitle></DialogHeader>
    {detailLoading?<p className="py-10 text-center text-sm text-muted-foreground">Loading project records…</p>:details?<div className="space-y-5">
      <section className="rounded-xl border p-4 space-y-1"><h2 className="font-semibold text-lg">{details.project.name}</h2><p className="text-sm">{details.owner.name||"Owner"} · {details.owner.email||details.owner.id} · {details.owner.phone||"No phone"}</p><p className="text-xs text-muted-foreground">Project ID: {details.project.id} · Created {date(details.project.created_at)} · Updated {date(details.project.updated_at)}</p><p className="text-xs text-muted-foreground">{details.project.project_type||"Type unavailable"} · {details.project.location||"Location unavailable"} · {details.project.client_name||"No client"}</p></section>
      {canManageProjects && <section className="rounded-xl border p-4 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Project status</h3><div className="flex gap-2"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={status} onChange={e=>setStatus(e.target.value)}>{["planning","in_progress","on_hold","completed","cancelled"].map(x=><option key={x} value={x}>{x.replace("_"," ")}</option>)}</select><Button size="sm" onClick={()=>void updateStatus()} disabled={saving||status===details.project.status}>{saving?"Saving…":"Update status"}</Button></div></div><p className="text-xs text-muted-foreground">Status updates are recorded in the admin project audit trail.</p></section>}
      {(["inputs","estimate","bnbc_loads"] as const).map(key=><section key={key} className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold capitalize">{key.replace("_"," ")}</h3><Badge variant="secondary">{details.project[key]==null?"Empty":"Available"}</Badge></div><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/40 p-3 text-xs">{pretty(details.project[key])}</pre></section>)}
      <section className="space-y-2"><h3 className="font-semibold">Documents ({details.documents.length})</h3>{details.documents.length?details.documents.map(d=><div key={d.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{d.file_name}</p><p className="text-xs text-muted-foreground">{d.file_type||"File"} · {d.file_size?Math.round(d.file_size/1024)+" KB":"Size unknown"} · {date(d.created_at)}</p></div>):<p className="text-sm text-muted-foreground">No project document metadata found.</p>}</section>
      <section className="space-y-2"><h3 className="font-semibold">Team members ({details.members.length})</h3>{details.members.map(m=><div key={m.id} className="rounded-lg border p-2 text-xs">{m.user_id} · {m.role} · {m.status}</div>)}</section>
      <section className="space-y-2"><h3 className="font-semibold">Activity history ({details.activity.length})</h3>{details.activity.length?details.activity.map(a=><div key={a.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{a.action}</p><p className="text-xs text-muted-foreground">{a.user_id||"System"} · {date(a.created_at)}</p>{a.details&&<pre className="text-xs whitespace-pre-wrap break-all mt-2">{pretty(a.details)}</pre>}</div>):<p className="text-sm text-muted-foreground">No activity records found.</p>}</section>
      <p className="text-xs text-muted-foreground border-t pt-3 flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0"/>{details.security_notice}</p>
    </div>:<p className="py-6 text-sm text-muted-foreground">Project details unavailable.</p>}
  </DialogContent></Dialog>
  </div>;
}
