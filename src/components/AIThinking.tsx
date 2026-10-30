import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, Lightbulb, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downscaleForAnalysis, rasterizePdfPages } from "@/lib/viz/raster";
import type { DrawingType } from "@/lib/drawingUpload";

interface Analysis {
  summary?: string;
  drawingType?: DrawingType;
  detected?: {
    buildingType?: string;
    estimatedArea_sqft?: number | null;
    estimatedFloors?: number | null;
    rooms?: string[];
  };
  engineeringNotes?: string[];
  warnings?: string[];
  recommendations?: string[];
  estimateHints?: { suggestedQuality?: string; specialConsiderations?: string[] };
  engineeringInventory?: Array<{
    element: "wall" | "column" | "beam" | "slab" | "foundation" | "door" | "window" | "reinforcement";
    observedCount: number | null;
    floor: string | null;
    evidence: string;
    confidence: number;
  }>;
}

interface Props {
  file?: File | null;
  textContent?: string;
  fileName?: string;
  drawingType?: DrawingType;
  uploadWarnings?: string[];
  autoRun?: boolean;
  onAnalysis?: (analysis: Analysis, coverageComplete: boolean) => void;
  onAnalysisError?: () => void;
}

interface ImageInput { pageNumber: number; dataUrl: string }

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the prepared image."));
  reader.onerror = () => reject(new Error("Could not read the prepared image."));
  reader.readAsDataURL(blob);
});

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const stringArray = (candidate: unknown) => candidate === undefined
    || (Array.isArray(candidate) && candidate.every((entry) => typeof entry === "string"));
  const validTypes = ["architectural", "structural", "foundation", "column-layout", "beam-layout", "slab-layout", "floor-plan", "section", "elevation", "site-plan", "plumbing", "electrical", "road", "bridge", "general", "unknown"];
  if (typeof item.summary !== "string") return false;
  if (item.drawingType !== undefined && (typeof item.drawingType !== "string" || !validTypes.includes(item.drawingType))) return false;
  if (!stringArray(item.warnings) || !stringArray(item.engineeringNotes) || !stringArray(item.recommendations)) return false;
  if (item.engineeringInventory !== undefined) {
    if (!Array.isArray(item.engineeringInventory) || item.engineeringInventory.length > 100) return false;
    const validElements = ["wall", "column", "beam", "slab", "foundation", "door", "window", "reinforcement"];
    if (!item.engineeringInventory.every((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const row = entry as Record<string, unknown>;
      return typeof row.element === "string" && validElements.includes(row.element)
        && (row.observedCount === null || (typeof row.observedCount === "number" && Number.isInteger(row.observedCount) && row.observedCount >= 0))
        && (row.floor === null || typeof row.floor === "string")
        && typeof row.evidence === "string" && row.evidence.length <= 500
        && typeof row.confidence === "number" && Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1;
    })) return false;
  }
  if (item.detected !== undefined) {
    if (!item.detected || typeof item.detected !== "object" || Array.isArray(item.detected)) return false;
    const detected = item.detected as Record<string, unknown>;
    if (detected.buildingType !== undefined && typeof detected.buildingType !== "string") return false;
    if (detected.estimatedArea_sqft !== undefined && detected.estimatedArea_sqft !== null
      && (typeof detected.estimatedArea_sqft !== "number" || !Number.isFinite(detected.estimatedArea_sqft) || detected.estimatedArea_sqft <= 0)) return false;
    if (detected.estimatedFloors !== undefined && detected.estimatedFloors !== null
      && (typeof detected.estimatedFloors !== "number" || !Number.isInteger(detected.estimatedFloors) || detected.estimatedFloors < 1)) return false;
    if (!stringArray(detected.rooms)) return false;
  }
  return true;
}

const AIThinking = ({ file, textContent, fileName, drawingType, uploadWarnings = [], autoRun = false, onAnalysis, onAnalysisError }: Props) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [preparationWarnings, setPreparationWarnings] = useState<string[]>([]);
  const [thinkSteps] = useState([
    "📥 Validating and preparing drawing content…",
    "🔍 Reviewing each supplied page / CAD text…",
    "📐 Identifying drawing discipline and visible information…",
    "💡 Listing missing inputs and engineering cautions…",
  ]);

  const run = async () => {
    if (!file && !textContent) return;
    setLoading(true);
    setAnalysis(null);
    setAnalysisError(null);
    setPreparationWarnings([]);
    onAnalysisError?.();
    try {
      const images: ImageInput[] = [];
      let effectiveText = textContent || "";
      const warnings = [...uploadWarnings];

      if (file) {
        const ext = file.name.toLowerCase().split(".").pop();
        if (["jpg", "jpeg", "png", "webp"].includes(ext || "")) {
          const prepared = await downscaleForAnalysis(file);
          const imageBlob = prepared?.blob ?? file;
          images.push({ pageNumber: 1, dataUrl: await blobToDataUrl(imageBlob) });
          if (prepared) warnings.push("A compressed analysis copy was used. The original drawing remains unchanged.");
        } else if (ext === "pdf") {
          const result = await rasterizePdfPages(file, { maxPages: 5, maxSide: 1800, maxPageBytes: 1_400_000 });
          for (const page of result.pages) {
            images.push({ pageNumber: page.pageNumber, dataUrl: await blobToDataUrl(page.blob) });
          }
          if (result.omittedPages > 0) {
            warnings.push(`This PDF has ${result.totalPages} pages. Only the first ${result.pages.length} pages were sent for this analysis; ${result.omittedPages} page(s) were not analysed.`);
          }
        } else if (ext === "dxf") {
          if (!effectiveText) effectiveText = await file.text();
          if (effectiveText.length > 30_000) {
            warnings.push("The DXF text is longer than the current AI review limit. Only a bounded text excerpt is reviewed in this phase; use the CAD geometry workflow for full entity-level review.");
            effectiveText = effectiveText.slice(0, 30_000);
          }
        } else {
          throw new Error("This file type is not supported for drawing analysis. Use PDF, JPG, PNG, WEBP or ASCII DXF.");
        }
      }

      const totalImageBytes = images.reduce((sum, image) => sum + image.dataUrl.length, 0);
      if (totalImageBytes > 10 * 1024 * 1024) {
        throw new Error("The prepared drawing pages are too large for one safe analysis request. Split the PDF into smaller page groups or upload lower-resolution pages.");
      }

      setPreparationWarnings(warnings);
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          fileName: fileName || file?.name,
          mimeType: file?.type || (file?.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file?.name.toLowerCase().endsWith(".dxf") ? "application/dxf" : "image/unknown"),
          drawingType,
          ...(images.length > 0 ? { images } : {}),
          textContent: effectiveText,
          userPrompt: "Identify the drawing discipline and describe only information that is visibly supported by the supplied pages or CAD text. Do not treat image-derived dimensions, scale guesses, inferred room sizes, or defaults as verified measurements. List missing dimensions and ambiguities explicitly. This is not a quantity takeoff or construction estimate.",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!isAnalysis(data?.analysis)) throw new Error("The analysis service returned an incomplete or invalid result. Please retry or upload a clearer drawing.");
      setAnalysis(data.analysis);
      const coverageComplete = !warnings.some((warning) => /not analysed|bounded text excerpt|first 5 MB|review limit/i.test(warning));
      onAnalysis?.(data.analysis, coverageComplete);
      toast.success("Drawing review completed. Review all warnings and missing information.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI analysis failed";
      setAnalysisError(message);
      onAnalysisError?.();
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const runRef = useRef(run);
  const autoRunFileRef = useRef<File | null>(null);
  runRef.current = run;
  useEffect(() => {
    if (!autoRun || !file || autoRunFileRef.current === file) return;
    autoRunFileRef.current = file;
    void runRef.current();
  }, [autoRun, file]);

  return (
    <div className="bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <div>
            <h3 className="font-heading font-bold">AI Drawing Review</h3>
            <p className="text-xs text-muted-foreground">Preliminary visual/text review — not a verified quantity takeoff.</p>
          </div>
        </div>
        <Button size="sm" onClick={run} disabled={loading || (!file && !textContent)}>
          {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analysing…</> : "Run Drawing Analysis"}
        </Button>
      </div>

      {loading && (
        <ul className="space-y-1.5 text-sm">
          {thinkSteps.map((step, index) => (
            <li key={index} className="flex items-center gap-2 text-muted-foreground animate-pulse" style={{ animationDelay: `${index * 200}ms` }}>
              {step}
            </li>
          ))}
        </ul>
      )}

      {analysisError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {analysisError}
        </div>
      )}

      {preparationWarnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="font-semibold text-xs flex items-center gap-1 mb-2 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />UPLOAD / COVERAGE NOTES</p>
          <ul className="space-y-1 list-disc list-inside text-xs">{preparationWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </div>
      )}

      {analysis && (
        <div className="space-y-4 text-sm">
          {analysis.summary && (
            <div className="bg-card rounded-lg p-3">
              <p className="font-semibold text-xs text-muted-foreground mb-1">ANALYSIS SUMMARY</p>
              <p>{analysis.summary}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-card rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">SUGGESTED DRAWING TYPE</p>
              <p className="font-semibold capitalize">{(analysis.drawingType || drawingType || "unknown").replace(/-/g, " ")}</p>
            </div>
            {analysis.detected?.buildingType && <div className="bg-card rounded-lg p-2"><p className="text-[10px] text-muted-foreground">BUILDING TYPE</p><p className="font-semibold">{analysis.detected.buildingType}</p></div>}
            {analysis.detected?.estimatedFloors != null && <div className="bg-card rounded-lg p-2"><p className="text-[10px] text-muted-foreground">AI FLOOR INDICATION</p><p className="font-semibold">{analysis.detected.estimatedFloors} (unverified)</p></div>}
            {analysis.detected?.rooms && analysis.detected.rooms.length > 0 && <div className="bg-card rounded-lg p-2"><p className="text-[10px] text-muted-foreground">ROOM LABELS</p><p className="font-semibold text-xs">{analysis.detected.rooms.length}</p></div>}
            {analysis.detected?.estimatedArea_sqft != null && <div className="bg-card rounded-lg p-2"><p className="text-[10px] text-muted-foreground">AI AREA INDICATION</p><p className="font-semibold">{analysis.detected.estimatedArea_sqft} sqft (unverified)</p></div>}
          </div>

          {analysis.engineeringInventory && analysis.engineeringInventory.length > 0 && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div>
                <p className="font-semibold text-xs">ENGINEERING ELEMENT OBSERVATIONS</p>
                <p className="text-[11px] text-muted-foreground">AI visual observations only — counts and locations are unverified and must be checked against the source drawing.</p>
              </div>
              <div className="space-y-2">
                {analysis.engineeringInventory.map((item, index) => (
                  <div key={`${item.element}-${item.floor ?? "unknown"}-${index}`} className="grid grid-cols-[90px_1fr_auto] items-start gap-2 border-b last:border-0 pb-2 last:pb-0">
                    <span className="text-xs font-medium capitalize">{item.element}</span>
                    <span className="text-xs text-muted-foreground">{item.evidence}{item.floor ? ` · ${item.floor}` : ""}</span>
                    <span className="text-xs font-semibold tabular-nums">{item.observedCount === null ? "Not countable" : `${item.observedCount} · ${Math.round(item.confidence * 100)}% cue`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.warnings && analysis.warnings.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="font-semibold text-xs flex items-center gap-1 mb-2 text-destructive"><AlertTriangle className="h-3 w-3" />WARNINGS / MISSING INFORMATION</p>
              <ul className="space-y-1 list-disc list-inside text-xs">{analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
            </div>
          )}

          {analysis.engineeringNotes && analysis.engineeringNotes.length > 0 && (
            <div>
              <p className="font-semibold text-xs flex items-center gap-1 mb-2"><CheckCircle2 className="h-3 w-3 text-primary" />OBSERVATIONS</p>
              <ul className="space-y-1 list-disc list-inside text-xs text-muted-foreground">{analysis.engineeringNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>
            </div>
          )}

          {analysis.recommendations && analysis.recommendations.length > 0 && (
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
              <p className="font-semibold text-xs flex items-center gap-1 mb-2 text-accent"><Lightbulb className="h-3 w-3" />NEXT REVIEW ACTIONS</p>
              <ul className="space-y-1 list-disc list-inside text-xs">{analysis.recommendations.map((recommendation, index) => <li key={index}>{recommendation}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground flex items-center gap-2"><FileImage className="h-3.5 w-3.5" />AI-detected values are unverified clues only. Do not use them as dimensions for pricing or construction.</p>
        </div>
      )}
    </div>
  );
};

export default AIThinking;
