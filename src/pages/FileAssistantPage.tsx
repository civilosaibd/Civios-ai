import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import AIThinking from "@/components/AIThinking";
import { FileUp, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { DRAWING_ACCEPT, inspectDrawingFile, type DrawingInspection, type DrawingType } from "@/lib/drawingUpload";

const FileAssistantPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState<string>("");
  const [inspection, setInspection] = useState<DrawingInspection | null>(null);
  const [drawingType, setDrawingType] = useState<DrawingType>("unknown");

  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);

  const onPick = async (f: File) => {
    setFile(null);
    setTextContent("");
    setInspection(null);
    const checked = await inspectDrawingFile(f);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    let text = "";
    if (checked.kind === "dxf") {
      try {
        text = await f.text();
        if (!/\\bSECTION\\b/i.test(text) || !/\\bENTITIES\\b/i.test(text)) {
          toast.error("DXF does not contain a readable ENTITIES section. Re-export it as ASCII DXF.");
          return;
        }
      } catch {
        toast.error("Could not read this DXF file.");
        return;
      }
    }
    setFile(f);
    setTextContent(text);
    setInspection(checked);
    setDrawingType(checked.drawingType);
  };

  if (authLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <>
      <SEO title="File Assistant — CivilOS AI" description="Upload drawings, plans, or documents and get instant BNBC-aware AI engineering analysis." url="/file-assistant" />
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <DashboardSidebar />
          <main className="flex-1">
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <SidebarTrigger />
              <FileText className="h-5 w-5 text-accent" />
              <div>
                <h1 className="font-heading font-bold leading-tight">File Assistant</h1>
                <p className="text-xs text-muted-foreground leading-tight">Upload drawings, photos, plans or docs — AI will analyse.</p>
              </div>
            </header>

            <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
              <Card>
                <CardContent className="p-5">
                  {!file ? (
                    <label className="block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/5 transition">
                      <input type="file" accept={DRAWING_ACCEPT} className="hidden" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) void onPick(selected); e.currentTarget.value = ""; }} />
                      <FileUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-semibold">Click to upload a file</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, WEBP or ASCII DXF · up to 20 MB. DWG must be exported as DXF first.</p>
                    </label>
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB • {file.type || "unknown"}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => { setFile(null); setTextContent(""); setInspection(null); }}><X className="h-4 w-4" /></Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {file && inspection && (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="text-sm font-semibold">File validation passed · {inspection.mimeType}</p>
                    <label className="block text-xs font-medium" htmlFor="assistant-drawing-type">Drawing type (confirm or correct)</label>
                    <select id="assistant-drawing-type" className="w-full h-10 rounded-lg border bg-background px-3 text-sm" value={drawingType} onChange={(e) => setDrawingType(e.target.value as DrawingType)}>
                      {["unknown","architectural","structural","foundation","column-layout","beam-layout","slab-layout","floor-plan","section","elevation","site-plan","plumbing","electrical","road","bridge","general"].map((type) => <option key={type} value={type}>{type.replace(/-/g, " ")}</option>)}
                    </select>
                    {inspection.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-700 dark:text-amber-400">⚠ {warning}</p>)}
                  </div>
                  <AIThinking
                  file={file}
                  fileName={file.name}
                  textContent={textContent}
                  drawingType={drawingType}
                  uploadWarnings={inspection.warnings}
                  onAnalysis={() => toast.success("Analysis ready")}
                />
                </div>
              )}
            </div>
          </main>
        </div>
      </SidebarProvider>
    </>
  );
};

export default FileAssistantPage;
