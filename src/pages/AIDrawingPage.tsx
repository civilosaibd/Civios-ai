import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DraftingCompass, FileText, ClipboardCopy, Download, ExternalLink, Ruler, ShieldCheck, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";

const drawingTypes = [
  { value: "floor-plan", label: "Architectural floor plan" },
  { value: "site-plan", label: "Site / plot layout" },
  { value: "structural", label: "Structural drawing review brief" },
  { value: "plumbing", label: "Plumbing layout brief" },
  { value: "electrical", label: "Electrical layout brief" },
  { value: "detail", label: "Construction detail / section" },
];

export default function AIDrawingPage() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [drawingType, setDrawingType] = useState("floor-plan");
  const [plotSize, setPlotSize] = useState("");
  const [units, setUnits] = useState("feet");
  const [floors, setFloors] = useState("1");
  const [roadSide, setRoadSide] = useState("south");
  const [rooms, setRooms] = useState("");
  const [requirements, setRequirements] = useState("");
  const [constraints, setConstraints] = useState("Use locally applicable building rules and verify setbacks before design approval.");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiResult, setAiResult] = useState("");

  const brief = useMemo(() => [
    "CIVILOS AI — DRAWING WORKSPACE BRIEF",
    `Project: ${projectName.trim() || "Untitled project"}`,
    `Drawing type: ${drawingTypes.find((x) => x.value === drawingType)?.label ?? drawingType}`,
    `Plot / drawing dimensions: ${plotSize.trim() || "Not provided"} ${units}`,
    `Number of floors: ${floors || "Not specified"}`,
    `Road access side: ${roadSide}`,
    `Rooms / spaces: ${rooms.trim() || "Not specified"}`,
    `Requirements: ${requirements.trim() || "Not provided"}`,
    `Constraints and checks: ${constraints.trim() || "Confirm applicable requirements with the responsible professional."}`,
    "",
    "OUTPUT EXPECTATIONS",
    "- List assumptions and missing inputs before proposing a layout.",
    "- Show dimensions and units consistently; do not invent site measurements.",
    "- Identify accessibility, circulation, ventilation, drainage and coordination questions relevant to this drawing type.",
    "- Cite applicable local codes only when verified; flag anything requiring professional review.",
    "- Do not present concept output as a permit-ready or construction-ready drawing.",
  ].join("\n"), [projectName, drawingType, plotSize, units, floors, roadSide, rooms, requirements, constraints]);

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      toast.success("Drawing brief copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Clipboard access unavailable. Use Download brief instead.");
    }
  };

  const downloadBrief = () => {
    const blob = new Blob([brief], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "civilos-ai-drawing-brief.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Brief downloaded");
  };

  const generateDrawingConcept = async () => {
    if (generating) return;
    setGenerating(true);
    setAiResult("");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        toast.error("Please sign in to generate an AI drawing concept.");
        navigate("/auth?redirect=/ai-drawing");
        return;
      }

      const prompt = [
        "You are CivilOS AI Drawing Assistant for building design concepts in Bangladesh.",
        "Create a useful preliminary architectural drawing concept from the supplied brief. Reply in clear Bangla, while keeping technical terms and dimensions understandable.",
        "Structure the result as: 1) assumptions and missing information, 2) suggested space arrangement, 3) room/space schedule table, 4) circulation, daylight and ventilation notes, 5) setback/code checks to verify, 6) next steps for producing a dimensioned CAD plan.",
        "Never invent plot dimensions that were not supplied, never claim permit approval or structural adequacy, and mark every assumed measurement clearly. Ask for missing critical information instead of presenting it as fact.",
        "This response is a design concept, not a DWG/DXF or construction-ready drawing. Do not claim a CAD file was generated.",
        "Drawing brief:",
        brief,
      ].join("\n\n");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({ error: "AI drawing request failed." }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let output = "";
      const applySseLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") return;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            output += delta;
            setAiResult(output);
          }
        } catch {
          // Ignore non-JSON SSE keep-alive lines.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        lines.forEach(applySseLine);
      }
      if (buffer.trim()) applySseLine(buffer);
      if (!output.trim()) throw new Error("The AI returned an empty concept. Please try again.");
      toast.success("AI drawing concept generated. Review assumptions before use.");
    } catch (error) {
      setAiResult("");
      toast.error(error instanceof Error ? error.message : "AI drawing generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const copyAiResult = async () => {
    if (!aiResult) return;
    try {
      await navigator.clipboard.writeText(aiResult);
      toast.success("AI drawing concept copied.");
    } catch {
      toast.error("Clipboard access unavailable. Use Download concept instead.");
    }
  };

  const downloadAiResult = () => {
    if (!aiResult) return;
    const blob = new Blob([aiResult], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "civilos-ai-drawing-concept.md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("AI drawing concept downloaded.");
  };

  return (
    <SidebarProvider>
      <SEO title="AI Drawing Workspace — CivilOS AI" description="Prepare a structured civil drawing brief and continue with the existing floor-plan generator or drawing file assistant." url="/ai-drawing" />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <main className="flex-1 min-w-0">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <div className="flex items-center gap-2"><SidebarTrigger /><DraftingCompass className="h-5 w-5 text-primary" /><h1 className="font-heading font-semibold">AI Drawing Workspace</h1></div>
            <ThemeToggle />
          </header>
          <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-[1.15fr_.85fr]">
            <section className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Drawing preparation and workflow hub</p>
                <h2 className="mt-1 text-2xl font-bold md:text-3xl">Describe the drawing you need</h2>
                <p className="mt-2 text-sm text-muted-foreground">Prepare a reusable brief, then open the existing plan generator or file assistant for the relevant workflow.</p>
              </div>
              <Card>
                <CardHeader><CardTitle>Project and drawing requirements</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5"><Label>Project name</Label><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={120} placeholder="e.g. Two-storey family residence" /></div>
                  <div className="space-y-1.5"><Label>Drawing type</Label><Select value={drawingType} onValueChange={setDrawingType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{drawingTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Plot / drawing dimensions</Label><Input value={plotSize} onChange={(e) => setPlotSize(e.target.value)} maxLength={80} placeholder="e.g. 40 × 60" /></div>
                    <div className="space-y-1.5"><Label>Units</Label><Select value={units} onValueChange={setUnits}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="feet">Feet</SelectItem><SelectItem value="metres">Metres</SelectItem><SelectItem value="millimetres">Millimetres</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1.5"><Label>Number of floors</Label><Input type="number" min="1" max="50" value={floors} onChange={(e) => setFloors(String(Math.max(1, Math.min(50, Number(e.target.value) || 1))))} /></div>
                    <div className="space-y-1.5"><Label>Road access side</Label><Select value={roadSide} onValueChange={setRoadSide}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="north">North</SelectItem><SelectItem value="south">South</SelectItem><SelectItem value="east">East</SelectItem><SelectItem value="west">West</SelectItem><SelectItem value="not-applicable">Not applicable</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="space-y-1.5"><Label>Rooms / spaces</Label><Input value={rooms} onChange={(e) => setRooms(e.target.value)} maxLength={300} placeholder="e.g. 3 bedrooms, 2 bathrooms, kitchen, stair, parking" /></div>
                  <div className="space-y-1.5"><Label>Special requirements</Label><Textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} maxLength={2000} rows={4} placeholder="Describe orientation, room sizes, budget constraints, accessibility or preferred layout." /></div>
                  <div className="space-y-1.5"><Label>Constraints and checks</Label><Textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} maxLength={1000} rows={3} /></div>
                </CardContent>
              </Card>
            </section>
            <aside className="space-y-4">
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Generated drawing brief</CardTitle></CardHeader><CardContent className="space-y-3">
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs leading-5">{brief}</pre>
                <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => void copyBrief()}><ClipboardCopy className="mr-2 h-4 w-4" />{copied ? "Copied" : "Copy brief"}</Button><Button onClick={downloadBrief}><Download className="mr-2 h-4 w-4" />Download .txt</Button></div>
                <Button className="w-full" onClick={() => void generateDrawingConcept()} disabled={generating}>
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {generating ? "Generating concept…" : "Generate AI drawing concept"}
                </Button>
              </CardContent></Card>
              {aiResult && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI drawing concept</CardTitle></CardHeader><CardContent className="space-y-3">
                <div className="max-h-[520px] overflow-auto rounded-lg border bg-background p-3 text-sm leading-6 prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{aiResult}</ReactMarkdown></div>
                <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => void copyAiResult()}><ClipboardCopy className="mr-2 h-4 w-4" />Copy concept</Button><Button onClick={downloadAiResult}><Download className="mr-2 h-4 w-4" />Download concept</Button></div>
                <p className="text-xs text-muted-foreground">Concept only — this does not generate a DWG/DXF file or replace code review by a qualified local professional.</p>
              </CardContent></Card>}
                            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Ruler className="h-5 w-5 text-primary" />Continue your workflow</CardTitle></CardHeader><CardContent className="space-y-3">
                <Button asChild className="w-full"><Link to="/plan-generator">Open floor-plan generator <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
                <Button asChild variant="outline" className="w-full"><Link to="/file-assistant">Analyze an existing drawing <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
                <div className="rounded-lg border p-3 text-xs text-muted-foreground"><ShieldCheck className="mb-2 h-4 w-4 text-primary" />This workspace creates a structured brief; it does not claim to generate a full CAD/BIM file. Review dimensions, local code compliance and structural decisions with a qualified professional before construction.</div>
              </CardContent></Card>
            </aside>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
