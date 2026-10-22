// HTML rendering of a ReportModel — used for the on-page preview and "Print / Save as PDF" (the browser prints Bengali correctly).
import type { Block, ReportModel } from "./reportBuilder";

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const block = (b: Block): string => {
  if (b.type === "kv") return `<table class="kv">${b.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
  if (b.type === "text") return `<p>${esc(b.text).replace(/\n/g, "<br>")}</p>`;
  if (b.type === "bullets") return `<ul>${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const r = new Set(b.right ?? []); const cell = (t: string, n: number, tag: string) => `<${tag}${r.has(n) ? ' class="r"' : ""}>${esc(t)}</${tag}>`;
  return `<table class="grid"><thead><tr>${b.head.map((h, n) => cell(h, n, "th")).join("")}</tr></thead><tbody>${b.rows.map((row) => `<tr>${row.map((c, n) => cell(c, n, "td")).join("")}</tr>`).join("")}</tbody>${b.foot ? `<tfoot><tr>${b.foot.map((c, n) => cell(c, n, "td")).join("")}</tr></tfoot>` : ""}</table>`;
};

export function renderReportHtml(m: ReportModel): string {
  const meta = [m.company, m.projectName && `Project: ${m.projectName}`, m.preparedBy && `Prepared by: ${m.preparedBy}`, `Date: ${m.generated}`].filter(Boolean).map(esc).join(" &middot; ");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title><style>
body{font-family:"Segoe UI","Noto Sans Bengali","Noto Sans",Arial,sans-serif;color:#1f2937;margin:0;padding:24px;font-size:12px;line-height:1.45}
h1{font-size:22px;margin:0 0 4px;color:#14285a}h2{font-size:15px;margin:22px 0 8px;color:#14285a;border-bottom:1px solid #cbd5e1;padding-bottom:3px}
.meta{color:#475569;margin-bottom:6px}table{border-collapse:collapse;width:100%;margin:6px 0}
.kv th{text-align:left;width:38%;color:#475569;font-weight:600;padding:3px 6px;vertical-align:top}.kv td{padding:3px 6px}
.grid th{background:#14285a;color:#fff;text-align:left;padding:4px 6px}.grid td{border-bottom:1px solid #e2e8f0;padding:3px 6px;vertical-align:top}
.grid tfoot td{font-weight:700;border-top:2px solid #14285a}.r{text-align:right!important}
tr{page-break-inside:avoid}h2{page-break-after:avoid}.skip{color:#92400e;background:#fffbeb;border:1px solid #fde68a;padding:6px 8px;border-radius:4px}
.disc{margin-top:22px;font-size:10.5px;color:#64748b;border-top:1px solid #cbd5e1;padding-top:8px}
@media print{body{padding:0}}</style></head><body>
<h1>${esc(m.title)}</h1><div class="meta">${meta}</div>
${m.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.blocks.map(block).join("")}`).join("\n")}
${m.skipped.length ? `<h2>Not included</h2><div class="skip">${m.skipped.map((s) => `<div>${esc(s.id)}: ${esc(s.reason)}</div>`).join("")}</div>` : ""}
<div class="disc">${esc(m.disclaimer)}</div></body></html>`;
}
