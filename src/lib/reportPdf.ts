// PDF rendering of a ReportModel with jsPDF (built-in Latin fonts: non-Latin characters are shown as "?";
// use "Print / Save as PDF" in the browser for Bengali text).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportModel } from "./reportBuilder";

export const pdfSafe = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF²×·—–]/g, "?");
export const hasNonLatin = (m: ReportModel) => { const j = JSON.stringify(m); return pdfSafe(j) !== j; };

export function renderReportPdf(m: ReportModel): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 15, TW = W - 2 * M; let y = M;
  const need = (h: number) => { if (y + h > 280) { doc.addPage(); y = M; } };
  const text = (t: string, size: number, bold = false, color: [number, number, number] = [31, 41, 55]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(pdfSafe(t), TW) as string[]) { need(size * 0.5); doc.text(line, M, y); y += size * 0.45; }
  };
  text(m.title, 20, true, [20, 40, 90]); y += 1;
  const meta = [m.company, m.projectName && `Project: ${m.projectName}`, m.preparedBy && `Prepared by: ${m.preparedBy}`, `Date: ${m.generated}`].filter(Boolean).join("  |  ");
  text(meta, 9.5, false, [71, 85, 105]); y += 3;
  const after = () => { y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4; };
  for (const s of m.sections) {
    need(48); y += 4; text(s.title, 13, true, [20, 40, 90]); doc.setDrawColor(203, 213, 225); doc.line(M, y, W - M, y); y += 3;
    for (const b of s.blocks) {
      if (b.type === "text") { text(b.text, 9.5); y += 1.5; }
      else if (b.type === "bullets") { for (const it of b.items) text(`- ${it}`, 9); y += 1.5; }
      else if (b.type === "kv") { need(20); autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: "plain", body: b.rows.map(([k, v]) => [pdfSafe(k), pdfSafe(v)]), styles: { fontSize: 9.5, cellPadding: 1.2 }, columnStyles: { 0: { fontStyle: "bold", textColor: [71, 85, 105], cellWidth: 62 } } }); after(); }
      else {
        const right = Object.fromEntries((b.right ?? []).map((n) => [n, { halign: "right" as const }]));
        need(32); // keep a table header together with its first rows
        const rset = new Set(b.right ?? []);
        autoTable(doc, { startY: y, margin: { left: M, right: M }, head: [b.head.map(pdfSafe)], body: b.rows.map((r) => r.map(pdfSafe)), foot: b.foot ? [b.foot.map(pdfSafe)] : undefined,
          styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: [20, 40, 90], textColor: 255 }, footStyles: { fillColor: [241, 245, 249], textColor: [20, 40, 90], fontStyle: "bold" }, alternateRowStyles: { fillColor: [248, 250, 252] }, columnStyles: right, showFoot: "lastPage", didParseCell: (h) => { if (h.section !== "body" && rset.has(h.column.index)) h.cell.styles.halign = "right"; } }); after();
      }
    }
  }
  if (m.skipped.length) { need(20); y += 4; text("Not included", 13, true, [146, 64, 14]); for (const s of m.skipped) text(`${s.id}: ${s.reason}`, 9); }
  y += 4; text(m.disclaimer, 8.5, false, [100, 116, 139]);
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120); doc.text(`CivilOS AI  |  ${pdfSafe(m.title)}  |  Page ${p} of ${n}`, W / 2, 291, { align: "center" }); }
  return doc;
}
