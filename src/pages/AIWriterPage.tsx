import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { Copy, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";

const DOCUMENT_TYPES = [
  "Site Progress Report",
  "Technical Letter",
  "Method Statement",
  "Site Inspection Report",
  "Project Memo",
  "Tender Clarification",
  "Meeting Minutes",
  "Work Completion Report",
];

export default function AIWriterPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [language, setLanguage] = useState("English");
  const [projectName, setProjectName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const generate = async () => {
    if (!details.trim()) {
      toast.error("Please enter the key details first.");
      return;
    }
    if (details.length > 12000) {
      toast.error("Please keep the details under 12,000 characters.");
      return;
    }

    setGenerating(true);
    setResult("");
    const prompt = [
      "You are the CivilOS AI Office Writer for civil engineering and construction work in Bangladesh.",
      "Create a complete, professional, ready-to-edit document from the user-provided facts.",
      "Do not invent dates, measurements, approvals, contract numbers, legal clauses, or technical results. Use [Add ...] only when essential information is missing.",
      "Keep engineering claims cautious and clearly flag items requiring engineer/site verification.",
      `Document type: ${documentType}`,
      `Output language: ${language}`,
      `Project name: ${projectName.trim() || "Not provided"}`,
      `Recipient / addressed to: ${recipient.trim() || "Not provided"}`,
      "User-provided facts and instructions:",
      details.trim(),
      "Return only the finished document with a suitable title, clear sections, and a professional closing where appropriate.",
    ].join("\n\n");

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let output = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const chunk = JSON.parse(data).choices?.[0]?.delta?.content;
            if (chunk) {
              output += chunk;
              setResult(output);
            }
          } catch {
            // Ignore non-JSON SSE lines such as keep-alive events.
          }
        }
      }
      if (!output.trim()) throw new Error("The AI returned an empty document. Please try again.");
      toast.success("Document generated. Review it before using.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      toast.success("Document copied to clipboard.");
    } catch {
      toast.error("Clipboard access was blocked by the browser.");
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `civilos-${documentType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <>
      <SEO title="AI Office Writer — CivilOS AI" description="Draft construction reports, technical letters, method statements and project documents." url="/ai-writer" />
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <DashboardSidebar />
          <main className="flex-1 min-w-0">
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <SidebarTrigger />
              <FileText className="h-5 w-5 text-accent" />
              <div>
                <h1 className="font-heading font-bold leading-tight">AI Office Writer</h1>
                <p className="text-xs text-muted-foreground">Construction and civil engineering documents</p>
              </div>
            </header>

            <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-lg">Document details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium">
                      Document type
                      <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      Language
                      <select value={language} onChange={(e) => setLanguage(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option>English</option>
                        <option>Bangla</option>
                        <option>Bangla and English</option>
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-1 text-sm font-medium">
                    Project name (optional)
                    <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={160} placeholder="e.g. Sample Residence" />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">
                    Recipient / addressed to (optional)
                    <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={160} placeholder="e.g. Project Manager" />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">
                    Key facts and instructions
                    <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={12000} rows={10} placeholder="Describe the purpose, dates, site activities, progress, quantities, issues, required actions, and any facts the document must include." />
                    <span className="block text-right text-xs text-muted-foreground">{details.length.toLocaleString()} / 12,000</span>
                  </label>
                  <Button onClick={generate} disabled={generating || !details.trim()} className="w-full">
                    {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {generating ? "Generating document…" : "Generate document"}
                  </Button>
                  <p className="text-xs text-muted-foreground">AI may make mistakes. Verify all technical values, dates, contractual statements and approvals before issuing the document.</p>
                </CardContent>
              </Card>

              <Card className="min-h-[420px]">
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-lg">Generated document</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyResult} disabled={!result || generating}><Copy className="mr-1 h-4 w-4" /> Copy</Button>
                    <Button variant="outline" size="sm" onClick={downloadResult} disabled={!result || generating}><Download className="mr-1 h-4 w-4" /> TXT</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {result ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                      <ReactMarkdown>{result}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      {generating ? "The document will appear here as it is generated…" : "Choose a document type, add the facts, and generate your first draft."}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </SidebarProvider>
    </>
  );
}
