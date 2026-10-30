import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import AIThinking from "@/components/AIThinking";
import { Button } from "@/components/ui/button";
import { FileImage, ArrowRight, FileCode } from "lucide-react";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { parseDXF, type DxfSummary } from "@/lib/dxfParser";
import { toast } from "sonner";
import DistrictRates from "@/components/DistrictRates";
import { getTodayRates, type DistrictRates as DistrictRatesT } from "@/lib/marketRates";
import { useUnits } from "@/lib/UnitsContext";
import { convertLength, type UnitSystem } from "@/lib/units";
import { DRAWING_ACCEPT, detectDrawingType, inspectDrawingFile, type DrawingInspection, type DrawingType } from "@/lib/drawingUpload";
import { analyzeDxfEngineeringDrawing, compareArchitecturalStructuralDrawings, type DxfEngineeringAnalysis } from "@/lib/engineering/dxfEngineeringAnalysis";

const UploadPage = () => {
  const [dxfSummary, setDxfSummary] = useState<DxfSummary | null>(null);
  const [dxfEngineering, setDxfEngineering] = useState<DxfEngineeringAnalysis | null>(null);
  const [companionDxfFile, setCompanionDxfFile] = useState<File | null>(null);
  const [companionDxfAnalysis, setCompanionDxfAnalysis] = useState<DxfEngineeringAnalysis | null>(null);
  const [companionDrawingType, setCompanionDrawingType] = useState<DrawingType>("unknown");
  const [inspection, setInspection] = useState<DrawingInspection | null>(null);
  const [drawingType, setDrawingType] = useState<DrawingType>("unknown");
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dxfText, setDxfText] = useState<string>("");
  const [dragging, setDragging] = useState(false);

  const [plotLength, setPlotLength] = useState("");
  const [plotWidth, setPlotWidth] = useState("");
  // the unit system is global (metric/imperial) and remembered; "feet"/"meters" is what the estimate page expects
  const { system, setSystem } = useUnits();
  const unit = system === "metric" ? "meters" : "feet";
  const setUnit = (u: string) => {
    const next: UnitSystem = u === "meters" ? "metric" : "imperial";
    if (next === system) return;
    // convert what is already typed so the numbers keep meaning the same real size
    const conv = (v: string, set: (x: string) => void) => { const n = parseFloat(v); if (Number.isFinite(n)) set(String(convertLength(n, system, next, next === "metric" ? 3 : 2))); };
    conv(plotLength, setPlotLength); conv(plotWidth, setPlotWidth); conv(floorHeight, setFloorHeight);
    setSystem(next);
  };
  const [floors, setFloors] = useState("");
  const [floorHeight, setFloorHeight] = useState("");
  const [wallThickness, setWallThickness] = useState("");
  const [projectType, setProjectType] = useState("single");
  const [quality, setQuality] = useState("standard");
  const [foundationType, setFoundationType] = useState("strip");
  const [roofType, setRoofType] = useState("rcc_slab");
  const [sector, setSector] = useState("private");
  const [district, setDistrict] = useState("Dhaka");
  const [rates, setRates] = useState<DistrictRatesT>(() => getTodayRates("Dhaka"));

  const handleFile = useCallback(async (f: File) => {
    setAnalysisCompleted(false);
    setReviewConfirmed(false);
    setPreview(null);
    setDxfSummary(null);
    setDxfEngineering(null);
    setCompanionDxfFile(null);
    setCompanionDxfAnalysis(null);
    setCompanionDrawingType("unknown");
    setDxfText("");
    setInspection(null);
    setFile(null);

    const checked = await inspectDrawingFile(f);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }

    let nextDxfText = "";
    let nextDxfSummary: DxfSummary | null = null;
    let nextDxfEngineering: DxfEngineeringAnalysis | null = null;
    if (checked.kind === "dxf") {
      try {
        nextDxfText = await f.text();
        nextDxfSummary = parseDXF(nextDxfText);
        nextDxfEngineering = analyzeDxfEngineeringDrawing(nextDxfText, { fileName: f.name });
        if (nextDxfSummary.totalEntities === 0 || nextDxfEngineering.entityCount === 0) {
          toast.error("No supported LINE or POLYLINE geometry was found. Re-export the CAD drawing as ASCII DXF with visible entity geometry.");
          return;
        }
      } catch {
        toast.error("Could not parse the DXF geometry. Please re-export it as ASCII DXF.");
        return;
      }
    }

    const typeDetection = checked.kind === "dxf" && nextDxfSummary
      ? detectDrawingType(f.name, Object.keys(nextDxfSummary.layers))
      : { type: checked.drawingType, source: checked.typeSource };
    const finalInspection: DrawingInspection = {
      ...checked,
      drawingType: typeDetection.type,
      typeSource: typeDetection.source,
      warnings: typeDetection.type === "unknown" ? checked.warnings : [],
    };
    setFile(f);
    setInspection(finalInspection);
    setDxfText(nextDxfText);
    setDxfSummary(nextDxfSummary);
    setDxfEngineering(nextDxfEngineering);
    setDrawingType(finalInspection.drawingType);
    if (checked.kind === "image") {
      const reader = new FileReader();
      reader.onload = (event) => setPreview(typeof event.target?.result === "string" ? event.target.result : null);
      reader.onerror = () => toast.error("The selected image could not be previewed.");
      reader.readAsDataURL(f);
    }
    if (checked.kind === "dxf" && nextDxfSummary) {
      toast.success(`DXF validated: ${nextDxfSummary.totalEntities} entities, ${Object.keys(nextDxfSummary.layers).length} layers`);
    } else {
      toast.success(`${f.name} validated and ready for drawing analysis`);
    }
  }, []);

  const handleCompanionDxf = async (selected: File) => {
    const checked = await inspectDrawingFile(selected);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    if (checked.kind !== "dxf") {
      toast.error("Architectural/structural cross-check currently requires a second ASCII DXF drawing.");
      return;
    }
    try {
      const text = await selected.text();
      const report = analyzeDxfEngineeringDrawing(text, { fileName: selected.name });
      setCompanionDxfFile(selected);
      setCompanionDxfAnalysis(report);
      const detected = detectDrawingType(selected.name, report.elements.flatMap((element) => element.sourceLayers));
      setCompanionDrawingType(detected.type === "architectural" || detected.type === "structural" ? detected.type : "unknown");
      toast.success("Companion DXF parsed. Confirm its drawing discipline to run the cross-check.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyse the companion DXF.");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleAnalyze = () => {
    const numeric = {
      plotLength: Number(plotLength),
      plotWidth: Number(plotWidth),
      floors: Number(floors),
      floorHeight: Number(floorHeight),
      wallThickness: Number(wallThickness),
    };
    if (!file || !analysisCompleted) {
      toast.error("Upload a supported drawing and complete AI Drawing Review before continuing.");
      return;
    }
    if (!["architectural", "floor-plan", "site-plan", "general"].includes(drawingType)) {
      toast.error("This drawing type is not sufficient for a building cost estimate. Upload an architectural/floor plan drawing; structural, plumbing, electrical and single-member drawings require their own dedicated workflow.");
      return;
    }
    if (!reviewConfirmed) {
      toast.error("Please confirm that you reviewed the AI findings and warnings.");
      return;
    }
    if (!Number.isFinite(numeric.plotLength) || numeric.plotLength <= 0
      || !Number.isFinite(numeric.plotWidth) || numeric.plotWidth <= 0
      || !Number.isInteger(numeric.floors) || numeric.floors < 1 || numeric.floors > 40
      || !Number.isFinite(numeric.floorHeight) || numeric.floorHeight <= 0
      || !Number.isFinite(numeric.wallThickness) || numeric.wallThickness <= 0) {
      toast.error("Enter valid positive project dimensions, floor count, floor height and wall thickness from the approved drawing.");
      return;
    }
    navigate("/estimate/demo", {
      state: {
        ...numeric,
        unit, projectType, quality, foundationType, roofType, sector,
        district, rates, drawingType,
        fileName: file.name,
        drawingReviewCompleted: true,
        measurementsSource: "user-confirmed",
      },
    });
  };

  const selectClass = "w-full h-10 rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const inputClass = selectClass;
  const crossDrawingReview = dxfEngineering && companionDxfAnalysis
    && ((drawingType === "architectural" && companionDrawingType === "structural")
      || (drawingType === "structural" && companionDrawingType === "architectural"))
    ? compareArchitecturalStructuralDrawings(
      drawingType === "architectural" ? dxfEngineering : companionDxfAnalysis,
      drawingType === "structural" ? dxfEngineering : companionDxfAnalysis,
    )
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <SEO title="Upload Building Design" description="Upload your floor plan, photo, PDF, or DXF — our AI instantly analyzes it for BNBC-compliant construction estimation." />
      <Navbar />
      <main className="flex-1 py-10">
        <div className="container max-w-4xl space-y-8">
          <div className="text-center space-y-2">
            <h1 className="font-heading text-3xl md:text-4xl font-bold">{t("upload.title")}</h1>
            <p className="text-muted-foreground">{t("upload.subtitle")}</p>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragging ? "border-accent bg-accent/5" : "border-border bg-card"}`}
          >
            {preview ? (
              <div className="space-y-4">
                <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg shadow-card" />
                <p className="text-sm text-muted-foreground">{file?.name}</p>
                <Button variant="outline" size="sm" onClick={() => { setFile(null); setPreview(null); setDxfSummary(null); setDxfText(""); setInspection(null); setAnalysisCompleted(false); setReviewConfirmed(false); }}>{t("upload.remove")}</Button>
              </div>
            ) : file && !preview ? (
              <div className="space-y-3">
                <FileCode className="h-12 w-12 text-accent mx-auto" />
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                <Button variant="outline" size="sm" onClick={() => { setFile(null); setDxfSummary(null); setDxfText(""); setInspection(null); setAnalysisCompleted(false); setReviewConfirmed(false); }}>{t("upload.remove")}</Button>
              </div>
            ) : (
              <label className="cursor-pointer space-y-3 block">
                <FileImage className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="font-medium text-foreground">{t("upload.dragDrop")}</p>
                <p className="text-sm text-muted-foreground">Supported drawings: PDF · JPG · PNG · WEBP · ASCII DXF (max 20 MB)</p>
                <p className="text-xs text-muted-foreground">DWG is detected but must be exported as ASCII DXF first. Documents and unrelated files are not accepted.</p>
                <input type="file" accept={DRAWING_ACCEPT} className="hidden" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) void handleFile(selected); e.currentTarget.value = ""; }} />
              </label>
            )}
          </div>

          {dxfSummary && (
            <div className="bg-card rounded-xl shadow-card p-6 space-y-3">
              <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
                <FileCode className="h-5 w-5 text-accent" /> DXF Detection Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-muted/40 rounded-lg p-3"><p className="text-xs text-muted-foreground">Lines</p><p className="font-bold">{dxfSummary.totalEntities}</p></div>
                <div className="bg-muted/40 rounded-lg p-3"><p className="text-xs text-muted-foreground">Layers</p><p className="font-bold">{Object.keys(dxfSummary.layers).length}</p></div>
                <div className="bg-muted/40 rounded-lg p-3"><p className="text-xs text-muted-foreground">Wall Length</p><p className="font-bold">{dxfSummary.estimatedWallLength.toFixed(0)}</p></div>
                <div className="bg-muted/40 rounded-lg p-3"><p className="text-xs text-muted-foreground">Detected Columns</p><p className="font-bold">{dxfSummary.detectedColumns}</p></div>
              </div>
              <p className="text-xs text-muted-foreground">Layers found: {Object.keys(dxfSummary.layers).slice(0, 8).join(", ")}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">⚠ Approximate detection — please verify dimensions below.</p>
            </div>
          )}

          {dxfEngineering && (
            <section className="rounded-xl border bg-card p-5 space-y-4" aria-labelledby="engineering-analysis-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="engineering-analysis-title" className="font-heading text-lg font-semibold">Engineering Element Analysis</h3>
                  <p className="text-xs text-muted-foreground">Deterministic CAD entity and layer analysis · not a certified quantity takeoff</p>
                </div>
                <span className="rounded-full border px-3 py-1 text-xs font-medium">
                  {dxfEngineering.unitsVerifiedFromHeader ? `DXF units: ${dxfEngineering.units}` : "Units not verified"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">CAD entities</p><p className="font-bold">{dxfEngineering.entityCount}</p></div>
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Layers</p><p className="font-bold">{dxfEngineering.layerCount}</p></div>
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Floor labels</p><p className="font-bold">{dxfEngineering.floorLabels.length}</p></div>
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Text labels</p><p className="font-bold">{dxfEngineering.labels.length}</p></div>
              </div>
              {dxfEngineering.elements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead><tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Element / Layer group</th>
                      <th className="py-2 pr-3 font-medium">CAD objects</th>
                      <th className="py-2 pr-3 font-medium">Geometry length</th>
                      <th className="py-2 pr-3 font-medium">Closed area</th>
                      <th className="py-2 font-medium">Floor groups</th>
                    </tr></thead>
                    <tbody>
                      {dxfEngineering.elements.map((element) => (
                        <tr key={element.kind} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3">
                            <p className="font-semibold capitalize">{element.kind.replace(/-/g, " ")}</p>
                            <p className="text-muted-foreground break-words">{element.sourceLayers.join(", ")}</p>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{element.cadObjectCount}</td>
                          <td className="py-2 pr-3 tabular-nums">{element.geometryLength.toFixed(2)} {dxfEngineering.units ?? "CAD units"}</td>
                          <td className="py-2 pr-3 tabular-nums">{element.closedArea.toFixed(2)} {(dxfEngineering.units ?? "CAD units")}²</td>
                          <td className="py-2">{Object.entries(element.floors).map(([floor, count]) => `${floor}: ${count}`).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-amber-700 dark:text-amber-400">No engineering layers could be confidently classified from layer names.</p>}
              {dxfEngineering.warnings.map((warning, index) => (
                <p key={index} className="text-xs text-amber-700 dark:text-amber-400">⚠ {warning}</p>
              ))}
              <p className="text-[11px] text-muted-foreground">
                CAD object counts are entity counts, not guaranteed physical member counts. Length and area are reported in source drawing units only. No wall thickness, bar diameter, concrete volume, steel weight, floor repetition or missing geometry is assumed.
              </p>
              <div className="rounded-lg border p-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Architectural ↔ Structural Drawing Cross-check</p>
                  <p className="text-xs text-muted-foreground">Optional: add the matching counterpart DXF. The check only compares drawings when explicit units and a common coordinate frame can be confirmed.</p>
                </div>
                {companionDxfFile ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium">{companionDxfFile.name}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setCompanionDxfFile(null); setCompanionDxfAnalysis(null); setCompanionDrawingType("unknown"); }}>Remove counterpart</Button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">
                    Upload counterpart DXF
                    <input type="file" accept=".dxf" className="sr-only" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void handleCompanionDxf(selected); event.currentTarget.value = ""; }} />
                  </label>
                )}
                {companionDxfAnalysis && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs">
                      <span className="font-medium">Counterpart drawing discipline</span>
                      <select className={selectClass} value={companionDrawingType} onChange={(event) => setCompanionDrawingType(event.target.value as DrawingType)}>
                        <option value="unknown">Select discipline</option>
                        <option value="architectural">Architectural</option>
                        <option value="structural">Structural</option>
                      </select>
                    </label>
                    <div className="rounded-lg bg-muted/40 p-3 text-xs">
                      <p className="font-medium">Counterpart entities: {companionDxfAnalysis.entityCount}</p>
                      <p className="text-muted-foreground">Units: {companionDxfAnalysis.units ?? "not verified"}</p>
                    </div>
                  </div>
                )}
                {crossDrawingReview && (
                  <div className="space-y-1">
                    <p className={crossDrawingReview.comparable ? "text-xs font-semibold text-emerald-700 dark:text-emerald-400" : "text-xs font-semibold text-amber-700 dark:text-amber-400"}>
                      {crossDrawingReview.comparable ? "Coordinate-based comparison completed with limitations" : "Cross-check blocked — drawings are not safely comparable"}
                    </p>
                    {crossDrawingReview.warnings.length === 0
                      ? <p className="text-xs text-muted-foreground">Overall extents and column CAD-object counts are consistent. This is not a structural adequacy check.</p>
                      : crossDrawingReview.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-700 dark:text-amber-400">⚠ {warning}</p>)}
                  </div>
                )}
                {companionDxfAnalysis && !crossDrawingReview && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">⚠ Select opposite disciplines (one Architectural and one Structural) to compare the two drawings.</p>
                )}
              </div>
            </section>
          )}

          {file && inspection && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Validated drawing file</p>
                    <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · {inspection.mimeType}</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">File checks passed</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_220px] sm:items-center">
                  <div>
                    <label className="text-sm font-medium" htmlFor="drawing-type">Drawing discipline / ধরন</label>
                    <p className="text-xs text-muted-foreground">Filename/layer detection is only a hint. Confirm or correct it.</p>
                  </div>
                  <select id="drawing-type" className={selectClass} value={drawingType} onChange={(e) => { setDrawingType(e.target.value as DrawingType); setAnalysisCompleted(false); setReviewConfirmed(false); }}>
                    <option value="unknown">Unknown / not sure</option>
                    <option value="architectural">Architectural</option>
                    <option value="structural">Structural</option>
                    <option value="foundation">Foundation</option>
                    <option value="column-layout">Column Layout</option>
                    <option value="beam-layout">Beam Layout</option>
                    <option value="slab-layout">Slab Layout</option>
                    <option value="floor-plan">Floor Plan</option>
                    <option value="section">Section</option>
                    <option value="elevation">Elevation</option>
                    <option value="site-plan">Site Plan</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="road">Road</option>
                    <option value="bridge">Bridge</option>
                    <option value="general">General Drawing</option>
                  </select>
                </div>
                {inspection.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-700 dark:text-amber-400">⚠ {warning}</p>)}
              </div>
              <AIThinking
                autoRun
                file={file}
                fileName={file.name}
                textContent={dxfText || undefined}
                drawingType={drawingType}
                uploadWarnings={inspection.warnings}
                onAnalysis={(a, coverageComplete) => {
                  setAnalysisCompleted(coverageComplete);
                  if (!coverageComplete) toast.error("Drawing review is incomplete. Split the PDF into batches of up to 5 pages or export a smaller ASCII DXF before continuing.");
                  setReviewConfirmed(false);
                  if (a.drawingType && a.drawingType !== "unknown") setDrawingType(a.drawingType);
                  const bt = (a.detected?.buildingType || "").toLowerCase();
                  if (bt.includes("duplex")) setProjectType("duplex");
                  else if (bt.includes("commerc")) setProjectType("commercial");
                  else if (bt.includes("apartment") || bt.includes("multi")) setProjectType("multi");
                  else if (bt.includes("shop")) setProjectType("shop_home");
                  else if (bt.includes("residential") || bt.includes("house")) setProjectType("single");
                }}
                onAnalysisError={() => { setAnalysisCompleted(false); setReviewConfirmed(false); }}
              />
            </div>
          )}

          <DistrictRates
            district={district}
            onChange={(d, r) => { setDistrict(d); setRates(r); }}
          />

          <div className="bg-card rounded-xl shadow-card p-6 space-y-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-heading text-xl font-semibold">{t("upload.projectDetails")}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter dimensions directly from your drawing. AI-suggested area, scale and floor counts are not verified and will not be copied into the estimator.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.plotLength")}</label>
                <input className={inputClass} type="number" min="0.01" step="any" value={plotLength} onChange={(e) => setPlotLength(e.target.value)} placeholder="Enter verified length" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.plotWidth")}</label>
                <input className={inputClass} type="number" min="0.01" step="any" value={plotWidth} onChange={(e) => setPlotWidth(e.target.value)} placeholder="Enter verified width" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.unitSystem")}</label>
                <select className={selectClass} value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="feet">{t("upload.feet")}</option>
                  <option value="meters">{t("upload.meters")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.numFloors")}</label>
                <input className={inputClass} type="number" min="1" max="40" step="1" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="Verified floor count" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.floorHeight")} ({unit === "feet" ? t("upload.feet") : t("upload.meters")})</label>
                <input className={inputClass} type="number" min="0.01" step="any" value={floorHeight} onChange={(e) => setFloorHeight(e.target.value)} placeholder="Enter verified height" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.wallThickness")}</label>
                <input className={inputClass} type="number" min="0.01" step="any" value={wallThickness} onChange={(e) => setWallThickness(e.target.value)} placeholder="Enter verified thickness" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.projectType")}</label>
                <select className={selectClass} value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                  <option value="single">{t("upload.single")}</option>
                  <option value="duplex">{t("upload.duplex")}</option>
                  <option value="multi">{t("upload.multi")}</option>
                  <option value="commercial">{t("upload.commercial")}</option>
                  <option value="shop_home">{t("upload.shopHome")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.quality")}</label>
                <select className={selectClass} value={quality} onChange={(e) => setQuality(e.target.value)}>
                  <option value="economy">{t("upload.economy")}</option>
                  <option value="standard">{t("upload.standard")}</option>
                  <option value="premium">{t("upload.premium")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.foundation")}</label>
                <select className={selectClass} value={foundationType} onChange={(e) => setFoundationType(e.target.value)}>
                  <option value="strip">{t("upload.strip")}</option>
                  <option value="isolated">{t("upload.isolated")}</option>
                  <option value="raft">{t("upload.raft")}</option>
                  <option value="pile">{t("upload.pile")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("upload.roofType")}</label>
                <select className={selectClass} value={roofType} onChange={(e) => setRoofType(e.target.value)}>
                  <option value="rcc_slab">{t("upload.rccSlab")}</option>
                  <option value="tin_shade">{t("upload.tinShade")}</option>
                  <option value="flat_roof">{t("upload.flatRoof")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Project Sector / প্রকল্পের ধরন</label>
                <select className={selectClass} value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option value="private">Private (বেসরকারি)</option>
                  <option value="government">Government (সরকারি)</option>
                  <option value="semi_government">Semi-Government (আধা-সরকারি)</option>
                  <option value="ngo">NGO / Non-profit</option>
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">The AI review is a document triage step only. All dimensions below must be read and entered from the drawing by the user. No estimate will be generated from unverified AI guesses.</p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} disabled={!analysisCompleted} />
                <span>I reviewed the AI findings, coverage notes and drawing warnings. The dimensions entered above have been checked against the source drawing.</span>
              </label>
            </div>
            <div className="pt-4 flex justify-center">
              <Button size="lg" onClick={handleAnalyze} disabled={!file || !analysisCompleted || !reviewConfirmed}>
                {t("upload.analyze")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default UploadPage;
