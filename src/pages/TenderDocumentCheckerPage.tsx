import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Loader2, Save, ShieldAlert } from "lucide-react";

type TenderResult = {
  summary: string;
  boq_items: { item: string; unit: string; qty: number; notes?: string }[];
  risks: { title: string; severity: "low" | "medium" | "high"; detail: string }[];
  deadlines: { event: string; date: string; notes?: string }[];
};

const CHECKS = [
  { label: "Tender / package reference", terms: ["tender", "package", "ift", "reference", "e-gp"] },
  { label: "Procuring entity / client", terms: ["procuring entity", "client", "authority", "employer", "department"] },
  { label: "Scope of work / specifications", terms: ["scope", "specification", "work description", "technical requirement"] },
  { label: "Eligibility and qualification criteria", terms: ["eligibility", "qualification", "experience", "turnover", "similar work"] },
  { label: "Submission deadline / opening date", terms: ["deadline", "submission", "closing date", "opening date", "last date"] },
  { label: "Tender security / EMD", terms: ["tender security", "earnest money", "emd", "security deposit"] },
  { label: "BOQ / price schedule", terms: ["boq", "bill of quantities", "price schedule", "schedule of rates"] },
  { label: "Required forms and supporting documents", terms: ["form", "certificate", "trade license", "tax", "vat", "nid", "affidavit"] },
  { label: "Evaluation criteria / award method", terms: ["evaluation", "award criteria", "lowest evaluated", "responsive tender"] },
  { label: "Contract conditions / completion period", terms: ["contract", "completion period", "liquidated damages", "defects liability", "payment terms"] },
];

export default function TenderDocumentCheckerPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TenderResult | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const checklist = useMemo(() => {
    const text = sourceText.toLowerCase();
    return CHECKS.map((check) => ({
      ...check,
      found: check.terms.some((term) => text.includes(term)),
    }));
  }, [sourceText]);
  const foundCount = checklist.filter((item) => item.found).length;

  const analyze = async () => {
    if (!sourceText.trim()) {
      toast.error("Paste tender document text before checking.");
      return;
    }
    if (sourceText.trim().length < 80) {
      toast.error("Please provide more tender text for a useful review.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-structured", {
        body: {
          mode: "tender",
          input: `Review this tender document for a civil construction bidder in Bangladesh. Extract only facts stated in the text; do not invent dates, quantities, eligibility rules, or legal requirements. Mark uncertainties as requiring manual verification. Document title: ${title || "Untitled tender"}\n\nDOCUMENT TEXT:\n${sourceText.slice(0, 60000)}`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const value = data?.result;
      if (!value || typeof value.summary !== "string" || !Array.isArray(value.risks) || !Array.isArray(value.deadlines) || !Array.isArray(value.boq_items)) {
        throw new Error("The AI response was incomplete. Please try again.");
      }
      setResult(value as TenderResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tender review failed.");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!user || !result) return;
    setSaving(true);
    const { error } = await supabase.from("tender_analyses").insert({
      user_id: user.id,
      title: title.trim() || "Tender document review",
      source_text: sourceText.slice(0, 20000),
      summary: result.summary,
      boq_items: result.boq_items,
      risks: result.risks,
      deadlines: result.deadlines,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Tender review saved to your account.");
  };

  const exportReport = () => {
    if (!result) return;
    const lines = [
      "CIVILOS AI — TENDER DOCUMENT CHECK",
      `Title: ${title || "Untitled tender"}`,
      `Checklist keyword indicators: ${foundCount}/${CHECKS.length}`,
      "",
      "EXECUTIVE SUMMARY",
      result.summary,
      "",
      "CHECKLIST (keyword indicators only; verify manually)",
      ...checklist.map((item) => `${item.found ? "[FOUND]" : "[NOT FOUND IN TEXT]"} ${item.label}`),
      "",
      "RISKS / ITEMS TO VERIFY",
      ...result.risks.map((risk) => `[${risk.severity.toUpperCase()}] ${risk.title}: ${risk.detail}`),
      "",
      "DEADLINES",
      ...result.deadlines.map((deadline) => `${deadline.date} — ${deadline.event}${deadline.notes ? " — " + deadline.notes : ""}`),
      "",
      "BOQ ITEMS",
      ...result.boq_items.map((item) => `${item.item} | ${item.unit} | ${item.qty}${item.notes ? " | " + item.notes : ""}`),
      "",
      "Important: AI-generated review only. Confirm all requirements, dates, quantities and contractual terms against the official tender documents.",
    ];
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "civilos-tender-check.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <SidebarProvider>
      <SEO title="Tender Document Checker — CivilOS AI" description="Review civil construction tender text, checklist completeness, deadlines, BOQ references and risk items." url="/tender-docs" />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <main className="flex-1 min-w-0">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <SidebarTrigger />
            <ClipboardCheck className="h-5 w-5 text-accent" />
            <div><h1 className="font-heading font-bold leading-tight">Tender Document Checker</h1><p className="text-xs text-muted-foreground">Pre-bid review and completeness indicators</p></div>
          </header>
          <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">Tender details and source text</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tender title / package number (optional)" />
                <Textarea rows={12} maxLength={60000} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste text copied from the official tender notice, instructions to tenderers, eligibility requirements, BOQ notes or contract conditions. This tool currently checks pasted text; it does not read uploaded PDF/DOC files." />
                <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{sourceText.length.toLocaleString()} / 60,000 characters</span><Button onClick={analyze} disabled={loading || !sourceText.trim()}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</> : <><FileText className="mr-2 h-4 w-4" />Check tender with AI</>}</Button></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5" /> Document completeness indicators <Badge variant="outline">{foundCount}/{CHECKS.length} found</Badge></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">This quick scan looks for keywords in the text you pasted. “Not found” does not prove a document is missing; wording or scanned PDFs may not be searchable.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {checklist.map((item) => <div key={item.label} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    {item.found ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                    <span>{item.label}</span><Badge className="ml-auto" variant={item.found ? "secondary" : "outline"}>{item.found ? "Found" : "Check"}</Badge>
                  </div>)}
                </div>
              </CardContent>
            </Card>

            {result && <div className="space-y-4">
              <Card><CardHeader><CardTitle className="text-lg">AI review</CardTitle></CardHeader><CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm leading-6">{result.summary}</p>
                <div className="flex flex-wrap gap-2"><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? "Saving…" : "Save review"}</Button><Button variant="outline" onClick={exportReport}>Export TXT report</Button></div>
              </CardContent></Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4" /> Risks and items to verify ({result.risks.length})</CardTitle></CardHeader><CardContent className="space-y-3">
                  {result.risks.length ? result.risks.map((risk, index) => <div key={index} className="rounded-md border p-3"><div className="flex items-center gap-2"><Badge variant={risk.severity === "high" ? "destructive" : "secondary"}>{risk.severity}</Badge><strong className="text-sm">{risk.title}</strong></div><p className="mt-2 text-sm text-muted-foreground">{risk.detail}</p></div>) : <p className="text-sm text-muted-foreground">No risks were returned. This is not a guarantee that the tender is risk-free.</p>}
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Deadlines identified ({result.deadlines.length})</CardTitle></CardHeader><CardContent className="space-y-3">
                  {result.deadlines.length ? result.deadlines.map((deadline, index) => <div key={index} className="rounded-md border p-3"><p className="font-medium text-sm">{deadline.event}</p><p className="font-mono text-xs text-primary">{deadline.date}</p>{deadline.notes && <p className="mt-1 text-sm text-muted-foreground">{deadline.notes}</p>}</div>) : <p className="text-sm text-muted-foreground">No deadline was identified in the provided text.</p>}
                </CardContent></Card>
              </div>
              <Card><CardHeader><CardTitle className="text-base">BOQ references extracted ({result.boq_items.length})</CardTitle></CardHeader><CardContent>
                {result.boq_items.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Item</th><th className="p-2 text-left">Unit</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Notes</th></tr></thead><tbody>{result.boq_items.map((item, index) => <tr key={index} className="border-b"><td className="p-2">{item.item}</td><td className="p-2">{item.unit}</td><td className="p-2 text-right">{item.qty}</td><td className="p-2">{item.notes || "—"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No BOQ items were identified in the provided text.</p>}
              </CardContent></Card>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>Use this as a preliminary review only. Verify every eligibility criterion, date, quantity, addendum, and contractual clause against the official tender package and relevant authority instructions before bidding.</p></div>
            </div>}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
