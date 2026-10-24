import { useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Download, RotateCcw, Save, Trash2, FilePlus2, Cloud, HardDrive } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { useCloudState } from "@/lib/cloudState";
import { useAuth } from "@/lib/auth";

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

const options = ["Pass", "Fail", "Pending", "N/A"] as const;
type CheckStatus = typeof options[number];
type InspectionRecord = {
  id: string;
  project: string;
  inspector: string;
  date: string;
  status: CheckStatus[];
  notes: string[];
  createdAt: string;
  updatedAt: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const freshStatus = (): CheckStatus[] => checks.map(() => "Pending");
const freshNotes = () => checks.map(() => "");
const newId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `inspection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function SiteInspectionPage() {
  const { user } = useAuth();
  const [records, setRecords, synced] = useCloudState<InspectionRecord[]>("civilos.site-inspections", []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [inspector, setInspector] = useState("");
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<CheckStatus[]>(freshStatus);
  const [notes, setNotes] = useState<string[]>(freshNotes);
  const [search, setSearch] = useState("");

  const orderedRecords = useMemo(
    () => [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records],
  );
  const filteredRecords = orderedRecords.filter((r) =>
    `${r.project} ${r.inspector} ${r.date}`.toLowerCase().includes(search.toLowerCase().trim()),
  );
  const completed = status.filter((s) => s === "Pass" || s === "Fail" || s === "N/A").length;

  const resetForm = () => {
    setActiveId(null);
    setProject("");
    setInspector("");
    setDate(today());
    setStatus(freshStatus());
    setNotes(freshNotes());
  };

  const loadRecord = (record: InspectionRecord) => {
    setActiveId(record.id);
    setProject(record.project);
    setInspector(record.inspector);
    setDate(record.date);
    setStatus(record.status.length === checks.length ? [...record.status] : freshStatus());
    setNotes(record.notes.length === checks.length ? [...record.notes] : freshNotes());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveInspection = () => {
    if (!project.trim()) return toast.error("Enter a project name before saving.");
    if (!date) return toast.error("Choose the inspection date.");
    const now = new Date().toISOString();
    if (activeId) {
      setRecords((old) => old.map((r) => r.id === activeId
        ? { ...r, project: project.trim(), inspector: inspector.trim(), date, status: [...status], notes: [...notes], updatedAt: now }
        : r));
      toast.success("Inspection report updated.");
    } else {
      const record: InspectionRecord = {
        id: newId(), project: project.trim(), inspector: inspector.trim(), date,
        status: [...status], notes: [...notes], createdAt: now, updatedAt: now,
      };
      setRecords((old) => [record, ...old]);
      setActiveId(record.id);
      toast.success("Inspection report saved.");
    }
  };

  const deleteRecord = (id: string) => {
    const record = records.find((r) => r.id === id);
    if (!record) return;
    if (!window.confirm(`Delete the inspection report for "${record.project}"?`)) return;
    setRecords((old) => old.filter((r) => r.id !== id));
    if (activeId === id) resetForm();
    toast.success("Inspection report deleted.");
  };

  const exportCsv = (record?: InspectionRecord) => {
    const data = record ?? {
      id: activeId ?? "draft", project, inspector, date, status, notes,
      createdAt: "", updatedAt: "",
    };
    const rows = [
      ["Project", data.project], ["Inspector", data.inspector], ["Date", data.date],
      ["Checklist completion", `${data.status.filter((s) => s !== "Pending").length}/${checks.length}`],
      [], ["Category", "Checklist item", "Status", "Notes"],
      ...checks.map((c, i) => [c[0], c[1], data.status[i] ?? "Pending", data.notes[i] ?? ""]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `civilos-site-inspection-${(data.project || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${data.date || today()}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <SidebarProvider>
      <SEO title="Site Inspection Checklist — CivilOS AI" description="Save, manage and export construction site inspection reports." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <h1 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4 text-accent" /> Site Inspection</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground" title={user ? (synced ? "Cloud sync ready" : "Preparing cloud sync") : "Saved on this device"}>
              {user && synced ? <Cloud className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
              <span className="hidden sm:inline">{user ? (synced ? "Cloud workspace" : "Syncing…") : "Device only"}</span>
              <ThemeToggle />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Site Inspection Checklist</h2>
                <p className="text-sm text-muted-foreground">Record field checks, keep inspection history, and export a CSV report.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={resetForm}><FilePlus2 className="mr-2 h-4 w-4" /> New report</Button>
                <Button variant="outline" onClick={() => { setStatus(freshStatus()); setNotes(freshNotes()); }}><RotateCcw className="mr-2 h-4 w-4" /> Reset checks</Button>
                <Button variant="outline" onClick={() => exportCsv()}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
                <Button onClick={saveInspection}><Save className="mr-2 h-4 w-4" /> {activeId ? "Update report" : "Save report"}</Button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-4">
                <Card className="grid gap-3 p-4 md:grid-cols-3">
                  <div><label htmlFor="inspection-project" className="text-xs text-muted-foreground">Project *</label><Input id="inspection-project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Project name" /></div>
                  <div><label htmlFor="inspection-inspector" className="text-xs text-muted-foreground">Inspector</label><Input id="inspection-inspector" value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="Inspector name" /></div>
                  <div><label htmlFor="inspection-date" className="text-xs text-muted-foreground">Date *</label><Input id="inspection-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                </Card>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Pass", value: status.filter((s) => s === "Pass").length },
                    { label: "Fail", value: status.filter((s) => s === "Fail").length },
                    { label: "Pending", value: status.filter((s) => s === "Pending").length },
                  ].map((item) => <Card key={item.label} className="p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="text-2xl font-bold">{item.value}</p></Card>)}
                </div>
                <p className="text-xs text-muted-foreground">{completed} of {checks.length} checks reviewed.</p>
                {checks.map((check, i) => (
                  <Card key={i} className="space-y-3 p-4">
                    <p className="text-xs text-muted-foreground">{check[0]}</p>
                    <p className="font-medium">{check[1]}</p>
                    <div className="flex flex-wrap gap-2">
                      {options.map((option) => <Button key={option} size="sm" variant={status[i] === option ? "default" : "outline"} aria-pressed={status[i] === option} onClick={() => setStatus((old) => old.map((value, j) => j === i ? option : value))}>{option}</Button>)}
                    </div>
                    <Input aria-label={`Observation or corrective action: ${check[1]}`} value={notes[i] ?? ""} onChange={(e) => setNotes((old) => old.map((value, j) => j === i ? e.target.value : value))} placeholder="Observation / corrective action (optional)" />
                  </Card>
                ))}
                <p className="text-xs text-muted-foreground">Field aid only. Follow approved drawings, project specifications, inspection/test plans and site safety rules. The checklist is a recordkeeping aid, not a substitute for a qualified inspection or formal sign-off.</p>
              </section>

              <aside className="space-y-3">
                <Card className="space-y-3 p-4">
                  <div><h3 className="font-semibold">Saved inspections</h3><p className="text-xs text-muted-foreground">{records.length} report{records.length === 1 ? "" : "s"} saved</p></div>
                  <Input aria-label="Search saved inspections" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project or inspector…" />
                  {filteredRecords.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">No saved inspections found.</p> : (
                    <div className="max-h-[65vh] space-y-2 overflow-y-auto">
                      {filteredRecords.map((record) => (
                        <div key={record.id} className={`rounded-lg border p-3 space-y-2 ${activeId === record.id ? "border-primary bg-primary/5" : ""}`}>
                          <button type="button" className="w-full text-left" onClick={() => loadRecord(record)}>
                            <span className="block truncate font-medium">{record.project}</span>
                            <span className="block text-xs text-muted-foreground">{record.date}{record.inspector ? ` · ${record.inspector}` : ""}</span>
                          </button>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge variant={record.status.includes("Fail") ? "destructive" : "outline"}>{record.status.filter((s) => s !== "Pending").length}/{checks.length} reviewed</Badge>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" aria-label={`Export ${record.project} report`} onClick={() => exportCsv(record)}><Download className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" aria-label={`Delete ${record.project} report`} onClick={() => deleteRecord(record.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
