// Construction visualization report (PDF). Everything printed comes from the verified model — nothing is invented.
// Quantities are model-derived counts and areas, NOT a bill of quantities; assumptions are listed as such.
import jsPDF from "jspdf";
import type { BuildingModel } from "./types";
import { summarize } from "./model";
import { STAGES } from "./stages";
import type { Kind } from "./geometry";

export interface ReportData {
  title: string; generated: string; buildingType: string; sourceType: string; conceptual: boolean; unitSystem: string;
  facts: [string, string][];
  scale: string;
  stageRows: { n: number; name: string; elements: string; count: number }[];
  lowConfidence: string[];
  assumptions: string[]; warnings: string[];
  disclaimer: string;
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const SCALE_TEXT: Record<string, string> = {
  dxf: "Read from the CAD drawing units (reference)", dimensions: "Derived from dimensions printed on the drawing (reference)",
  manual: "Entered/confirmed by the user (user-provided)", "area-assumed": "ASSUMED from an approximate total area (estimated)", none: "No scale — proportions only (estimated)",
};
export const REPORT_DISCLAIMER = "AI-assisted visualization — not a structural design, construction drawing, schedule or bill of quantities. Items marked \"estimated\" are AI or default assumptions. Verify everything with a licensed engineer before construction.";

/** meshCounts: number of rendered elements per kind (from the built scene) so the stage table shows real numbers. */
export function buildReportData(m: BuildingModel, meshCounts: Partial<Record<Kind, number>>, now: Date = new Date()): ReportData {
  const s = summarize(m), est = (b: string) => (b === "estimated" ? " (estimated)" : b === "user" ? " (user-confirmed)" : " (reference)");
  const imperial = m.unitSystem === "imperial";
  const len = (v: number) => (imperial ? `${f1(v * 3.28084)} ft` : `${f1(v)} m`);
  const area = (v: number) => (imperial ? `${Math.round(v * 10.7639).toLocaleString("en-US")} sq ft` : `${f1(v)} m²`);
  const stageRows = STAGES.filter((st) => st.kinds.length).map((st) => {
    const count = st.kinds.reduce((a, k) => a + (meshCounts[k] ?? 0), 0);
    return { n: st.n, name: st.en, elements: st.kinds.join(", "), count };
  });
  return {
    title: m.name || "Untitled building", generated: now.toISOString().slice(0, 10), buildingType: m.buildingType, sourceType: m.sourceType, conceptual: m.conceptual, unitSystem: m.unitSystem,
    facts: [
      ["Floors", String(s.floors)], ["Overall size (W × D)", `${len(s.widthM)} × ${len(s.depthM)}`], ["Height incl. parapet", len(s.heightM)],
      ["Footprint area", area(s.footprintM2) + est(m.footprint.basis)], ["Total floor area", area(s.totalFloorAreaM2)],
      ["Floor height", len(m.floorHeight.value) + est(m.floorHeight.basis)],
      ["Walls / columns", `${s.walls} / ${s.columns}`], ["Doors / windows", `${s.doors} / ${s.windows}`], ["Stairs / balconies", `${s.stairs} / ${s.balconies}`], ["Rooms (ground floor)", String(s.rooms)],
      ["Structure / exterior", `${m.materials.structure} / ${m.materials.exterior}`], ["Roof", `${m.roof.type}${est(m.roof.basis)}`],
    ],
    scale: (SCALE_TEXT[m.scale.source] ?? SCALE_TEXT.none) + (m.scale.spreadPct != null ? ` · measurement spread ${f1(m.scale.spreadPct)}%` : ""),
    stageRows,
    lowConfidence: s.lowConfidence.map((x) => `${x.type} ${x.id} — ${Math.round(x.confidence * 100)}% (not verified)`),
    assumptions: [...m.assumptions], warnings: [...m.warnings], disclaimer: REPORT_DISCLAIMER,
  };
}

/** Renders the PDF. `image` is an optional data URL of the current 3D view (PNG/JPEG). Latin text only (built-in PDF fonts). */
export function renderReportPdf(d: ReportData, image?: string | null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 15, TW = W - M * 2; let y = M;
  const ascii = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF²×·—–]/g, "?");
  const need = (h: number) => { if (y + h > 285) { doc.addPage(); y = M; } };
  const h2 = (t: string) => { need(12); y += 3; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20, 40, 90); doc.text(t, M, y); y += 2; doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 5; };
  const para = (t: string, size = 9.5, color: [number, number, number] = [40, 40, 40]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(ascii(t), TW) as string[]) { need(5); doc.text(line, M, y); y += size * 0.45 + 0.8; }
  };
  const bullet = (t: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(ascii(t), TW - 5) as string[];
    lines.forEach((l, i) => { need(5); if (i === 0) doc.text("-", M + 1, y); doc.text(l, M + 5, y); y += 5; });
  };

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(20, 40, 90); doc.text("CivilOS AI - 3D Construction Report", M, y); y += 8;
  doc.setFontSize(13); doc.setTextColor(30); doc.text(ascii(d.title), M, y); y += 6;
  para(`${d.buildingType} - source: ${d.sourceType} - units: ${d.unitSystem} - generated ${d.generated}`, 9, [100, 100, 100]);
  if (d.conceptual) { y += 1; para("CONCEPTUAL 3D RECONSTRUCTION - exact geometry could not be recovered from the source; proportions are inferred.", 9.5, [180, 83, 9]); }
  y += 2;
  if (image) {
    try {
      const p = doc.getImageProperties(image), w = TW, h = Math.min(95, (p.height / p.width) * w), ww = (p.width / p.height) * h > w ? w : (p.width / p.height) * h;
      need(h + 4); doc.addImage(image, p.fileType, M + (w - ww) / 2, y, ww, h); y += h + 3;
      para("3D view at export time (procedural model with generic surroundings, not a photograph).", 8, [110, 110, 110]);
    } catch { para("(3D view image could not be embedded.)", 8, [150, 60, 60]); }
  }
  h2("Model summary");
  for (const [k, v] of d.facts) { need(5.5); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(60); doc.text(ascii(k), M, y); doc.setFont("helvetica", "normal"); doc.setTextColor(30); doc.text(ascii(v), M + 62, y); y += 5.2; }
  h2("Scale basis"); para(d.scale);
  h2("Illustrative construction sequence");
  para("Order in which the modelled elements are built up in the viewer. Not a schedule: no durations or costs are implied.", 9, [100, 100, 100]);
  for (const r of d.stageRows) { need(5.5); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(30); doc.text(`${r.n}. ${r.name}`, M, y); doc.setFont("helvetica", "normal"); doc.setTextColor(70); doc.text(ascii(r.elements), M + 62, y); doc.text(`${r.count} model elements`, W - M, y, { align: "right" }); y += 5.2; }
  if (d.lowConfidence.length) { h2("Low-confidence items (not verified)"); d.lowConfidence.slice(0, 40).forEach(bullet); if (d.lowConfidence.length > 40) para(`... and ${d.lowConfidence.length - 40} more`, 9); }
  h2("Assumptions (estimated / AI-inferred)"); if (d.assumptions.length) d.assumptions.forEach(bullet); else para("None recorded.");
  if (d.warnings.length) { h2("Warnings"); d.warnings.forEach(bullet); }
  need(24); y += 4; doc.setDrawColor(220, 160, 60); doc.setFillColor(255, 247, 230);
  const lines = doc.splitTextToSize(ascii(d.disclaimer), TW - 6) as string[]; const bh = lines.length * 4.6 + 6; need(bh);
  doc.rect(M, y, TW, bh, "FD"); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90, 60, 10); lines.forEach((l, i) => doc.text(l, M + 3, y + 5.5 + i * 4.6));
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(`CivilOS AI - ${ascii(d.title)} - page ${i}/${n}`, W / 2, 292, { align: "center" }); }
  return doc;
}
