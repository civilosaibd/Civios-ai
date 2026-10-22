import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { ClipboardCheck, Download, Plus, Trash2, CalendarDays, ShieldAlert } from "lucide-react";

type BidItem = { id: string; label: string; done: boolean; note: string };
type BidPlan = { id: string; title: string; reference: string; deadline: string; client: string; estimatedValue: string; notes: string; items: BidItem[]; updatedAt: string };

const DEFAULT_ITEMS = [
  "Tender notice and instructions reviewed",
  "Eligibility and qualification criteria checked",
  "Trade licence and company registration verified",
  "Tax identification / tax clearance documents checked",
  "VAT/BIN and other required certificates checked",
  "Similar work experience and completion certificates collected",
  "Financial statements / solvency documents checked",
  "BOQ, specifications and addenda reviewed",
  "Bid security amount, format and validity confirmed",
  "Submission method, location and deadline confirmed",
];

const makeItems = (): BidItem[] => DEFAULT_ITEMS.map((label, i) => ({ id: `item-${i + 1}`, label, done: false, note: "" }));
const storageKey = (userId: string) => `civilos-bid-prep-v1:${userId}`;

export default function BidPreparationPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<BidPlan[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(storageKey(user.id));
      const saved = raw ? JSON.parse(raw) as BidPlan[] : [];
      setPlans(saved);
      setActiveId(saved[0]?.id ?? "");
    } catch {
      toast.error("Saved bid plans could not be read from this browser.");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const persist = (next: BidPlan[]) => {
    setPlans(next);
    if (!user) return;
    try {
      localStorage.setItem(storageKey(user.id), JSON.stringify(next));
    } catch {
      toast.error("Could not save. Your browser storage may be full or disabled.");
    }
  };

  const active = useMemo(() => plans.find(p => p.id === activeId) ?? null, [plans, activeId]);
  const completed = active?.items.filter(i => i.done).length ?? 0;
  const progress = active?.items.length ? Math.round((completed / active.items.length) * 100) : 0;

  const createPlan = () => {
    const plan: BidPlan = {
      id: crypto.randomUUID(),
      title: "New tender bid",
      reference: "",
      deadline: "",
      client: "",
      estimatedValue: "",
      notes: "",
      items: makeItems(),
      updatedAt: new Date().toISOString(),
    };
    const next = [plan, ...plans];
    persist(next);
    setActiveId(plan.id);
    toast.success("Bid workspace created.");
  };

  const updateActive = (patch: Partial<BidPlan>) => {
    if (!active) return;
    persist(plans.map(p => p.id === active.id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p));
  };

  const updateItem = (id: string, patch: Partial<BidItem>) => {
    if (!active) return;
    updateActive({ items: active.items.map(item => item.id === id ? { ...item, ...patch } : item) });
  };

  const removePlan = (id: string) => {
    if (!window.confirm("Delete this bid workspace from this browser? This cannot be undone.")) return;
    const next = plans.filter(p => p.id !== id);
    persist(next);
    if (activeId === id) setActiveId(next[0]?.id ?? "");
    toast.success("Bid workspace deleted.");
  };

  const exportReport = () => {
    if (!active) return;
    const lines = [
      "CivilOS AI — Bid Preparation Checklist",
      `Tender: ${active.title}`,
      `Reference: ${active.reference || "Not entered"}`,
      `Client / Procuring entity: ${active.client || "Not entered"}`,
      `Submission deadline: ${active.deadline || "Not entered"}`,
      `Estimated bid value: ${active.estimatedValue || "Not entered"}`,
      `Checklist progress: ${completed}/${active.items.length} (${progress}%)`,
      "",
      ...active.items.map(item => `[${item.done ? "x" : " "}] ${item.label}${item.note ? ` — ${item.note}` : ""}`),
      "",
      "Notes:",
      active.notes || "None",
      "",
      "Reminder: Verify all requirements against the official tender documents. This checklist is not legal, financial, or procurement advice.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bid-preparation-${(active.reference || active.title).replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported.");
  };

  if (authLoading || loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading bid workspace…</div>;

  return (
    <SidebarProvider>
      <SEO title="Bid Preparation — CivilOS AI" description="Organize tender bid requirements, deadlines, checklist progress and export a preparation report." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2"><SidebarTrigger /><ClipboardCheck className="h-4 w-4 text-accent" /><h1 className="font-heading font-semibold">Bid Preparation</h1></div>
            <ThemeToggle />
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div><h2 className="text-2xl font-semibold">Tender bid workspace</h2><p className="text-sm text-muted-foreground mt-1">Track documents, dates and readiness before submission.</p></div>
              <Button onClick={createPlan}><Plus className="h-4 w-4 mr-2" /> New bid workspace</Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
              <Card className="p-3 h-fit">
                <h3 className="font-semibold px-2 py-1">Your workspaces ({plans.length})</h3>
                {plans.length === 0 ? <p className="text-sm text-muted-foreground p-2">No bid workspaces yet. Create one to start.</p> : <div className="space-y-1 mt-2">
                  {plans.map(plan => <button key={plan.id} onClick={() => setActiveId(plan.id)} className={`w-full text-left rounded-md border p-3 ${activeId === plan.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`}>
                    <span className="block font-medium text-sm break-words">{plan.title || "Untitled tender"}</span>
                    <span className="block text-xs text-muted-foreground mt-1">{plan.reference || "No reference"}</span>
                    <span className="block text-xs mt-2">{plan.items.filter(i => i.done).length}/{plan.items.length} checked</span>
                  </button>)}
                </div>}
              </Card>
              {!active ? <Card className="p-8 flex flex-col items-center justify-center text-center min-h-64"><ClipboardCheck className="h-10 w-10 text-muted-foreground mb-3" /><h3 className="font-semibold">Start preparing a bid</h3><p className="text-sm text-muted-foreground mt-1 mb-4">Create a workspace to record tender details and track the required documents.</p><Button onClick={createPlan}>Create workspace</Button></Card> :
                <div className="space-y-4 min-w-0">
                  <Card className="p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{active.title || "Untitled tender"}</h3><p className="text-sm text-muted-foreground">Saved in this browser for the signed-in account.</p></div><div className="flex gap-2"><Button variant="outline" onClick={exportReport}><Download className="h-4 w-4 mr-2" /> Export TXT</Button><Button variant="ghost" size="icon" aria-label="Delete workspace" onClick={() => removePlan(active.id)}><Trash2 className="h-4 w-4" /></Button></div></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="text-sm font-medium">Tender title</label><Input className="mt-1" value={active.title} onChange={e => updateActive({ title: e.target.value })} placeholder="e.g. Road rehabilitation package" /></div>
                      <div><label className="text-sm font-medium">Tender / e-GP reference</label><Input className="mt-1" value={active.reference} onChange={e => updateActive({ reference: e.target.value })} placeholder="Tender ID or package number" /></div>
                      <div><label className="text-sm font-medium">Procuring entity / client</label><Input className="mt-1" value={active.client} onChange={e => updateActive({ client: e.target.value })} placeholder="Organization name" /></div>
                      <div><label className="text-sm font-medium">Submission deadline</label><Input className="mt-1" type="datetime-local" value={active.deadline} onChange={e => updateActive({ deadline: e.target.value })} /></div>
                      <div><label className="text-sm font-medium">Estimated bid value (optional)</label><Input className="mt-1" value={active.estimatedValue} onChange={e => updateActive({ estimatedValue: e.target.value })} placeholder="Enter amount and currency" /></div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Preparation progress</span><Badge variant={progress === 100 ? "default" : "secondary"}>{progress}% · {completed}/{active.items.length}</Badge></div>
                      <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
                    </div>
                  </Card>
                  <Card className="p-4 space-y-3">
                    <div><h3 className="font-semibold">Document and submission checklist</h3><p className="text-sm text-muted-foreground">Check items only after verifying the actual tender requirement.</p></div>
                    {active.items.map(item => <div key={item.id} className="border rounded-lg p-3 space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={item.done} onChange={e => updateItem(item.id, { done: e.target.checked })} /><span className={item.done ? "text-sm line-through text-muted-foreground" : "text-sm font-medium"}>{item.label}</span></label>
                      <Input aria-label={`Notes for ${item.label}`} className="ml-7 w-[calc(100%-1.75rem)]" value={item.note} onChange={e => updateItem(item.id, { note: e.target.value })} placeholder="Optional note, owner or expiry date" />
                    </div>)}
                  </Card>
                  <Card className="p-4 space-y-2"><h3 className="font-semibold">Internal notes</h3><Textarea rows={4} value={active.notes} onChange={e => updateActive({ notes: e.target.value })} placeholder="Clarifications to request, addenda to check, team responsibilities…" /><p className="text-xs text-muted-foreground">Last saved: {new Date(active.updatedAt).toLocaleString()}</p></Card>
                  <div className="flex gap-2 items-start rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" /><p>Use this as an internal tracker only. Requirements vary by tender and procuring entity; confirm every item, deadline, bid security and eligibility rule against the official documents. Do not treat checklist completion as proof of compliance.</p></div>
                </div>}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
