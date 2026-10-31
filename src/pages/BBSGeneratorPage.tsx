import { useEffect, useMemo, useState } from "react";
import { useCloudState } from "@/lib/cloudState";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { ClipboardList, Plus, Trash2, Download, RotateCcw, Info, Save, FolderOpen, History } from "lucide-react";
import { toast } from "sonner";
import { saveProjectArtifact } from "@/lib/projectArtifacts";
import { useActiveProjectId } from "@/lib/projectSelection";

type Shape = "straight" | "L-bar" | "U-bar" | "stirrup";
type BarRow = { id: string; mark: string; diameter: number; shape: Shape; a: number; b: number; hook: number; qty: number; note: string };
type SavedSchedule = { id: string; name: string; project: string; member: string; waste: number; rows: BarRow[]; updatedAt: string };
const newRow = (mark: string): BarRow => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, mark, diameter: 12, shape: "straight", a: 6, b: 0, hook: 0.15, qty: 1, note: "" });
const num = (n: number) => Number.isFinite(n) && n > 0 ? n : 0;
const fmt = (n: number, d = 2) => n.toLocaleString("en-BD", { maximumFractionDigits: d });
function cuttingLength(row: BarRow) {
  const a = num(row.a), b = num(row.b), hook = num(row.hook);
  if (row.shape === "straight") return a;
  if (row.shape === "L-bar") return a + b + 2 * hook;
  if (row.shape === "U-bar") return a + 2 * b + 2 * hook;
  return 2 * (a + b) + 2 * hook;
}
function weightPerMeter(diameter: number) { return num(diameter) * num(diameter) / 162; }

export default function BBSGeneratorPage() {
  const [rows, setRows] = useState<BarRow[]>([newRow("B1"), { ...newRow("B2"), diameter: 10, shape: "stirrup", a: 0.25, b: 0.4, hook: 0.1, qty: 24 }, { ...newRow("B3"), diameter: 16, shape: "L-bar", a: 2.4, b: 0.5, hook: 0.15, qty: 8 }]);
  const [waste, setWaste] = useState(5);
  const [project, setProject] = useState("Sample Residence");
  const [member, setMember] = useState("Beam / Column / Slab");
  const [savedSchedules, setSavedSchedules, syncingSchedules] = useCloudState<SavedSchedule[]>("civilos.bbs-schedules", []);
  const [scheduleName, setScheduleName] = useState("Main reinforcement schedule");
  const [savingToProject, setSavingToProject] = useState(false);
  const [projectArtifactId, setProjectArtifactId] = useState<string | null>(null);
  const projectId = useActiveProjectId();
  useEffect(() => { setProjectArtifactId(null); }, [projectId]);
  const computed = useMemo(() => rows.map(row => {
    const length = cuttingLength(row);
    const totalLength = length * num(row.qty);
    const unitWeight = weightPerMeter(row.diameter);
    return { ...row, length, totalLength, unitWeight, totalWeight: totalLength * unitWeight };
  }), [rows]);
  const netWeight = computed.reduce((sum, row) => sum + row.totalWeight, 0);
  const totalBars = computed.reduce((sum, row) => sum + num(row.qty), 0);
  const update = (id: string, key: keyof BarRow, value: string | number) => setRows(current => current.map(row => row.id === id ? { ...row, [key]: value } as BarRow : row));
  const addRow = () => setRows(current => [...current, newRow(`B${current.length + 1}`)]);
  const reset = () => { setRows([newRow("B1")]); setWaste(5); setProject("Sample Residence"); setMember("Beam / Column / Slab"); setScheduleName("Main reinforcement schedule"); };
  const saveSchedule = () => {
    const cleanProject = project.trim(); const cleanName = scheduleName.trim();
    if (!cleanProject || !cleanName) { toast.error("Enter a project name and schedule name."); return; }
    if (rows.length === 0) { toast.error("Add at least one bar row before saving."); return; }
    const invalid = rows.find(row => !row.mark.trim() || !Number.isFinite(row.diameter) || row.diameter <= 0 || !Number.isFinite(row.a) || row.a <= 0 || !Number.isFinite(row.b) || row.b < 0 || !Number.isFinite(row.hook) || row.hook < 0 || !Number.isInteger(row.qty) || row.qty < 1 || (row.shape !== "straight" && row.b <= 0));
    if (invalid) { toast.error("Check dimensions, mark and whole-piece quantity for bar " + (invalid.mark || "(unnamed)") + "."); return; }
    if (!Number.isFinite(waste) || waste < 0 || waste > 100) { toast.error("Wastage must be between 0 and 100%."); return; }
    const existing = savedSchedules.find(s => s.name.toLowerCase() === cleanName.toLowerCase() && s.project.toLowerCase() === cleanProject.toLowerCase());
    const record: SavedSchedule = { id: existing?.id ?? ("bbs-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)), name: cleanName, project: cleanProject, member: member.trim(), waste, rows: rows.map(row => ({ ...row })), updatedAt: new Date().toISOString() };
    setSavedSchedules(current => [record, ...current.filter(s => s.id !== record.id)]);
    toast.success(existing ? "Saved schedule updated." : "Schedule saved to your workspace.");
  };
  const saveToProject = async () => {
    if (!projectId) return;
    if (rows.length === 0) { toast.error("Add at least one bar row before saving."); return; }
    setSavingToProject(true);
    try {
      const saved = await saveProjectArtifact({
        id: projectArtifactId ?? undefined,
        projectId,
        artifactType: "bbs",
        title: `BBS — ${scheduleName.trim() || member.trim() || "Reinforcement Schedule"}`,
        description: `${project.trim()} · ${member.trim()} · ${rows.length} bar marks · ${fmt(netWeight)} kg net steel`,
        data: {
          projectName: project,
          scheduleName,
          structuralMember: member,
          wastagePercent: waste,
          rows: computed,
          totals: { barMarks: rows.length, totalPieces: totalBars, netWeightKg: netWeight, weightWithWastageKg: netWeight * (1 + num(waste) / 100) },
        },
        metadata: { sourceModule: "BBSGeneratorPage", formatVersion: 1, units: { dimensions: "m", barDiameter: "mm", weight: "kg" } },
      });
      setProjectArtifactId(saved.id);
      toast.success("BBS Project Workspace-এ save হয়েছে");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Project-এ BBS save করা যায়নি");
    } finally { setSavingToProject(false); }
  };
  const loadSchedule = (schedule: SavedSchedule) => { setProject(schedule.project); setMember(schedule.member); setWaste(schedule.waste); setRows(schedule.rows.map(row => ({ ...row }))); setScheduleName(schedule.name); toast.success("Loaded " + schedule.name); };
  const deleteSchedule = (id: string) => { setSavedSchedules(current => current.filter(s => s.id !== id)); toast.success("Saved schedule deleted."); };
  const exportCsv = () => {
    const data = [
      ["CivilOS AI - Bar Bending Schedule"], ["Project", project], ["Structural member", member], [],
      ["Bar Mark", "Diameter (mm)", "Shape", "A (m)", "B (m)", "Hook allowance (m/end)", "Cutting length (m)", "Quantity (pcs)", "Total length (m)", "Unit weight (kg/m)", "Total weight (kg)", "Notes"],
      ...computed.map(r => [r.mark, r.diameter, r.shape, r.a, r.b, r.hook, r.length, r.qty, r.totalLength, r.unitWeight, r.totalWeight, r.note]),
      [], ["Net steel weight (kg)", netWeight], ["Wastage (%)", waste], ["With wastage (kg)", netWeight * (1 + num(waste) / 100)],
      ["Note", "Preliminary BBS. Verify cutting lengths, bends, hooks, laps, cover and anchorage against approved structural drawings and applicable code."]
    ];
    const csv = data.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = "civilos-bar-bending-schedule.csv"; a.click(); URL.revokeObjectURL(url);
    toast.success("BBS CSV exported");
  };

  return (
    <SidebarProvider>
      <SEO title="Bar Bending Schedule (BBS) — CivilOS AI" description="Prepare an editable reinforcement bar bending schedule with cutting lengths, steel weights and CSV export." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-2"><SidebarTrigger /><ClipboardList className="h-4 w-4 text-accent" /><h1 className="font-heading font-semibold">Bar Bending Schedule</h1></div>
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Export CSV</Button><ThemeToggle /></div>
          </header>
          <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-bold">Reinforcement BBS worksheet</h2><p className="mt-1 text-sm text-muted-foreground">Enter bar dimensions and quantities to calculate cutting lengths and estimated steel weight.</p></div><div className="flex gap-2"><Button variant="outline" onClick={reset}><RotateCcw className="mr-1 h-4 w-4"/>Reset</Button><Button onClick={addRow}><Plus className="mr-1 h-4 w-4"/>Add bar row</Button></div></div>
            <Card className="space-y-4 p-4 md:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2"><History className="h-5 w-5 text-primary" /></div>
                <div className="min-w-0 flex-1"><h3 className="font-semibold">Save & manage schedules</h3><p className="text-sm text-muted-foreground">Save this BBS, reopen it later, or update an existing schedule using the same project and name.</p><p className="mt-1 text-xs text-muted-foreground">{syncingSchedules ? "Syncing workspace…" : "Workspace storage: signed-in data syncs across devices; signed-out data stays on this device."}</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5"><Label>Schedule name</Label><Input value={scheduleName} maxLength={100} onChange={e=>setScheduleName(e.target.value)} placeholder="e.g. Ground floor columns" /></div>
                <div className="space-y-1.5"><Label>Project name</Label><Input value={project} maxLength={120} onChange={e=>setProject(e.target.value)} placeholder="Project name" /></div>
                <div className="flex items-end gap-2 flex-wrap"><Button className="w-full sm:w-auto" onClick={saveSchedule}><Save className="mr-2 h-4 w-4"/>Save schedule</Button>{projectId && <Button className="w-full sm:w-auto" variant="outline" onClick={saveToProject} disabled={savingToProject}>{savingToProject ? "Saving..." : projectArtifactId ? "Update Project" : "Save to Project"}</Button>}</div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">Saved schedules ({savedSchedules.length})</h4><span className="text-xs text-muted-foreground">Most recently updated first</span></div>
                {savedSchedules.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No saved schedules yet. Enter your bar details and select Save schedule.</p> : <div className="grid gap-2 md:grid-cols-2">
                  {savedSchedules.map(schedule => <div key={schedule.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground"/>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{schedule.name}</p><p className="truncate text-xs text-muted-foreground">{schedule.project} · {schedule.rows.length} bar marks · {new Date(schedule.updatedAt).toLocaleDateString()}</p></div>
                    <Button size="sm" variant="outline" onClick={()=>loadSchedule(schedule)}>Open</Button>
                    <Button size="icon" variant="ghost" aria-label={"Delete saved schedule " + schedule.name} onClick={()=>deleteSchedule(schedule.id)}><Trash2 className="h-4 w-4"/></Button>
                  </div>)}
                </div>}
              </div>
            </Card>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4"><p className="text-xs text-muted-foreground">Bar marks</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">Total pieces</p><p className="mt-1 text-2xl font-bold">{fmt(totalBars, 0)}</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">Net steel weight</p><p className="mt-1 text-2xl font-bold">{fmt(netWeight)} kg</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">Including wastage</p><p className="mt-1 text-2xl font-bold">{fmt(netWeight * (1 + num(waste) / 100))} kg</p></Card>
            </div>
            <Card className="grid gap-4 p-4 md:grid-cols-3 md:p-5">
              <div className="space-y-1.5"><Label>Project name</Label><Input value={project} onChange={e=>setProject(e.target.value)} placeholder="Project name"/></div>
              <div className="space-y-1.5"><Label>Structural member</Label><Input value={member} onChange={e=>setMember(e.target.value)} placeholder="e.g. Footing F1"/></div>
              <div className="space-y-1.5"><Label>Wastage allowance (%)</Label><Input type="number" min="0" max="100" value={waste} onChange={e=>setWaste(Math.max(0, Number(e.target.value) || 0))}/></div>
            </Card>
            <Card className="overflow-hidden">
              <div className="border-b p-4"><h3 className="font-semibold">Bar schedule</h3><p className="text-xs text-muted-foreground">Dimensions A and B are in metres. Hook allowance is applied per end where relevant.</p></div>
              <div className="space-y-4 p-3 md:hidden">
                {computed.map(row => <div key={row.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2"><Input className="max-w-24" value={row.mark} onChange={e=>update(row.id,"mark",e.target.value)}/><Badge variant="secondary">{fmt(row.totalWeight)} kg</Badge><Button size="icon" variant="ghost" aria-label={`Remove ${row.mark}`} onClick={()=>setRows(rs=>rs.filter(r=>r.id!==row.id))}><Trash2 className="h-4 w-4"/></Button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Diameter (mm)</Label><Select value={String(row.diameter)} onValueChange={v=>update(row.id,"diameter",Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[6,8,10,12,16,20,22,25,28,32,40].map(d=><SelectItem key={d} value={String(d)}>{d} mm</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label>Shape</Label><Select value={row.shape} onValueChange={v=>update(row.id,"shape",v as Shape)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="straight">Straight</SelectItem><SelectItem value="L-bar">L-bar</SelectItem><SelectItem value="U-bar">U-bar</SelectItem><SelectItem value="stirrup">Stirrup / rectangular</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1"><Label>A (m)</Label><Input type="number" min="0" step="0.01" value={row.a} onChange={e=>update(row.id,"a",Number(e.target.value))}/></div>
                    <div className="space-y-1"><Label>B (m)</Label><Input type="number" min="0" step="0.01" value={row.b} onChange={e=>update(row.id,"b",Number(e.target.value))}/></div>
                    <div className="space-y-1"><Label>Hook/end (m)</Label><Input type="number" min="0" step="0.01" value={row.hook} onChange={e=>update(row.id,"hook",Number(e.target.value))}/></div>
                    <div className="space-y-1"><Label>Quantity (pcs)</Label><Input type="number" min="0" step="1" value={row.qty} onChange={e=>update(row.id,"qty",Number(e.target.value))}/></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded bg-muted/40 p-2">Cut length <strong className="block">{fmt(row.length)} m</strong></div><div className="rounded bg-muted/40 p-2">Total length <strong className="block">{fmt(row.totalLength)} m</strong></div></div>
                  <Input value={row.note} onChange={e=>update(row.id,"note",e.target.value)} placeholder="Notes (optional)"/>
                </div>)}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="bg-muted/50 text-left"><tr>{["Mark","Dia (mm)","Shape","A (m)","B (m)","Hook/end (m)","Cut length (m)","Qty","Total length (m)","Unit wt (kg/m)","Total wt (kg)",""].map(h=><th key={h} className="px-2 py-3 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{computed.map(row=><tr key={row.id} className="border-t">
                    <td className="p-2"><Input className="w-20" value={row.mark} onChange={e=>update(row.id,"mark",e.target.value)}/></td>
                    <td className="p-2"><Select value={String(row.diameter)} onValueChange={v=>update(row.id,"diameter",Number(v))}><SelectTrigger className="w-24"><SelectValue/></SelectTrigger><SelectContent>{[6,8,10,12,16,20,22,25,28,32,40].map(d=><SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent></Select></td>
                    <td className="p-2"><Select value={row.shape} onValueChange={v=>update(row.id,"shape",v as Shape)}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="straight">Straight</SelectItem><SelectItem value="L-bar">L-bar</SelectItem><SelectItem value="U-bar">U-bar</SelectItem><SelectItem value="stirrup">Stirrup</SelectItem></SelectContent></Select></td>
                    <td className="p-2"><Input className="w-20" type="number" min="0" step="0.01" value={row.a} onChange={e=>update(row.id,"a",Number(e.target.value))}/></td>
                    <td className="p-2"><Input className="w-20" type="number" min="0" step="0.01" value={row.b} onChange={e=>update(row.id,"b",Number(e.target.value))}/></td>
                    <td className="p-2"><Input className="w-24" type="number" min="0" step="0.01" value={row.hook} onChange={e=>update(row.id,"hook",Number(e.target.value))}/></td>
                    <td className="px-3 py-2 font-medium">{fmt(row.length)}</td>
                    <td className="p-2"><Input className="w-20" type="number" min="0" step="1" value={row.qty} onChange={e=>update(row.id,"qty",Number(e.target.value))}/></td>
                    <td className="px-3 py-2">{fmt(row.totalLength)}</td><td className="px-3 py-2">{fmt(row.unitWeight)}</td><td className="px-3 py-2 font-semibold">{fmt(row.totalWeight)}</td>
                    <td className="p-2"><Button size="icon" variant="ghost" aria-label={`Remove ${row.mark}`} onClick={()=>setRows(rs=>rs.filter(r=>r.id!==row.id))}><Trash2 className="h-4 w-4"/></Button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-between gap-3 border-t bg-muted/20 p-4 text-sm"><span>Net steel weight: <strong>{fmt(netWeight)} kg</strong></span><span>With {fmt(waste)}% wastage: <strong>{fmt(netWeight * (1 + num(waste) / 100))} kg</strong></span></div>
            </Card>
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"/><p className="text-xs text-muted-foreground">Engineering safety note: this worksheet uses simplified geometric cutting-length formulas and the common estimate d²/162 kg/m. It does not infer reinforcement from drawings. Confirm bend deductions, mandrel diameter, hooks, laps, anchorage, clear cover, spacing and applicable code against approved structural drawings before fabrication.</p></div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
