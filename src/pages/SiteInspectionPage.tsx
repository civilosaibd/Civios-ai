import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ClipboardCheck, Download, RotateCcw } from "lucide-react";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";

const checks = [
  ["Before work", "Approved drawing and latest revision available"],
  ["Setting out", "Grid lines, dimensions and levels verified"],
  ["Formwork", "Dimensions, line, level, plumb and supports checked"],
  ["Reinforcement", "Bar diameter, spacing and quantity match drawings"],
  ["Reinforcement", "Cover blocks, laps, anchorage and ties checked"],
  ["Concrete", "Approved mix and materials confirmed"],
  ["Concrete", "Slump / fresh concrete checks completed as specified"],
  ["Concrete", "Compaction, placement and curing arrangements ready"],
  ["Masonry", "Line, level, plumb and joint thickness checked"],
  ["Safety", "PPE, access, edge protection and housekeeping checked"],
] as const;

export default function SiteInspectionPage() {
  const [project, setProject] = useState("");
  const [inspector, setInspector] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string[]>(checks.map(() => "Pending"));
  const [notes, setNotes] = useState<string[]>(checks.map(() => ""));
  const exportCsv = () => {
    const rows = [["Project", project], ["Inspector", inspector], ["Date", date], [], ["Category", "Checklist item", "Status", "Notes"], ...checks.map((c, i) => [c[0], c[1], status[i], notes[i]])];
    const csv = rows.map(r => r.map(v => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "civilos-site-inspection.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return <SidebarProvider><SEO title="Site Inspection Checklist — CivilOS AI" description="Construction site inspection checklist and CSV report export." /><div className="flex min-h-screen w-full bg-background"><DashboardSidebar /><div className="flex min-w-0 flex-1 flex-col"><header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4"><div className="flex items-center gap-2"><SidebarTrigger /><h1 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4 text-accent" /> Site Inspection</h1></div><ThemeToggle /></header><main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Site Inspection Checklist</h2><p className="text-sm text-muted-foreground">Record inspection results and export a field report.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => { setStatus(checks.map(() => "Pending")); setNotes(checks.map(() => "")); }}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button><Button onClick={exportCsv}><Download className="mr-2 h-4 w-4" /> Export CSV</Button></div></div><Card className="grid gap-3 p-4 md:grid-cols-3"><div><label className="text-xs text-muted-foreground">Project</label><Input value={project} onChange={e => setProject(e.target.value)} placeholder="Project name" /></div><div><label className="text-xs text-muted-foreground">Inspector</label><Input value={inspector} onChange={e => setInspector(e.target.value)} placeholder="Inspector name" /></div><div><label className="text-xs text-muted-foreground">Date</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div></Card><div className="grid grid-cols-3 gap-3">{["Pass", "Fail", "Pending"].map(s => <Card key={s} className="p-3"><p className="text-xs text-muted-foreground">{s}</p><p className="text-2xl font-bold">{status.filter(x => x === s).length}</p></Card>)}</div>{checks.map((c, i) => <Card key={i} className="space-y-3 p-4"><p className="text-xs text-muted-foreground">{c[0]}</p><p className="font-medium">{c[1]}</p><div className="flex flex-wrap gap-2">{["Pass", "Fail", "Pending", "N/A"].map(s => <Button key={s} size="sm" variant={status[i] === s ? "default" : "outline"} onClick={() => setStatus(old => old.map((v, j) => j === i ? s : v))}>{s}</Button>)}</div><Input value={notes[i]} onChange={e => setNotes(old => old.map((v, j) => j === i ? e.target.value : v))} placeholder="Observation / corrective action (optional)" /></Card>)}<p className="text-xs text-muted-foreground">Field aid only. Follow approved drawings, project specifications, inspection/test plans and site safety rules. This version does not save records to your account; export CSV to keep a copy.</p></main></div></div></SidebarProvider>;
}
