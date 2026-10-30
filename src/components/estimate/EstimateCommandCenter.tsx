import { Activity, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, Download, FileSpreadsheet, Layers3, Save, Share2, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  projectName: string; plotSize: string; floors: number; quality: string;
  floorArea: number; projectCost: number; costPerSqft: number; duration: number;
  materialCost: number; laborCost: number; boqCount: number;
  costBreakdown: { category: string; amount: number }[];
  currency: (value: number) => string; fmt: (value: number) => string;
  onPdf: () => void; onSave: () => void; onWorkspace: () => void; onShare: () => void;
  saving: boolean; savingWorkspace: boolean; canSaveWorkspace: boolean; signedIn: boolean;
};

const palette = ["#f59e0b", "#0ea5e9", "#10b981", "#8b5cf6", "#f97316", "#64748b"];

export default function EstimateCommandCenter(props: Props) {
  const { projectName, plotSize, floors, quality, floorArea, projectCost, costPerSqft, duration, materialCost, laborCost, boqCount, costBreakdown, currency, fmt, onPdf, onSave, onWorkspace, onShare, saving, savingWorkspace, canSaveWorkspace, signedIn } = props;
  const positive = costBreakdown.filter((item) => Number.isFinite(item.amount) && item.amount > 0).sort((a,b) => b.amount-a.amount);
  const allocationTotal = positive.reduce((sum,item)=>sum+item.amount,0);
  const top = positive[0];
  const materialShare = projectCost > 0 ? materialCost/projectCost*100 : 0;
  const metrics = [
    { label: "Quotation total", value: currency(projectCost), detail: "Including configured contractor margin", icon: Wallet },
    { label: "Total floor area", value: `${fmt(floorArea)} sqft`, detail: `${floors} floor(s) · ${plotSize}`, icon: Layers3 },
    { label: "Cost per sqft", value: currency(costPerSqft), detail: "Based on quotation total", icon: BarChart3 },
    { label: "Indicative duration", value: `${duration} months`, detail: "Preliminary planning schedule", icon: CalendarDays },
  ];
  return <section aria-labelledby="estimate-command-title" className="scroll-mt-6 space-y-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:p-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300"><Sparkles className="h-3.5 w-3.5"/> ESTIMATE COMMAND CENTER</div>
        <h2 id="estimate-command-title" className="text-2xl font-bold tracking-tight md:text-3xl">Project overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">{projectName} · {quality} quality · Live values from the current estimate inputs.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onPdf} className="bg-orange-500 text-white hover:bg-orange-600"><Download className="mr-2 h-4 w-4"/>Professional PDF</Button>
        <Button variant="outline" onClick={onSave} disabled={saving}><Save className="mr-2 h-4 w-4"/>{saving ? "Saving…" : signedIn ? "Save project" : "Sign in to save"}</Button>
        <Button variant="outline" onClick={onWorkspace} disabled={savingWorkspace || !canSaveWorkspace} title={!canSaveWorkspace ? "Save the project first to enable workspace save" : "Save full estimate snapshot"}><FileSpreadsheet className="mr-2 h-4 w-4"/>{savingWorkspace ? "Saving…" : "Workspace"}</Button>
        <Button variant="ghost" onClick={onShare}><Share2 className="mr-2 h-4 w-4"/>Share</Button>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({label,value,detail,icon:Icon},index)=><article key={label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${index===0?"bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300":"bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}><Icon className="h-4 w-4"/></span></div>
        <p className="mt-3 break-words text-xl font-bold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </article>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Budget composition</h3><p className="mt-1 text-xs text-muted-foreground">Current estimate engine cost breakdown · {positive.length} categories</p></div><Badge variant="outline">Live allocation</Badge></div>
        {positive.length ? <><div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-label="Budget allocation bar">{positive.map((item,index)=><div key={item.category} title={item.category} style={{width:`${allocationTotal>0?item.amount/allocationTotal*100:0}%`,backgroundColor:palette[index%palette.length]}}/>)}</div><div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">{positive.slice(0,6).map((item,index)=><div key={item.category} className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor:palette[index%palette.length]}}/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-medium">{item.category}</span><span className="shrink-0 tabular-nums text-muted-foreground">{(item.amount/allocationTotal*100).toFixed(1)}%</span></div><p className="mt-0.5 text-xs font-semibold tabular-nums">{currency(item.amount)}</p></div></div>)}</div></> : <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No cost breakdown is available yet.</p>}
        <p className="mt-4 border-t pt-3 text-[11px] leading-5 text-muted-foreground">Category allocation is based on listed estimate-engine costs; it may differ from quotation total when separate adjustments or contractor margin apply.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><ArrowUpRight className="h-4 w-4"/><p className="text-xs font-semibold uppercase tracking-wide">Largest cost category</p></div><p className="mt-2 text-lg font-bold">{top?.category ?? "Not available"}</p><p className="mt-1 text-sm text-muted-foreground">{top ? currency(top.amount) + " · " + (top.amount/allocationTotal*100).toFixed(1) + "% of listed breakdown" : "No positive category amount"}</p></div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20"><div className="flex items-center gap-2 text-sky-700 dark:text-sky-300"><Activity className="h-4 w-4"/><p className="text-xs font-semibold uppercase tracking-wide">Material cost share</p></div><p className="mt-2 text-lg font-bold">{materialShare.toFixed(1)}%</p><p className="mt-1 text-sm text-muted-foreground">{currency(materialCost)} listed material cost · {boqCount} BOQ lines available</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900"><div className="h-full rounded-full bg-sky-600" style={{width:`${Math.min(100,Math.max(0,materialShare))}%`}}/></div><p className="mt-2 text-xs text-muted-foreground">Labor schedule: {currency(laborCost)} · verify overlapping cost scopes before adding totals.</p></div>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs text-slate-200"><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400"/>Figures update from the current project inputs and selected rates.</span><span className="inline-flex items-center gap-2 text-amber-200"><Activity className="h-3.5 w-3.5"/>Preliminary estimate · Professional verification required</span></div>
  </section>;
}
