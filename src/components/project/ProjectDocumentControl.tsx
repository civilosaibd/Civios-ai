import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { listProjectArtifacts, saveProjectArtifact } from "@/lib/projectArtifacts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FilePlus2, Send, CheckCircle2, History, Loader2 } from "lucide-react";

type Doc = { id: string; file_name: string; file_url: string; file_type?: string; file_size?: number; uploaded_by?: string; created_at: string };
type Revision = { id: string; documentId: string; documentNo: string; title: string; discipline: string; revision: string; status: "Draft" | "For Review" | "Approved" | "Rejected" | "Superseded"; author: string; checker: string; approver: string; notes: string; createdAt: string; reviewedAt?: string; rejectionReason?: string };
type Transmittal = { id: string; number: string; recipient: string; purpose: string; date: string; revisionIds: string[]; message: string; createdAt: string };
type Register = { revisions: Revision[]; transmittals: Transmittal[] };
const EMPTY: Register = { revisions: [], transmittals: [] };
const statuses = ["Draft", "For Review", "Approved", "Rejected", "Superseded"] as const;

export default function ProjectDocumentControl({ projectId, docs, canEdit, isAdmin, onRefresh, onDownload }: {
  projectId: string; docs: Doc[]; canEdit: boolean; isAdmin: boolean; onRefresh: () => Promise<void>; onDownload: (doc: Doc) => void;
}) {
  const { user } = useAuth();
  const [register, setRegister] = useState<Register>(EMPTY);
  const [artifactId, setArtifactId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [discipline, setDiscipline] = useState("Civil");
  const [revision, setRevision] = useState("A");
  const [notes, setNotes] = useState("");
  const [recipient, setRecipient] = useState("");
  const [purpose, setPurpose] = useState("For Review");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listProjectArtifacts(projectId);
      const found = items.find((item) => item.artifact_type === "project-document-control");
      setArtifactId(found?.id);
      const data = (found?.data || {}) as Partial<Register>;
      setRegister({ revisions: Array.isArray(data.revisions) ? data.revisions : [], transmittals: Array.isArray(data.transmittals) ? data.transmittals : [] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document register could not be loaded.");
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const persist = async (next: Register) => {
    if (!canEdit || !projectId) return;
    setSaving(true);
    try {
      const saved = await saveProjectArtifact({ id: artifactId, projectId, artifactType: "project-document-control", title: "Project Document Control Register", description: "Drawing revisions, review decisions and transmittals", data: next as unknown as Record<string, unknown> });
      setArtifactId(saved.id); setRegister(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document register save failed.");
      throw error;
    } finally { setSaving(false); }
  };

  const createRevision = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !title.trim() || !documentNo.trim()) return;
    const next: Revision = { id: crypto.randomUUID(), documentId: "", documentNo: documentNo.trim().slice(0,80), title: title.trim().slice(0,180), discipline, revision: revision.trim().slice(0,20) || "A", status: "Draft", author: user.email || user.id, checker: "", approver: "", notes: notes.trim().slice(0,1000), createdAt: new Date().toISOString() };
    try {
      await persist({ ...register, revisions: [next, ...register.revisions] });
      setTitle(""); setDocumentNo(""); setRevision("A"); setNotes("");
      toast.success("Draft drawing revision created.");
    } catch { /* error surfaced by persist */ }
  };

  const transition = async (item: Revision, nextStatus: Revision["status"]) => {
    if (nextStatus === "For Review" && !canEdit) return;
    if ((nextStatus === "Approved" || nextStatus === "Rejected" || nextStatus === "Superseded") && !isAdmin) {
      toast.error("Only a project admin can approve, reject or supersede a revision."); return;
    }
    if (item.status === "Approved" || item.status === "Superseded") {
      toast.error("Approved/superseded revisions are immutable. Create a new revision instead."); return;
    }
    const rejectionReason = nextStatus === "Rejected" ? window.prompt("Reason for rejection (required):")?.trim() : undefined;
    if (nextStatus === "Rejected" && !rejectionReason) return;
    const updated = register.revisions.map((r) => r.id === item.id ? { ...r, status: nextStatus, reviewedAt: new Date().toISOString(), ...(nextStatus === "Rejected" ? { rejectionReason } : {}) } : r);
    try {
      await persist({ ...register, revisions: updated });
      toast.success(`Revision marked ${nextStatus}.`);
    } catch { /* error surfaced by persist */ }
  };

  const attachFile = async (item: Revision, file?: File) => {
    if (!file || !user || !canEdit) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("Maximum file size is 25 MB."); return; }
    const safe = file.name.replace(/[\\/\\u0000-\\u001f]/g, "_").replace(/\\.\\./g, "_");
    const path = `${projectId}/revisions/${item.id}-${Date.now()}-${safe}`;
    try {
      const { error: uploadError } = await supabase.storage.from("project-documents").upload(path, file);
      if (uploadError) throw uploadError;
      const { data, error } = await (supabase as any).from("project_documents").insert({ project_id: projectId, file_name: file.name, file_url: path, file_type: file.type || "application/octet-stream", file_size: file.size, uploaded_by: user.id }).select().single();
      if (error) {
        await supabase.storage.from("project-documents").remove([path]);
        throw error;
      }
      const updated = register.revisions.map((r) => r.id === item.id ? { ...r, documentId: data.id } : r);
      await persist({ ...register, revisions: updated });
      await onRefresh();
      toast.success("Revision file uploaded. Earlier versions remain in the register.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revision upload failed.");
    }
  };

  const createTransmittal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recipient.trim() || !selected.length) { toast.error("Add a recipient and select at least one revision."); return; }
    const next: Transmittal = { id: crypto.randomUUID(), number: `TR-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(register.transmittals.length + 1).padStart(3,"0")}`, recipient: recipient.trim().slice(0,180), purpose, date: new Date().toISOString().slice(0,10), revisionIds: selected, message: message.trim().slice(0,1000), createdAt: new Date().toISOString() };
    try {
      await persist({ ...register, transmittals: [next, ...register.transmittals] });
      setRecipient(""); setMessage(""); setSelected([]);
      toast.success("Transmittal register entry created.");
    } catch { /* error surfaced by persist */ }
  };

  const revisionDocs = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const sortedRevisions = [...register.revisions].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const statusClass = (s: string) => s === "Approved" ? "bg-green-600/10 text-green-700" : s === "Rejected" ? "bg-red-600/10 text-red-700" : s === "For Review" ? "bg-amber-600/10 text-amber-700" : "bg-muted text-muted-foreground";

  if (loading) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading document register…</div>;

  return <div className="space-y-5">
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5"/>Drawing Revision Register</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {canEdit && <form onSubmit={createRevision} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border rounded-lg p-3">
          <div><Label>Document / Drawing No.</Label><Input required value={documentNo} onChange={e=>setDocumentNo(e.target.value)} placeholder="e.g. ARC-001"/></div>
          <div><Label>Drawing title</Label><Input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ground floor plan"/></div>
          <div><Label>Discipline</Label><Select value={discipline} onValueChange={setDiscipline}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Civil","Architectural","Structural","Electrical","Mechanical","Plumbing","Survey"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Revision code</Label><Input value={revision} onChange={e=>setRevision(e.target.value)} placeholder="A / B / 01"/></div>
          <div className="sm:col-span-2"><Label>Notes</Label><Input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Revision description / scope"/></div>
          <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={saving}><FilePlus2 className="h-4 w-4 mr-2"/>Create Draft Revision</Button></div>
        </form>}
        {sortedRevisions.length === 0 ? <p className="text-sm text-muted-foreground text-center py-5">No drawing revisions registered yet.</p> : sortedRevisions.map(item => <div key={item.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.documentNo}</Badge><Badge variant="secondary">Rev {item.revision}</Badge><Badge className={statusClass(item.status)}>{item.status}</Badge><span className="font-medium text-sm">{item.title}</span><span className="text-xs text-muted-foreground">{item.discipline}</span></div>
          <p className="text-xs text-muted-foreground">Created by {item.author} · {new Date(item.createdAt).toLocaleString()}{item.notes ? ` · ${item.notes}` : ""}</p>
          {item.rejectionReason && <p className="text-xs text-red-600">Rejection reason: {item.rejectionReason}</p>}
          <div className="flex flex-wrap gap-2 items-center">
            {item.documentId && revisionDocs.has(item.documentId) && <Button size="sm" variant="outline" onClick={()=>onDownload(revisionDocs.get(item.documentId)!)}><History className="h-3 w-3 mr-1"/>Open revision file</Button>}
            {canEdit && item.status !== "Approved" && item.status !== "Superseded" && <label className="inline-flex items-center"><input type="file" className="hidden" onChange={e=>{void attachFile(item,e.target.files?.[0]);e.target.value="";}}/><span className="cursor-pointer text-xs border rounded-md px-3 py-2">Upload / replace draft file</span></label>}
            {canEdit && item.status === "Draft" && <Button size="sm" variant="outline" onClick={()=>void transition(item,"For Review")} disabled={saving}>Submit for Review</Button>}
            {isAdmin && item.status === "For Review" && <><Button size="sm" onClick={()=>void transition(item,"Approved")} disabled={saving}><CheckCircle2 className="h-3 w-3 mr-1"/>Approve</Button><Button size="sm" variant="destructive" onClick={()=>void transition(item,"Rejected")} disabled={saving}>Reject</Button></>}
            {isAdmin && item.status === "Approved" && <Button size="sm" variant="outline" onClick={()=>void transition(item,"Superseded")} disabled={saving}>Supersede</Button>}
          </div>
        </div>)}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5"/>Transmittals</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {canEdit && <form onSubmit={createTransmittal} className="space-y-3 border rounded-lg p-3">
          <div className="grid sm:grid-cols-2 gap-3"><div><Label>Recipient / Organization</Label><Input required value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Client / Consultant / Contractor"/></div><div><Label>Purpose</Label><Select value={purpose} onValueChange={setPurpose}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["For Review","For Approval","For Construction","For Information","As-Built"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="space-y-2"><Label>Include revisions</Label>{sortedRevisions.length === 0 ? <p className="text-xs text-muted-foreground">Create a drawing revision first.</p> : <div className="grid sm:grid-cols-2 gap-2">{sortedRevisions.map(r=><label key={r.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,r.id]:old.filter(x=>x!==r.id))}/>{r.documentNo} · Rev {r.revision} · {r.title}</label>)}</div>}</div>
          <div><Label>Message / Remarks</Label><Input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Optional transmittal notes"/></div>
          <Button type="submit" disabled={saving}><Send className="h-4 w-4 mr-2"/>Create Transmittal</Button>
        </form>}
        {register.transmittals.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No transmittals yet.</p> : register.transmittals.map(t=><div key={t.id} className="border rounded-lg p-3 space-y-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t.number}</Badge><Badge variant="secondary">{t.purpose}</Badge><span className="text-sm font-medium">{t.recipient}</span></div><p className="text-xs text-muted-foreground">{t.date} · {t.revisionIds.length} revision(s) · {t.message || "No remarks"}</p><div className="flex flex-wrap gap-2">{t.revisionIds.map(id=>{const r=register.revisions.find(x=>x.id===id);return r?<Badge key={id} variant="outline">{r.documentNo} Rev {r.revision}</Badge>:null;})}</div><Button size="sm" variant="outline" onClick={()=>{const rows=t.revisionIds.map(id=>register.revisions.find(x=>x.id===id)).filter(Boolean);const textContent=[`TRANSMITTAL ${t.number}`,`Date: ${t.date}`,`To: ${t.recipient}`,`Purpose: ${t.purpose}`,`Remarks: ${t.message}`,"",...rows.map(r=>`${r!.documentNo} | ${r!.title} | Rev ${r!.revision} | ${r!.status}`)].join("\\n");const blob=new Blob([textContent],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${t.number}.txt`;a.click();URL.revokeObjectURL(url);}}>Export Transmittal (.txt)</Button></div>)}
      </CardContent>
    </Card>
    <p className="text-xs text-muted-foreground">Document register metadata is stored as a project workspace artifact; revision files remain in the existing private project-documents bucket. Project roles and Supabase RLS govern access. Approval is an internal workflow record, not an electronic signature or contractual approval.</p>
  </div>;
}
