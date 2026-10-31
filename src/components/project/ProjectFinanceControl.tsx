import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wallet, TrendingDown, TrendingUp, Download, PlusCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listProjectArtifacts, saveProjectArtifact } from "@/lib/projectArtifacts";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type CostKind = "material" | "contractor" | "labor" | "equipment" | "transport" | "other";
type Entry = { id: string; kind: "expense" | "income"; category: CostKind | "client_payment" | "other_income"; title: string; party: string; date: string; amount: number; quantity?: number; unit?: string; unitRate?: number; status: "planned" | "due" | "paid"; method: string; reference: string; notes: string };
type Budget = { id: string; category: CostKind; amount: number };
type FinanceData = { currency: "BDT"; budgets: Budget[]; entries: Entry[] };
const EMPTY: FinanceData = { currency: "BDT", budgets: [], entries: [] };
const categories: {value:CostKind;label:string}[] = [{value:"material",label:"Materials"},{value:"contractor",label:"Contractor"},{value:"labor",label:"Labor"},{value:"equipment",label:"Equipment"},{value:"transport",label:"Transport"},{value:"other",label:"Other"}];
const money = (n:number) => "৳" + Math.round(n).toLocaleString("en-BD");
const today = () => new Date().toISOString().slice(0,10);
const newId = () => globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ProjectFinanceControl({ projectId }: { projectId: string }) {
  const [data,setData] = useState<FinanceData>(EMPTY);
  const [artifactId,setArtifactId] = useState<string>();
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [loadError,setLoadError] = useState("");
  const [budget,setBudget] = useState({category:"material" as CostKind,amount:""});
  const [entry,setEntry] = useState({kind:"expense" as "expense"|"income",category:"material" as CostKind,title:"",party:"",date:today(),amount:"",quantity:"",unit:"",unitRate:"",status:"paid" as Entry["status"],method:"Bank",reference:"",notes:""});

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const items = await listProjectArtifacts(projectId);
      const found = items.find(x=>x.artifact_type==="project-finance-control");
      setArtifactId(found?.id);
      const raw = (found?.data || {}) as Partial<FinanceData>;
      const budgets = Array.isArray(raw.budgets) ? raw.budgets.filter(x=>x && typeof x.amount==="number" && Number.isFinite(x.amount)) : [];
      const entries = Array.isArray(raw.entries) ? raw.entries.filter(x=>x && typeof x.amount==="number" && Number.isFinite(x.amount) && (x.kind==="income" || x.kind==="expense")) : [];
      setData({currency:"BDT",budgets,entries});
    } catch(e) { const msg=e instanceof Error?e.message:"Project finance could not be loaded."; setLoadError(msg); toast.error(msg); }
    finally { setLoading(false); }
  },[projectId,user]);
  useEffect(()=>{ void load(); },[load]);

  const persist = async (next:FinanceData) => {
    if (!projectId || loadError || !canEdit) { toast.error("You have read-only access to this project finance register."); return; }
    setSaving(true);
    try {
      const saved=await saveProjectArtifact({id:artifactId,projectId,artifactType:"project-finance-control",title:"Project Finance & Cost Control",description:"Budget, project expenses, purchases, contractor payments and income register",data:next as unknown as Record<string,unknown>});
      setArtifactId(saved.id); setData(next);
    } catch(e) { toast.error(e instanceof Error?e.message:"Could not save project finance."); throw e; }
    finally { setSaving(false); }
  };

  const summary=useMemo(()=>{
    const expenses=data.entries.filter(x=>x.kind==="expense");
    const income=data.entries.filter(x=>x.kind==="income");
    const actual=expenses.filter(x=>x.status==="paid").reduce((s,x)=>s+x.amount,0);
    const committed=expenses.filter(x=>x.status!=="paid").reduce((s,x)=>s+x.amount,0);
    const received=income.filter(x=>x.status==="paid").reduce((s,x)=>s+x.amount,0);
    const receivable=income.filter(x=>x.status!=="paid").reduce((s,x)=>s+x.amount,0);
    const totalBudget=data.budgets.reduce((s,x)=>s+x.amount,0);
    return {actual,committed,received,receivable,totalBudget,remaining:totalBudget-actual-committed};
  },[data]);

  const addBudget=async(e:FormEvent)=>{
    e.preventDefault(); const amount=Number(budget.amount);
    if(!Number.isFinite(amount)||amount<=0){toast.error("Enter a valid budget amount.");return;}
    const next={...data,budgets:[...data.budgets.filter(x=>x.category!==budget.category),{id:newId(),category:budget.category,amount}]};
    try{await persist(next);setBudget({...budget,amount:""});toast.success("Budget saved.");}catch{}
  };
  const addEntry=async(e:React.FormEvent)=>{
    e.preventDefault(); const amount=Number(entry.amount);
    if(!entry.title.trim()||!Number.isFinite(amount)||amount<=0){toast.error("Description and a valid amount are required.");return;}
    const quantity=entry.quantity===""?undefined:Number(entry.quantity);
    const unitRate=entry.unitRate===""?undefined:Number(entry.unitRate);
    if((quantity!==undefined&&(!Number.isFinite(quantity)||quantity<=0))||(unitRate!==undefined&&(!Number.isFinite(unitRate)||unitRate<0))){toast.error("Check quantity and unit rate.");return;}
    const nextEntry:Entry={...entry,id:newId(),title:entry.title.trim().slice(0,160),party:entry.party.trim().slice(0,160),amount,date:entry.date,quantity,unit:entry.unit.trim().slice(0,24),unitRate,reference:entry.reference.trim().slice(0,80),notes:entry.notes.trim().slice(0,800)};
    try{await persist({...data,entries:[nextEntry,...data.entries]});setEntry({...entry,title:"",party:"",amount:"",quantity:"",unitRate:"",reference:"",notes:"",date:today()});toast.success("Project financial entry saved.");}catch{}
  };
  const updateStatus=async(item:Entry,status:Entry["status"])=>{
    try{await persist({...data,entries:data.entries.map(x=>x.id===item.id?{...x,status}:x)});toast.success("Payment status updated.");}catch{}
  };
  const removeEntry=async(id:string)=>{
    if(!window.confirm("Delete this financial entry?"))return;
    try{await persist({...data,entries:data.entries.filter(x=>x.id!==id)});toast.success("Entry deleted.");}catch{}
  };
  const exportCsv=()=>{
    const rows=[["Type","Category","Description","Party","Date","Amount BDT","Status","Method","Reference","Quantity","Unit","Unit Rate","Notes"],...data.entries.map(x=>[x.kind,x.category,x.title,x.party,x.date,x.amount,x.status,x.method,x.reference,x.quantity??"",x.unit??"",x.unitRate??"",x.notes])];
    const csv="\ufeff"+rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="civilos-project-finance.csv";a.click();URL.revokeObjectURL(url);
  };
  const categoryLabel=(c:string)=>categories.find(x=>x.value===c)?.label||c.replace(/_/g," ");
  const budgetByCategory=(category:CostKind)=>data.entries.filter(x=>x.kind==="expense"&&x.category===category).reduce((s,x)=>s+x.amount,0);

  return <SidebarProvider><div className="flex min-h-screen w-full"><DashboardSidebar/><main className="flex-1 min-w-0 p-4 md:p-6 space-y-5 overflow-x-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><SidebarTrigger/><div><h1 className="text-xl font-bold">Project Finance & Cost Control</h1><p className="text-xs text-muted-foreground">Project-scoped financial register · Bangladeshi Taka (BDT)</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>void load()} disabled={loading}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button><Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1"/>Export CSV</Button></div></div>
    {loadError&&<Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">Could not load this project's finance register. Saving is disabled to protect existing data. {loadError}</CardContent></Card>}
    {loading?<div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading project finance…</div>:<>
    <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground flex gap-1"><Wallet className="h-3.5 w-3.5"/>Total Budget</p><p className="text-lg font-bold">{money(summary.totalBudget)}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground flex gap-1"><TrendingDown className="h-3.5 w-3.5"/>Actual Paid Cost</p><p className="text-lg font-bold">{money(summary.actual)}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Committed / Due</p><p className="text-lg font-bold">{money(summary.committed)}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground flex gap-1"><TrendingUp className="h-3.5 w-3.5"/>Received Income</p><p className="text-lg font-bold">{money(summary.received)}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Receivable</p><p className="text-lg font-bold">{money(summary.receivable)}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Budget Remaining*</p><p className={`text-lg font-bold ${summary.remaining<0?"text-destructive":""}`}>{money(summary.remaining)}</p></CardContent></Card>
    </div>
    {!canEdit&&<Card className="border-amber-500/40"><CardContent className="p-3 text-sm text-muted-foreground">Viewer access — you can review and export financial records, but cannot change them.</CardContent></Card>}\n    <Card><CardHeader><CardTitle>Budget vs Actual Cost</CardTitle></CardHeader><CardContent className="space-y-3">
      {categories.map(c=>{const b=data.budgets.find(x=>x.category===c.value)?.amount||0;const actual=budgetByCategory(c.value);const pct=b>0?Math.min(100,actual/b*100):0;return <div key={c.value} className="space-y-1"><div className="flex justify-between gap-2 text-sm"><span>{c.label}</span><span className="text-muted-foreground">{money(actual)} / {money(b)}{b>0&&actual>b?<Badge variant="destructive" className="ml-2">Over budget</Badge>:null}</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{width:`${pct}%`}}/></div></div>;})}
      <form onSubmit={addBudget} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 border-t pt-3"><div><Label>Budget category</Label><Select value={budget.category} onValueChange={(v:CostKind)=>setBudget({...budget,category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{categories.map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Budget amount (৳)</Label><Input type="number" min="0.01" step="0.01" value={budget.amount} onChange={e=>setBudget({...budget,amount:e.target.value})}/></div><Button className="self-end" type="submit" disabled={saving||!!loadError||!canEdit}><PlusCircle className="h-4 w-4 mr-1"/>Set Budget</Button></form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>New Financial Entry</CardTitle></CardHeader><CardContent><form onSubmit={addEntry} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div><Label>Entry type</Label><Select value={entry.kind} onValueChange={(v:"expense"|"income")=>setEntry({...entry,kind:v,category:v==="income"?"client_payment":"material"})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="expense">Expense / Payment</SelectItem><SelectItem value="income">Income / Client Payment</SelectItem></SelectContent></Select></div>
      <div><Label>Category</Label><Select value={entry.category} onValueChange={(v:Entry["category"])=>setEntry({...entry,category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(entry.kind==="expense"?categories:[{value:"client_payment",label:"Client Payment"},{value:"other_income",label:"Other Income"}]).map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Description / Work</Label><Input required value={entry.title} onChange={e=>setEntry({...entry,title:e.target.value})} placeholder="Cement purchase / slab work"/></div>
      <div><Label>Vendor / Client / Contractor</Label><Input value={entry.party} onChange={e=>setEntry({...entry,party:e.target.value})}/></div>
      <div><Label>Date</Label><Input type="date" value={entry.date} onChange={e=>setEntry({...entry,date:e.target.value})}/></div>
      <div><Label>Amount (৳)</Label><Input required type="number" min="0.01" step="0.01" value={entry.amount} onChange={e=>setEntry({...entry,amount:e.target.value})}/></div>
      <div><Label>Quantity (optional)</Label><Input type="number" min="0.001" step="any" value={entry.quantity} onChange={e=>setEntry({...entry,quantity:e.target.value})}/></div>
      <div><Label>Unit (optional)</Label><Input value={entry.unit} onChange={e=>setEntry({...entry,unit:e.target.value})} placeholder="bag, kg, m³, day"/></div>
      <div><Label>Unit Rate (৳, optional)</Label><Input type="number" min="0" step="any" value={entry.unitRate} onChange={e=>setEntry({...entry,unitRate:e.target.value})}/></div>
      <div><Label>Payment status</Label><Select value={entry.status} onValueChange={(v:Entry["status"])=>setEntry({...entry,status:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="planned">Planned</SelectItem><SelectItem value="due">Due / Unpaid</SelectItem><SelectItem value="paid">Paid / Received</SelectItem></SelectContent></Select></div>
      <div><Label>Payment method</Label><Select value={entry.method} onValueChange={v=>setEntry({...entry,method:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Cash","Bank","bKash","Nagad","Cheque","Other"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Voucher / Reference No.</Label><Input value={entry.reference} onChange={e=>setEntry({...entry,reference:e.target.value})}/></div>
      <div className="sm:col-span-2 lg:col-span-4"><Label>Notes</Label><Input value={entry.notes} onChange={e=>setEntry({...entry,notes:e.target.value})}/></div>
      <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={saving||!!loadError||!canEdit}><PlusCircle className="h-4 w-4 mr-1"/>Save Entry</Button>{saving&&<span className="ml-2 text-xs text-muted-foreground">Saving…</span>}</div>
    </form></CardContent></Card>
    <Card><CardHeader><CardTitle>Project Expense & Payment Register</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[850px]"><thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="p-2">Date</th><th className="p-2">Type / Category</th><th className="p-2">Description / Party</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Method / Ref</th><th className="p-2">Action</th></tr></thead><tbody>{data.entries.length===0?<tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No project financial entries yet.</td></tr>:data.entries.map(x=><tr key={x.id} className="border-b align-top text-sm"><td className="p-2">{x.date}</td><td className="p-2"><Badge variant="outline">{x.kind}</Badge><p className="text-xs text-muted-foreground mt-1">{categoryLabel(x.category)}</p></td><td className="p-2">{x.title}<p className="text-xs text-muted-foreground">{x.party}{x.quantity? ` · ${x.quantity} ${x.unit||""}`:""}</p>{x.notes&&<p className="text-xs text-muted-foreground">{x.notes}</p>}</td><td className="p-2 font-medium">{money(x.amount)}</td><td className="p-2"><Select value={x.status} onValueChange={(v:Entry["status"])=>void updateStatus(x,v)} disabled={saving||!!loadError}><SelectTrigger className="h-8 w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="planned">Planned</SelectItem><SelectItem value="due">Due</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select></td><td className="p-2">{x.method}<p className="text-xs text-muted-foreground">{x.reference}</p></td><td className="p-2"><Button size="sm" variant="ghost" onClick={()=>void removeEntry(x.id)} disabled={saving||!!loadError||!canEdit}>Delete</Button></td></tr>)}</tbody></table></CardContent></Card>
    <p className="text-xs text-muted-foreground">*Remaining budget = total category budgets minus paid and committed expenses. This is a project bookkeeping aid, not audited accounting, tax advice or a bank reconciliation. Keep original invoices, vouchers and approvals as supporting records.</p>
    </>}
  </main></div></SidebarProvider>;
}
