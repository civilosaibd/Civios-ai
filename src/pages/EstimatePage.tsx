import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import Building3D from "@/components/Building3D";
import { useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { generateEstimate } from "@/lib/estimateEngine";
import {
  computeBNBCLoads,
  designBeams,
  designColumns,
  designSlabs,
  buildBOQ,
  buildTimeline,
  buildQuotation,
  aiRecommendations,
  BNBC_ZONES,
  BNBC_SOILS,
} from "@/lib/engineering";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Download, Lightbulb, Building, Layers, Hammer, Paintbrush, Zap, Droplets,
  DollarSign, Activity, Construction, FileText, Calendar, Box, ShieldCheck, Save, Share2,
  Sparkles, ArrowRight, CheckCircle2, LockKeyhole, TrendingUp
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useI18n } from "@/lib/i18n";
import { suggestionsBn } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { saveProjectArtifact } from "@/lib/projectArtifacts";
import { getActiveProjectId } from "@/lib/projectSelection";
import DistrictRates from "@/components/DistrictRates";
import MaterialAnalysisDashboard from "@/components/estimate/MaterialAnalysisDashboard";
import BOQReconciliation from "@/components/estimate/BOQReconciliation";
import RateAnalysisDashboard from "@/components/estimate/RateAnalysisDashboard";
import EstimateAccuracyReview from "@/components/estimate/EstimateAccuracyReview";

const COLORS = ["#1a3a6b", "#2a5298", "#e67e22", "#27ae60", "#8e44ad", "#e74c3c", "#3498db", "#f39c12", "#1abc9c"];

const EstimatePage = () => {
  const location = useLocation();
  const { t, lang, currency, fmt } = useI18n();
  const { user } = useAuth();

  const params = location.state || {
    plotLength: 40, plotWidth: 30, unit: "feet", floors: 1,
    floorHeight: 10, wallThickness: 5, projectType: "single",
    quality: "standard", foundationType: "strip", roofType: "rcc_slab",
    fileName: "Demo House Project",
  };

  const [zone, setZone] = useState<string>("Zone 2 (Dhaka)");
  const [soil, setSoil] = useState<string>("SC");
  const [importance, setImportance] = useState<number>(1.0);
  const [saving, setSaving] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [workspaceArtifactId, setWorkspaceArtifactId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>(params._projectName || params.fileName || "House Project");
  const [district, setDistrict] = useState<string>(params.district || "Dhaka");
  const [rates, setRates] = useState(params.rates || undefined);
  const [boqSearch, setBoqSearch] = useState("");
  const [boqCategory, setBoqCategory] = useState("all");

  const data = useMemo(() => generateEstimate({ ...params, rates }), [rates, district]);
  const loads = useMemo(() => computeBNBCLoads(data, zone, soil, importance), [data, zone, soil, importance]);
  const beams = useMemo(() => designBeams(data), [data]);
  const columns = useMemo(() => designColumns(data), [data]);
  const slabs = useMemo(() => designSlabs(data), [data]);
  const boq = useMemo(() => buildBOQ(data), [data]);
  const timeline = useMemo(() => buildTimeline(data), [data]);
  const quotation = useMemo(() => buildQuotation(data), [data]);
  const aiRecs = useMemo(() => aiRecommendations(data, loads), [data, loads]);
  const suggestions = lang === "bn" ? suggestionsBn : data.suggestions;

  const totalDuration = Math.max(...timeline.map((p) => p.startMonth + p.durationMonths));

  const downloadCSV = (filename: string, rows: (string | number)[][]) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const getBOQCategory = (item: string) => {
    const value = item.toLowerCase();
    if (/foundation|excavat|earthwork|pile|footing|backfill/.test(value)) return "Foundation & Earthwork";
    if (/concrete|rcc|reinforc|steel|rebar|beam|column|slab|formwork|shutter/.test(value)) return "RCC & Structure";
    if (/brick|block|masonry|wall|plaster|pointing/.test(value)) return "Masonry & Plaster";
    if (/paint|tile|flooring|door|window|finish|ceiling|sanitary/.test(value)) return "Finishing";
    if (/electrical|wire|cable|light|switch|socket|power/.test(value)) return "Electrical";
    if (/plumb|pipe|water|drain|sewer|bathroom/.test(value)) return "Plumbing";
    return "Other works";
  };

  const filteredBOQ = boq.filter((item) => {
    const matchesSearch = `${item.item} ${item.unit}`.toLowerCase().includes(boqSearch.trim().toLowerCase());
    const matchesCategory = boqCategory === "all" || getBOQCategory(item.item) === boqCategory;
    return matchesSearch && matchesCategory;
  });

  const exportBOQCsv = (items = boq, suffix = "") => {
    const rows: (string | number)[][] = [["Item", "Category", "Qty", "Unit", "Rate (BDT)", "Total (BDT)"]];
    items.forEach((b) => rows.push([b.item, getBOQCategory(b.item), b.qty, b.unit, b.rate, b.total]));
    rows.push(["", "", "", "", "TOTAL", items.reduce((s, b) => s + b.total, 0)]);
    downloadCSV(`${projectName}_BOQ${suffix}.csv`, rows);
    toast.success(`BOQ exported as CSV (${items.length} items)`);
  };

  const exportQuotationCsv = () => {
    const rows: (string | number)[][] = [
      ["Smart House Estimate AI – Contractor Quotation"],
      ["Project", projectName], ["Plot", data.plotSize], ["Floors", data.floors], ["Quality", data.quality],
      [],
      ["Item", "Amount (BDT)", "Justification"],
      ...quotation.justification.map((j) => [j.label, j.amount, j.note]),
      ["Full Project Cost (before profit)", quotation.baseProjectCost, "Materials + Labor + Civil + Finishing + E&P + Transport + Contingency + Overhead"],
      ["TOTAL (with 10% contractor profit)", quotation.total, "Single profit margin — no double counting"],
      [],
      ["Duration (months)", quotation.durationMonths],
      ["Validity (days)", quotation.validityDays],
      ["Payment Terms", quotation.paymentTerms],
    ];
    downloadCSV(`${projectName}_Quotation.csv`, rows);
    toast.success("Quotation exported as CSV");
  };

  const saveProject = async () => {
    if (!user) { toast.info("Please sign in to save projects."); return; }
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: projectName,
        file_name: params.fileName || null,
        inputs: { ...params, _zone: zone, _soil: soil, _importance: importance },
        estimate: data as any,
        bnbc_loads: loads as any,
      };
      if (params._projectId) {
        const { error } = await supabase.from("projects").update(payload).eq("id", params._projectId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert(payload);
        if (error) throw error;
      }
      toast.success("Project saved to your account");
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const saveEstimateToWorkspace = async () => {
    if (!user) { toast.info("Please sign in to save this estimate."); return; }
    const targetProjectId = (params as any)._projectId || getActiveProjectId();
    if (!targetProjectId) {
      toast.info("Save this project first to create a Project Workspace, then open the estimate from that project.");
      return;
    }
    setSavingWorkspace(true);
    try {
      const saved = await saveProjectArtifact({
        id: workspaceArtifactId ?? undefined,
        projectId: targetProjectId,
        artifactType: "construction_estimate",
        title: projectName.trim() || data.projectName || "Construction Estimate",
        description: `${data.totalFloorArea.toLocaleString("en-BD")} sqft · BDT ${quotation.total.toLocaleString("en-BD")} · ${data.floors} floor(s)`,
        data: {
          projectName,
          inputs: { ...params, district, rates, seismicZone: zone, soilType: soil, importanceFactor: importance },
          estimate: data,
          structural: { loads, beams, columns, slabs },
          boq,
          timeline,
          quotation,
          recommendations: aiRecs,
          assumptions: {
            currency: "BDT",
            designCode: "BNBC 2022",
            notice: "Preliminary planning estimate only. Structural design and quantities must be verified by a qualified engineer against approved drawings, site conditions, and applicable codes.",
          },
        },
        metadata: { sourceModule: "EstimatePage", formatVersion: 1, savedAt: new Date().toISOString(), district, designCode: "BNBC 2022" },
      });
      setWorkspaceArtifactId(saved.id);
      toast.success("Full construction estimate saved to Project Workspace.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save estimate to Project Workspace.");
    } finally {
      setSavingWorkspace(false);
    }
  };

  const shareProject = async () => {
    if (!user) { toast.info("Sign in and save the project first to share it."); return; }
    if (!params._projectId) { toast.info("Save the project first, then share."); return; }
    let token = (params as any)._shareToken as string | undefined;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const { error } = await supabase.from("projects")
        .update({ share_token: token, is_public: true } as any)
        .eq("id", params._projectId);
      if (error) { toast.error(error.message); return; }
    }
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Public link copied to clipboard!");
  };

  const generatePDF = () => {
    try {
      if (!data || !quotation || !Array.isArray(boq) || !Array.isArray(timeline)) {
        toast.error("The estimate report is missing required project data. Please refresh and try again.");
        return;
      }
      if (!Number.isFinite(quotation.total) || quotation.total <= 0) {
        toast.error("The estimate total is invalid. Review the project inputs before exporting the report.");
        return;
      }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const number = (value: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
    const safeName = (projectName || data.projectName || "Construction_Estimate").replace(/[^a-z0-9-_]+/gi, "_");
    const generatedAt = new Date();
    const reportTotal = quotation.total;
    let y = 18;

    // Cover and project summary page
    doc.setFillColor(15, 31, 55);
    doc.rect(0, 0, pageWidth, 76, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CIVILOS AI  |  ESTIMATE WORKSPACE", margin, 17);
    doc.setFontSize(23);
    doc.text("Construction Estimate", margin, 31);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Professional project report", margin, 40);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(1.2);
    doc.line(margin, 48, margin + 32, 48);
    doc.setFontSize(10);
    doc.text(`Generated: ${generatedAt.toLocaleDateString("en-GB")}`, margin, 60);
    doc.text(`Project: ${String(projectName || data.projectName || "Construction project").slice(0, 75)}`, margin, 68);

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Project summary", margin, 91);
    autoTable(doc, {
      startY: 97,
      head: [["Project parameter", "Current estimate"]],
      body: [
        ["Project name", projectName || data.projectName || "Construction project"],
        ["Plot / building size", String(data.plotSize ?? "Not specified")],
        ["Total floor area", `${number(data.totalFloorArea)} sqft`],
        ["Number of floors", String(data.floors)],
        ["Quality level", String(data.quality ?? "Not specified")],
        ["Selected district", String(district || "Not specified")],
        ["Indicative duration", `${number(data.completionMonths)} months`],
        ["Cost per sqft (quotation)", `BDT ${number(reportTotal / Math.max(data.totalFloorArea, 1))}`],
        ["Estimated quotation total", `BDT ${number(reportTotal)}`],
      ],
      theme: "grid",
      headStyles: { fillColor: [20, 55, 92], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Scope, assumptions & limitations", margin, y);
    autoTable(doc, {
      startY: y + 4,
      body: [
        ["Estimate basis", "Values shown are generated from the current project inputs and estimate engine snapshot."],
        ["Quantity basis", "Planning quantities are not a measured take-off from approved construction drawings."],
        ["Rate basis", "Rates must be checked against dated supplier, labor and district quotations before procurement."],
        ["Engineering review", "Structural calculations, soil assumptions, dimensions, code compliance and safety require qualified professional verification."],
        ["Use of report", "Preliminary budgeting and discussion only; not a certified BOQ, tender document, structural approval or construction authorization."],
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 34, fontStyle: "bold" } },
      margin: { left: margin, right: margin },
    });

    // Detailed schedules begin on a fresh page for clear report structure.
    doc.addPage();
    y = 20;
    const addSection = (title: string, head: string[], body: (string | number)[][], fontSize = 8) => {
      if (y > pageHeight - 42) {
        doc.addPage();
        y = 20;
      }
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      autoTable(doc, {
        startY: y + 4,
        head: [head],
        body: body.length ? body : [["No data available for this section", ...Array(Math.max(0, head.length - 1)).fill("—")]],
        theme: "grid",
        headStyles: { fillColor: [20, 55, 92], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize, cellPadding: 2.5, overflow: "linebreak", valign: "middle" },
        margin: { left: margin, right: margin, bottom: 18 },
        rowPageBreak: "avoid",
      });
      y = (doc as any).lastAutoTable.finalY + 11;
    };

    addSection("1. Cost breakdown", ["Cost category", "Amount (BDT)", "Share of quotation"], (data.costBreakdown || []).map((item) => [
      item.category, number(item.amount), reportTotal > 0 ? `${(item.amount / reportTotal * 100).toFixed(1)}%` : "—",
    ]));
    addSection("2. Material schedule", ["Material", "Quantity", "Unit", "Unit rate (BDT)", "Line total (BDT)"],
      [
        ...Object.entries(data.materials || {}).map(([name, item]) => [name, number(item.qty), item.unit, number(item.rate), number(item.total)]),
        ["TOTAL MATERIALS", "", "", "", number(Object.values(data.materials || {}).reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0))],
      ]);
    addSection("3. Labor & daily rate analysis", ["Labor / crew", "Days", "Daily rate (BDT)", "Line total (BDT)"],
      [
        ...Object.entries(data.labor || {}).map(([name, item]) => [name, number(item.days), number(item.rate), number(item.total)]),
        ["TOTAL LABOR", "", "", number(Object.values(data.labor || {}).reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0))],
      ]);
    addSection("4. Detailed Bill of Quantities (BOQ)", ["Work item", "Quantity", "Unit", "Rate (BDT)", "Amount (BDT)"],
      [
        ...boq.map((item) => [item.item, number(item.qty), item.unit, number(item.rate), number(item.total)]),
        ["TOTAL BOQ", "", "", "", number(boq.reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0))],
      ]);
    addSection("5. Contractor quotation & adjustments", ["Item", "Amount (BDT)", "Basis / notes"], [
      ...quotation.justification.map((item) => [item.label, number(item.amount), item.note]),
      ["Full project cost before profit", number(quotation.baseProjectCost), "Quotation base as supplied by the estimate engine"],
      ["TOTAL quotation", number(quotation.total), "Includes the quotation's configured contractor profit adjustment"],
    ], 7.5);
    addSection("6. Structural load indicators (BNBC inputs)", ["Parameter", "Value"], [
      ["Seismic zone", String(loads.zone)],
      ["Zone factor (Z)", String(loads.zoneFactor)],
      ["Soil type", String(loads.soilType)],
      ["Total dead load", `${number(loads.totalDeadLoad)} kN`],
      ["Total live load", `${number(loads.totalLiveLoad)} kN`],
      ["Wind pressure", `${number(loads.windPressure)} kN/m²`],
      ["Base shear", `${number(loads.baseShear)} kN`],
    ]);
    addSection("7. BNBC 2022 load combinations (model output)", ["Combination", "Formula", "Factored load (kN)", "Governs"],
      (loads.combos || []).map((item) => [item.name, item.formula, number(item.factoredLoad), item.governs ? "Yes" : "No"]), 7.5);
    addSection("8. Preliminary construction timeline", ["Activity", "Start month", "Duration (months)"],
      (timeline || []).map((item: any) => [item.name || item.activity || "Activity", number(item.startMonth), number(item.durationMonths)]));

    // Repeatable page header/footer and pagination, including the cover.
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);
      if (page > 1) {
        doc.setDrawColor(220, 226, 234);
        doc.setLineWidth(0.25);
        doc.line(margin, 12, pageWidth - margin, 12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text("CIVILOS AI  |  CONSTRUCTION ESTIMATE REPORT", margin, 9);
      }
      doc.setDrawColor(220, 226, 234);
      doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Preliminary estimate — verify quantities, rates and engineering assumptions before use.", margin, pageHeight - 8);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    }

    doc.save(`${safeName}_Professional_Estimate_Report.pdf`);
      toast.success("Professional estimate report PDF generated.");
    } catch (error) {
      console.error("Professional estimate PDF export failed:", error);
      toast.error("Could not generate the PDF report. Please try again; if the problem continues, review the project data.");
    }
  };

  const SectionCard = ({ title, icon: Icon, children, action }: { title: string; icon: any; children: React.ReactNode; action?: React.ReactNode }) => (
    <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-accent" />
          </div>
          <h3 className="font-heading font-semibold text-lg">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={projectName ? `${projectName} — Construction Estimate` : "Construction Estimate"}
        description={`AI-generated BNBC 2022 construction estimate${params?.area ? ` for a ${params.area} sqft house` : ""}: full BOQ, structural analysis, and 3D model.`}
        type="article"
      />
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container space-y-6">
          {/* Premium SaaS demo-estimate overview */}
          <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-slate-950 via-[#102b50] to-[#164e63] p-6 text-white shadow-xl md:p-9">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-orange-400/10 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1.35fr_0.9fr] lg:items-center">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-100">
                  <Sparkles className="h-4 w-4" /> AI-POWERED ESTIMATION WORKSPACE
                </div>
                <div className="space-y-3">
                  <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-5xl">From project inputs to a clearer construction estimate.</h1>
                  <p className="max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                    Explore a sample engineering workflow with cost analytics, quantity breakdowns, BOQ, structural indicators and reporting tools—all in one workspace.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => document.getElementById("estimate-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="bg-orange-500 text-white hover:bg-orange-600">
                    Explore full estimate <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => document.getElementById("estimate-upgrade")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                    Explore premium tools
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> Transparent estimate breakdown</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> Engineering-focused workflow</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> Responsive workspace</span>
                </div>
              </div>
              <div className="relative rounded-2xl border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">Project snapshot</p>
                    <h2 className="mt-2 text-xl font-semibold">{data.projectName || projectName}</h2>
                    <p className="mt-1 text-sm text-slate-300">{data.plotSize} · {data.floors} floor(s) · {data.quality} quality</p>
                  </div>
                  <span className="rounded-full border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">DEMO PREVIEW</span>
                </div>
                <div className="my-5 h-px bg-white/15" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                    <p className="text-xs text-slate-300">Total floor area</p>
                    <p className="mt-1 text-xl font-bold">{fmt(data.totalFloorArea)} <span className="text-xs font-medium text-slate-300">sqft</span></p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                    <p className="text-xs text-slate-300">Estimated project cost</p>
                    <p className="mt-1 text-xl font-bold">{currency(quotation.total)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                    <p className="text-xs text-slate-300">Cost per sqft</p>
                    <p className="mt-1 text-lg font-bold">{currency(Math.round(quotation.total / Math.max(data.totalFloorArea, 1)))}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                    <p className="text-xs text-slate-300">Indicative duration</p>
                    <p className="mt-1 text-lg font-bold">~{data.completionMonths} months</p>
                  </div>
                </div>
                <p className="mt-4 text-[11px] leading-5 text-slate-300">Planning estimate only. Verify quantities, local rates, design assumptions and structural calculations with qualified professionals before construction.</p>
              </div>
            </div>
          </section>

          <section aria-label="Estimate workflow" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { step: "01", title: "Project inputs", detail: "Review project size, floors and assumptions", icon: Building },
              { step: "02", title: "Cost analytics", detail: "Understand the cost distribution and drivers", icon: TrendingUp },
              { step: "03", title: "BOQ & quantities", detail: "Inspect item quantities, units and rates", icon: FileText },
              { step: "04", title: "Reports & planning", detail: "Explore schedules and estimate outputs", icon: Calendar },
            ].map((item) => (
              <div key={item.step} className="group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-widest text-muted-foreground">{item.step}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><item.icon className="h-4 w-4" /></span>
                </div>
                <h3 className="mt-3 font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </section>
          <div id="estimate-workspace" className="scroll-mt-6" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="font-heading text-2xl md:text-3xl font-bold border-0 px-0 h-auto bg-transparent focus-visible:ring-0 shadow-none"
              />
              <p className="text-muted-foreground text-sm">
                {data.plotSize} • {data.floors} {t("est.floor")} • {data.quality} {t("est.quality")} • BNBC 2022
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={saveProject} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : user ? "Save Project" : "Sign in to Save"}
              </Button>
              <Button variant="secondary" onClick={saveEstimateToWorkspace} disabled={savingWorkspace || !user || !((params as any)._projectId || new URLSearchParams(window.location.search).get("project"))} title={!((params as any)._projectId || new URLSearchParams(window.location.search).get("project")) ? "Save the project first to enable workspace save" : "Save full estimate snapshot to Project Workspace"}>
                {savingWorkspace ? <Activity className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />} {workspaceArtifactId ? "Update Workspace Estimate" : "Save to Workspace"}
              </Button>
              <Button variant="outline" onClick={shareProject}>
                <Share2 className="h-4 w-4 mr-1" /> Share Link
              </Button>
              <Button onClick={generatePDF}>
                <Download className="h-4 w-4 mr-1" /> Professional Report PDF
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t("est.totalArea"), value: `${fmt(data.totalFloorArea)} sqft` },
              { label: t("est.totalCost"), value: currency(quotation.total) },
              { label: t("est.costSqft"), value: currency(Math.round(quotation.total / data.totalFloorArea)) },
              { label: t("est.duration"), value: `~${data.completionMonths} ${t("est.months")}` },
            ].map((c) => (
              <div key={c.label} className="bg-card rounded-xl shadow-card p-4 text-center">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="font-heading font-bold text-lg mt-1">{c.value}</p>
              </div>
            ))}
          </div>

          <DistrictRates
            district={district}
            onChange={(d, r) => { setDistrict(d); setRates(r); }}
          />

          {/* Step 2: data-backed cost analytics dashboard */}
          <section aria-labelledby="cost-analytics-title" className="scroll-mt-6 space-y-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="h-3.5 w-3.5" /> LIVE FROM CURRENT ESTIMATE
                </div>
                <h2 id="cost-analytics-title" className="text-2xl font-bold tracking-tight md:text-3xl">Cost analytics</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Understand where the current preliminary budget is allocated. Figures update when project inputs or district rates change.
                </p>
              </div>
              <Badge variant="outline" className="w-fit">BDT · Estimate snapshot</Badge>
            </div>

            {(() => {
              const breakdownTotal = data.costBreakdown.reduce((sum, item) => sum + item.amount, 0);
              const topCategory = [...data.costBreakdown].sort((a, b) => b.amount - a.amount)[0];
              const categoryCount = data.costBreakdown.filter((item) => item.amount > 0).length;
              const averageCategory = categoryCount ? breakdownTotal / categoryCount : 0;
              const topShare = breakdownTotal > 0 && topCategory ? (topCategory.amount / breakdownTotal) * 100 : 0;
              const formatMoney = (value: number) => `৳${fmt(Math.round(value))}`;
              return (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "Estimated total", value: currency(quotation.total), note: "Quotation total including configured margin", icon: DollarSign },
                      { label: "Largest cost driver", value: topCategory?.category ?? "Not available", note: topCategory ? `${topShare.toFixed(1)}% of listed cost breakdown` : "No breakdown available", icon: TrendingUp },
                      { label: "Cost categories", value: String(categoryCount), note: "Categories with a positive amount", icon: Layers },
                      { label: "Average per category", value: formatMoney(averageCategory), note: "Average of positive breakdown items", icon: Activity },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-2xl border border-border/70 bg-background p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><metric.icon className="h-4 w-4" /></span>
                        </div>
                        <p className="mt-3 break-words text-xl font-bold tracking-tight">{metric.value}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.note}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-2xl border border-border/70 p-4 md:p-5">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Budget allocation</h3>
                          <p className="mt-1 text-xs text-muted-foreground">Share of the estimate engine's cost breakdown</p>
                        </div>
                        <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium">{categoryCount} categories</span>
                      </div>
                      {categoryCount > 0 ? (
                        <div className="space-y-4">
                          {[...data.costBreakdown].filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount).map((item, index) => {
                            const share = breakdownTotal > 0 ? (item.amount / breakdownTotal) * 100 : 0;
                            return (
                              <div key={item.category}>
                                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                  <span className="min-w-0 truncate font-medium">{item.category}</span>
                                  <span className="shrink-0 text-right text-muted-foreground">{share.toFixed(1)}% <span className="ml-1 font-semibold text-foreground">{formatMoney(item.amount)}</span></span>
                                </div>
                                <div
                                  className="h-2.5 overflow-hidden rounded-full bg-muted"
                                  role="progressbar"
                                  aria-label={`${item.category} budget share`}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={Number(share.toFixed(1))}
                                >
                                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, share))}%`, backgroundColor: COLORS[index % COLORS.length] }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No positive cost categories are available for this estimate yet.</p>
                      )}
                      <p className="mt-4 border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
                        Allocation percentages are calculated from the listed cost categories and may not equal the quotation total when the estimate engine applies separate overhead, contingency or profit adjustments.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/70 p-4 md:p-5">
                      <div className="mb-3">
                        <h3 className="font-semibold">Cost distribution chart</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Compare category amounts at a glance</p>
                      </div>
                      <div className="h-72 min-w-0" role="img" aria-label="Bar chart comparing estimated costs by category">
                        {categoryCount > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[...data.costBreakdown].filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount)} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" tickFormatter={(value) => value >= 100000 ? `৳${(value / 100000).toFixed(1)}L` : `৳${(value / 1000).toFixed(0)}k`} fontSize={10} />
                              <YAxis type="category" dataKey="category" width={94} fontSize={10} tick={{ fill: "currentColor" }} />
                              <Tooltip formatter={(value: number) => [currency(value), "Estimated cost"]} />
                              <Bar dataKey="amount" name="Estimated cost" fill="hsl(220, 70%, 32%)" radius={[0, 5, 5, 0]} maxBarSize={22} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">Cost chart will appear when estimate data is available.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>

          <MaterialAnalysisDashboard materials={data.materials} projectName={projectName} projectCost={data.totalCost} currency={currency} fmt={fmt} />
          <BOQReconciliation materials={data.materials} boq={boq} fmt={fmt} currency={currency} />
          <RateAnalysisDashboard materials={data.materials} labor={data.labor} projectName={projectName} projectCost={data.totalCost} currency={currency} fmt={fmt} />
          <EstimateAccuracyReview estimate={data} boq={boq} projectName={projectName} fmt={fmt} currency={currency} />

          <section id="estimate-upgrade" className="scroll-mt-6 rounded-3xl border border-border/70 bg-card p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><LockKeyhole className="h-3.5 w-3.5" /> EXPAND YOUR WORKFLOW</div>
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Ready to work on your own project?</h2>
                <p className="text-sm leading-6 text-muted-foreground">Explore the plans to find the right level of project capacity, advanced tools and reporting for your workflow. Available features and limits depend on the selected plan.</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Button variant="outline" onClick={() => window.location.assign("/billing")}>Compare plans <ArrowRight className="ml-2 h-4 w-4" /></Button>
                <Button onClick={() => window.location.assign("/upload")}>Start with your project</Button>
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { title: "Your project workspace", detail: "Organize project inputs and keep estimate work together." },
                { title: "More detailed analysis", detail: "Explore available quantity, BOQ and rate-analysis tools." },
                { title: "Professional outputs", detail: "Review reporting and export options available to your plan." },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CheckCircle2 className="h-4 w-4" /></div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <Tabs defaultValue="estimate" className="space-y-6">
            <div className="overflow-x-auto">
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="estimate"><DollarSign className="h-4 w-4 mr-1" /> Estimate</TabsTrigger>
                <TabsTrigger value="structural"><Activity className="h-4 w-4 mr-1" /> Structural</TabsTrigger>
                <TabsTrigger value="rebar"><Construction className="h-4 w-4 mr-1" /> Rebar</TabsTrigger>
                <TabsTrigger value="boq"><FileText className="h-4 w-4 mr-1" /> BOQ</TabsTrigger>
                <TabsTrigger value="3d"><Box className="h-4 w-4 mr-1" /> 3D View</TabsTrigger>
                <TabsTrigger value="timeline"><Calendar className="h-4 w-4 mr-1" /> Timeline</TabsTrigger>
                <TabsTrigger value="quotation"><ShieldCheck className="h-4 w-4 mr-1" /> Quotation</TabsTrigger>
              </TabsList>
            </div>

            {/* ESTIMATE TAB */}
            <TabsContent value="estimate" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SectionCard title={t("est.costDist")} icon={DollarSign}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.costBreakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                          {data.costBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => currency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
                <SectionCard title={t("est.catCost")} icon={Layers}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.costBreakdown} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} fontSize={10} />
                        <YAxis type="category" dataKey="category" width={80} fontSize={10} />
                        <Tooltip formatter={(v: number) => currency(v)} />
                        <Bar dataKey="amount" fill="hsl(220, 70%, 25%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
              </div>

              <SectionCard title={t("est.civilWork")} icon={Building}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground"><th className="text-left py-2">{t("est.item")}</th><th className="text-right py-2">{t("est.amount")} (৳)</th></tr></thead>
                    <tbody>
                      {Object.entries(data.civilWork).map(([k, v]) => (
                        <tr key={k} className="border-b border-border/50"><td className="py-2">{k}</td><td className="text-right font-medium">{fmt(v)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <SectionCard title={t("est.finishing")} icon={Paintbrush}>
                  <div className="space-y-2 text-sm">
                    {Object.entries(data.finishing).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">৳{fmt(v)}</span></div>
                    ))}
                  </div>
                </SectionCard>
                <SectionCard title={t("est.electrical")} icon={Zap}>
                  <div className="space-y-2 text-sm">
                    {Object.entries(data.electrical).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{typeof v === "number" && k.includes("Cost") ? `৳${fmt(v)}` : v}</span></div>
                    ))}
                  </div>
                </SectionCard>
                <SectionCard title={t("est.plumbing")} icon={Droplets}>
                  <div className="space-y-2 text-sm">
                    {Object.entries(data.plumbing).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{typeof v === "number" && k.includes("Cost") ? `৳${fmt(v)}` : v}</span></div>
                    ))}
                  </div>
                </SectionCard>
              </div>

              <SectionCard title={t("est.aiSuggestions")} icon={Lightbulb}>
                <div className="space-y-3">
                  {suggestions.map((s, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="h-6 w-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-sm text-muted-foreground">{s}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </TabsContent>

            {/* STRUCTURAL TAB */}
            <TabsContent value="structural" className="space-y-6">
              <SectionCard title="BNBC 2022 Site & Importance Inputs" icon={ShieldCheck}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Seismic Zone</label>
                    <select value={zone} onChange={(e) => setZone(e.target.value)} className="w-full h-10 rounded-lg border border-input bg-card px-3 text-sm">
                      {Object.entries(BNBC_ZONES).map(([k, v]) => <option key={k} value={k}>{k} (Z={v})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Soil Classification</label>
                    <select value={soil} onChange={(e) => setSoil(e.target.value)} className="w-full h-10 rounded-lg border border-input bg-card px-3 text-sm">
                      {Object.entries(BNBC_SOILS).map(([k, v]) => <option key={k} value={k}>{v.label} (S={v.factor})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Importance Factor (I)</label>
                    <select value={importance} onChange={(e) => setImportance(parseFloat(e.target.value))} className="w-full h-10 rounded-lg border border-input bg-card px-3 text-sm">
                      <option value={1.0}>1.00 — Standard occupancy</option>
                      <option value={1.25}>1.25 — Important / schools</option>
                      <option value={1.5}>1.50 — Essential facilities</option>
                    </select>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="BNBC 2022 Load Analysis" icon={Activity}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Seismic Zone</p><p className="font-bold mt-1">{loads.zone}</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Zone Factor (Z)</p><p className="font-bold mt-1">{loads.zoneFactor}</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Soil Type</p><p className="font-bold mt-1">{loads.soilType} (S={loads.soilFactor})</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Importance (I)</p><p className="font-bold mt-1">{loads.importanceFactor}</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Dead Load (D)</p><p className="font-bold mt-1">{fmt(loads.totalDeadLoad)} kN</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Live Load (L)</p><p className="font-bold mt-1">{fmt(loads.totalLiveLoad)} kN</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Wind Load (W)</p><p className="font-bold mt-1">{fmt(loads.windLoad)} kN</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Earthquake (E)</p><p className="font-bold mt-1 text-accent">{fmt(loads.baseShear)} kN</p></div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs space-y-1 font-mono">
                  <p>Wind Pressure: P = 0.6V² → P = 0.6 × {loads.windSpeed}² = {(0.6 * loads.windSpeed * loads.windSpeed).toFixed(0)} N/m² = {loads.windPressure} kN/m²</p>
                  <p>Cs = (Z·I·2.5)/R = ({loads.zoneFactor}·{loads.importanceFactor}·2.5)/{loads.responseFactor} = {loads.seismicCoeff}</p>
                  <p>Base Shear: V = Cs·W·S = {loads.seismicCoeff} × {fmt(loads.buildingWeight)} × {loads.soilFactor} = {fmt(loads.baseShear)} kN</p>
                </div>
              </SectionCard>

              <SectionCard title="Complete BNBC 2022 Load Spectrum (D · L · W · S · H · F · E)" icon={Activity}>
                <p className="text-xs text-muted-foreground">
                  Every code-mandated load on the structure — Dead, Live, Wind, Snow, Lateral Earth Pressure,
                  Hydrostatic/Fluid, and Earthquake — computed per BNBC 2022 Part 6 Chapter 2.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 w-12">Code</th>
                      <th className="text-left py-2">Load Type</th>
                      <th className="text-left py-2">Intensity / Basis</th>
                      <th className="text-right py-2">Total (kN)</th>
                      <th className="text-left py-2 hidden md:table-cell">Reference</th>
                    </tr></thead>
                    <tbody>
                      {loads.loadDetails.map((d) => (
                        <tr key={d.code} className="border-b border-border/50 align-top">
                          <td className="py-2 font-mono font-bold text-accent">{d.code}</td>
                          <td className="py-2 font-medium">
                            {d.name}
                            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{d.formula}</p>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">{d.intensity}</td>
                          <td className="py-2 text-right font-semibold">{fmt(d.total)}</td>
                          <td className="py-2 text-xs text-muted-foreground hidden md:table-cell">{d.reference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="BNBC 2022 Strength Load Combinations" icon={Layers}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">#</th>
                      <th className="text-left py-2">Combination</th>
                      <th className="text-right py-2">Factored Resultant (kN)</th>
                      <th className="text-right py-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {loads.combos.map((c) => (
                        <tr key={c.name} className={`border-b border-border/50 ${c.governs ? "bg-accent/5" : ""}`}>
                          <td className="py-2 font-mono text-xs">{c.name}</td>
                          <td className="py-2 font-mono">{c.formula}</td>
                          <td className="text-right font-semibold">{fmt(c.factoredLoad)}</td>
                          <td className="text-right">
                            {c.governs ? <Badge className="bg-accent">Governs</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Reference: BNBC 2022, Part 6, Chapter 2 — Loads on Buildings (clause 2.7.3.1).
                  Resultant = vertical + 0.5 × lateral, used only for ranking. In design, vertical and lateral effects remain separate.
                </p>
              </SectionCard>

              <SectionCard title="BNBC 2022 Code Compliance Check (Auto)" icon={ShieldCheck}>
                {(() => {
                  const beamSafe = beams.every(b => b.status === "Safe");
                  const colSafe = columns.every(c => c.status === "Safe");
                  const slabSafe = slabs.every(s => s.status === "Safe");
                  const baseShearRatio = loads.buildingWeight ? loads.baseShear / loads.buildingWeight : 0;
                  const shearOk = baseShearRatio <= 0.20;
                  const windOk = loads.windSpeed <= 65;
                  const govOk = loads.governingValue < (loads.totalDeadLoad + loads.totalLiveLoad) * 3;
                  const checks = [
                    { label: "Seismic Zone & Importance applied (BNBC 2022 §2.5.4)", ok: true, note: `${loads.zone}, I=${loads.importanceFactor}` },
                    { label: "Soil site class assigned (§2.5.5)", ok: true, note: `${loads.soilType}, S=${loads.soilFactor}` },
                    { label: "Wind basic speed within BNBC map (§2.4.3)", ok: windOk, note: `V=${loads.windSpeed} m/s ≤ 65 m/s` },
                    { label: "Snow load assessed for region (§2.5)", ok: true, note: `S=${loads.snowLoad} kN (BD plains)` },
                    { label: "Seismic base-shear ratio V/W ≤ 0.20 (§2.5.7)", ok: shearOk, note: `V/W = ${baseShearRatio.toFixed(3)}` },
                    { label: "Governing combination within practical envelope (§2.7.3)", ok: govOk, note: `${loads.governingCombo} = ${fmt(loads.governingValue)} kN` },
                    { label: "Beam flexure & shear capacity (§6.3 / ACI 318 adopted)", ok: beamSafe, note: beamSafe ? "All beams Safe" : "Review needed" },
                    { label: "Column axial + tie spacing (§8.3, §8.4)", ok: colSafe, note: colSafe ? "All columns Safe" : "Review needed" },
                    { label: "Slab thickness & reinforcement (§6.5)", ok: slabSafe, note: slabSafe ? "All slabs Safe" : "Review needed" },
                  ];
                  const passed = checks.filter(c => c.ok).length;
                  const score = Math.round((passed / checks.length) * 100);
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Overall BNBC 2022 Compliance</p>
                          <p className="text-2xl font-bold text-accent">{score}%</p>
                        </div>
                        <Badge className={score === 100 ? "bg-emerald-600" : score >= 80 ? "bg-amber-500" : "bg-destructive"}>
                          {score === 100 ? "Fully Compliant" : score >= 80 ? "Minor Review" : "Action Required"}
                        </Badge>
                      </div>
                      <div className="grid gap-2">
                        {checks.map((c, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 text-sm border-b border-border/40 pb-2">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${c.ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-destructive/20 text-destructive"}`}>
                                {c.ok ? "✓" : "!"}
                              </span>
                              <span className="font-medium">{c.label}</span>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{c.note}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs space-y-1">
                        <p className="font-semibold">Combined Factored Results (auto)</p>
                        <p className="font-mono">Governing: {loads.governingCombo} → {loads.combos.find(c=>c.governs)?.formula}</p>
                        <p className="font-mono">Factored Resultant = {fmt(loads.governingValue)} kN</p>
                        <p className="font-mono">Service Vertical (D+L) = {fmt(loads.totalDeadLoad + loads.totalLiveLoad)} kN · Lateral (max W,E) = {fmt(Math.max(loads.windLoad, loads.baseShear))} kN</p>
                      </div>
                    </div>
                  );
                })()}
              </SectionCard>

              <SectionCard title="Beam Design (Bending & Shear)" icon={Layers}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Span (ft)</th>
                      <th className="text-right py-2">Size (in)</th>
                      <th className="text-right py-2">M = wL²/8 (kN·m)</th>
                      <th className="text-right py-2">V = wL/2 (kN)</th>
                      <th className="text-right py-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {beams.map((b, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2">{b.span}</td>
                          <td className="text-right">{b.width} × {b.depth}</td>
                          <td className="text-right font-medium">{b.maxMoment}</td>
                          <td className="text-right font-medium">{b.maxShear}</td>
                          <td className="text-right">
                            <Badge variant={b.status === "Safe" ? "default" : "destructive"} className={b.status === "Safe" ? "bg-green-600" : ""}>{b.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="Column Analysis" icon={Building}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Section</th>
                      <th className="text-right py-2">Axial Load (kN)</th>
                      <th className="text-right py-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {columns.map((c, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 font-medium">{c.size}</td>
                          <td className="text-right">{fmt(c.axialLoad)}</td>
                          <td className="text-right"><Badge className="bg-green-600">{c.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="AI Engineering Recommendations" icon={Lightbulb}>
                <div className="space-y-2">
                  {aiRecs.map((r, i) => (
                    <div key={i} className="flex gap-2 items-start text-sm">
                      <span className="text-accent">▸</span><span className="text-muted-foreground">{r}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </TabsContent>

            {/* REBAR TAB */}
            <TabsContent value="rebar" className="space-y-6">
              <SectionCard title="Beam Reinforcement" icon={Construction}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Beam (Span)</th>
                      <th className="text-left py-2">Top Bars</th>
                      <th className="text-left py-2">Bottom Bars</th>
                      <th className="text-left py-2">Stirrups</th>
                    </tr></thead>
                    <tbody>
                      {beams.map((b, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 font-medium">{b.span} ft</td>
                          <td>{b.topRebar}</td>
                          <td>{b.bottomRebar}</td>
                          <td>{b.stirrups}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="Column Reinforcement" icon={Construction}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Section</th>
                      <th className="text-left py-2">Main Bars</th>
                      <th className="text-left py-2">Ties</th>
                    </tr></thead>
                    <tbody>
                      {columns.map((c, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 font-medium">{c.size}</td>
                          <td>{c.mainBars}</td>
                          <td>{c.ties}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="Slab Reinforcement" icon={Construction}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Panel</th>
                      <th className="text-right py-2">Thickness</th>
                      <th className="text-left py-2">Main Rebar</th>
                      <th className="text-left py-2">Distribution</th>
                    </tr></thead>
                    <tbody>
                      {slabs.map((s, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 font-medium">{s.panel}</td>
                          <td className="text-right">{s.thickness}"</td>
                          <td>{s.mainRebar}</td>
                          <td>{s.distRebar}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </TabsContent>

            {/* BOQ TAB */}
            <TabsContent value="boq" className="space-y-6">
              {(() => {
                const fullTotal = boq.reduce((sum, item) => sum + item.total, 0);
                const filteredTotal = filteredBOQ.reduce((sum, item) => sum + item.total, 0);
                const categories = Array.from(new Set(boq.map((item) => getBOQCategory(item.item)))).sort();
                return (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "BOQ line items", value: String(boq.length), note: "All generated quantity items" },
                        { label: "Visible items", value: String(filteredBOQ.length), note: "Matching current filters" },
                        { label: "Full BOQ value", value: currency(fullTotal), note: "All generated BOQ items" },
                        { label: "Filtered value", value: currency(filteredTotal), note: "Sum of visible rows only" },
                      ].map((metric) => (
                        <div key={metric.label} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                          <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                          <p className="mt-2 break-words text-xl font-bold tracking-tight">{metric.value}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                        </div>
                      ))}
                    </div>

                    <SectionCard title="Detailed Bill of Quantities" icon={FileText} action={
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => exportBOQCsv(filteredBOQ, "_filtered")} disabled={filteredBOQ.length === 0}>
                          <Download className="mr-1 h-4 w-4" /> Export filtered
                        </Button>
                        <Button size="sm" onClick={() => exportBOQCsv()}>
                          <Download className="mr-1 h-4 w-4" /> Export all
                        </Button>
                      </div>
                    }>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-end">
                        <div className="space-y-1.5">
                          <label htmlFor="boq-search" className="text-xs font-medium text-muted-foreground">Search BOQ items</label>
                          <Input id="boq-search" value={boqSearch} onChange={(event) => setBoqSearch(event.target.value)} placeholder="Search item or unit…" />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="boq-category" className="text-xs font-medium text-muted-foreground">Work category</label>
                          <select id="boq-category" value={boqCategory} onChange={(event) => setBoqCategory(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                            <option value="all">All categories</option>
                            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </div>
                        <Button type="button" variant="ghost" onClick={() => { setBoqSearch(""); setBoqCategory("all"); }}>Reset filters</Button>
                      </div>

                      <div className="mt-4 overflow-x-auto rounded-xl border border-border/70">
                        <table className="w-full min-w-[700px] text-sm">
                          <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                            <tr className="border-b">
                              <th scope="col" className="px-3 py-3 text-left font-medium">Description</th>
                              <th scope="col" className="px-3 py-3 text-left font-medium">Category</th>
                              <th scope="col" className="px-3 py-3 text-right font-medium">Quantity</th>
                              <th scope="col" className="px-3 py-3 text-left font-medium">Unit</th>
                              <th scope="col" className="px-3 py-3 text-right font-medium">Rate (৳)</th>
                              <th scope="col" className="px-3 py-3 text-right font-medium">Amount (৳)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBOQ.map((item, index) => (
                              <tr key={`${item.item}-${index}`} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                                <td className="px-3 py-3 font-medium">{item.item}</td>
                                <td className="px-3 py-3"><Badge variant="secondary" className="whitespace-nowrap">{getBOQCategory(item.item)}</Badge></td>
                                <td className="px-3 py-3 text-right tabular-nums">{fmt(item.qty)}</td>
                                <td className="px-3 py-3">{item.unit}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{fmt(item.rate)}</td>
                                <td className="px-3 py-3 text-right font-semibold tabular-nums">{currency(item.total)}</td>
                              </tr>
                            ))}
                            {filteredBOQ.length === 0 && (
                              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No BOQ items match these filters. Try a different search or reset the filters.</td></tr>
                            )}
                          </tbody>
                          <tfoot className="bg-muted/50">
                            <tr>
                              <td colSpan={5} className="px-3 py-3 text-right font-bold">VISIBLE SUBTOTAL</td>
                              <td className="px-3 py-3 text-right font-bold text-accent tabular-nums">{currency(filteredTotal)}</td>
                            </tr>
                            <tr>
                              <td colSpan={5} className="px-3 pb-3 text-right text-xs text-muted-foreground">Full BOQ total (unfiltered)</td>
                              <td className="px-3 pb-3 text-right text-xs font-semibold text-muted-foreground tabular-nums">{currency(fullTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">Quantities and rates are generated from the current preliminary estimate inputs. Category labels are keyword-based grouping for navigation, not a certified work breakdown structure. Confirm quantities against approved drawings and current local rates before procurement.</p>
                    </SectionCard>
                  </>
                );
              })()}
            </TabsContent>

            {/* 3D VIEW TAB */}
            <TabsContent value="3d" className="space-y-6">
              <SectionCard title="Interactive 3D Building Model" icon={Box}>
                <p className="text-xs text-muted-foreground">Drag to rotate • scroll to zoom • right-click to pan</p>
                <Building3D
                  plotLength={params.plotLength}
                  plotWidth={params.plotWidth}
                  floors={params.floors}
                  floorHeight={params.floorHeight}
                />
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-muted/40 rounded-lg p-2 text-center"><span className="text-muted-foreground">Walls</span><br/><span className="font-bold">RCC</span></div>
                  <div className="bg-muted/40 rounded-lg p-2 text-center"><span className="text-muted-foreground">Slabs</span><br/><span className="font-bold">{slabs[0].thickness}"</span></div>
                  <div className="bg-muted/40 rounded-lg p-2 text-center"><span className="text-muted-foreground">Floors</span><br/><span className="font-bold">{params.floors}</span></div>
                </div>
              </SectionCard>
            </TabsContent>

            {/* TIMELINE TAB */}
            <TabsContent value="timeline" className="space-y-6">
              <SectionCard title="Construction Timeline (Gantt)" icon={Calendar}>
                <div className="space-y-3">
                  {timeline.map((p, i) => {
                    const leftPct = (p.startMonth / totalDuration) * 100;
                    const widthPct = (p.durationMonths / totalDuration) * 100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-muted-foreground">M{p.startMonth.toFixed(1)} – M{(p.startMonth + p.durationMonths).toFixed(1)}</span>
                        </div>
                        <div className="relative h-6 bg-muted/40 rounded-md overflow-hidden">
                          <div
                            className="absolute h-full rounded-md"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: p.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>Month 0</span>
                  <span>Month {Math.ceil(totalDuration)}</span>
                </div>
              </SectionCard>
            </TabsContent>

            {/* QUOTATION TAB */}
            <TabsContent value="quotation" className="space-y-6">
              <SectionCard title="Contractor Quotation — Fully Justified" icon={ShieldCheck} action={
                <Button size="sm" variant="outline" onClick={exportQuotationCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
              }>
                <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-lg p-6 space-y-2">
                  {quotation.justification.map((j) => (
                    <div key={j.label} className="border-b border-border/40 last:border-0 pb-2 last:pb-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{j.label}</span>
                        <span className="font-semibold">৳{fmt(j.amount)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{j.note}</p>
                    </div>
                  ))}
                  <div className="border-t pt-3 flex justify-between text-sm">
                    <span>Full Project Cost (before profit)</span>
                    <span className="font-semibold">৳{fmt(quotation.baseProjectCost)}</span>
                  </div>
                  <div className="flex justify-between text-lg pt-1">
                    <span className="font-bold">TOTAL QUOTATION</span>
                    <span className="font-bold text-accent">৳{fmt(quotation.total)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    ✓ Single 10% contractor profit applied on full project cost — overhead/contingency are NOT double counted.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Project Duration</p><p className="font-bold mt-1">{quotation.durationMonths} months</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Quote Validity</p><p className="font-bold mt-1">{quotation.validityDays} days</p></div>
                  <div className="bg-muted/40 rounded-lg p-3"><p className="text-muted-foreground text-xs">Cost / sqft</p><p className="font-bold mt-1">৳{fmt(Math.round(quotation.total / data.totalFloorArea))}</p></div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Payment Terms</p>
                  <p className="font-medium">{quotation.paymentTerms}</p>
                </div>
                <Button onClick={generatePDF} className="w-full">
                  <Download className="h-4 w-4 mr-1" /> Download Full Quotation (PDF)
                </Button>
              </SectionCard>
            </TabsContent>
          </Tabs>

          <div className="bg-muted/50 rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground">
              ⚠️ This system provides AI-based preliminary structural analysis and estimation. Final engineering design must be verified by a licensed structural engineer.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default EstimatePage;
