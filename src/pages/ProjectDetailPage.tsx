import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loader2, Upload, Trash2, UserPlus, Lock, FileText, ArrowLeft, Users, Activity, Archive } from "lucide-react";
import { toast } from "sonner";
import { listProjectArtifacts, createProjectArtifactDownloadUrl, saveProjectArtifact, type ProjectArtifact } from "@/lib/projectArtifacts";
import { createProjectWorkspaceBackup, readProjectWorkspaceBackup } from "@/lib/projectWorkspaceBackup";

type Role = "admin" | "engineer" | "viewer";
const roleColor: Record<Role, string> = {
  admin: "bg-red-500/15 text-red-600 border-red-500/30",
  engineer: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  viewer: "bg-gray-500/15 text-gray-600 border-gray-500/30",
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");

  const load = async () => {
    if (!id || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: proj, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error || !proj) {
        console.error("Project load failed", error);
        toast.error("প্রজেক্টটি পাওয়া যায়নি অথবা আপনার অ্যাক্সেস নেই।");
        navigate("/projects");
        return;
      }
      setProject(proj);
      if (proj.user_id === user.id) setRole("admin");
      else {
        const { data: mem, error: memberError } = await (supabase as any).from("project_members")
          .select("role").eq("project_id", id).eq("user_id", user.id).maybeSingle();
        if (memberError) console.error("Project membership lookup failed", memberError);
        setRole((mem?.role as Role) || null);
      }

      const [d, m, iv, act] = await Promise.all([
        (supabase as any).from("project_documents").select("*").eq("project_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("project_members").select("*, profiles:user_id(display_name, avatar_url)").eq("project_id", id),
        (supabase as any).from("invitations").select("*").eq("project_id", id).eq("status", "pending"),
        (supabase as any).from("project_activity").select("*, profiles:user_id(display_name)").eq("project_id", id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (d.error) toast.error("Project documents could not be loaded.");
      if (m.error) console.error("Project members could not be loaded", m.error);
      if (iv.error) console.error("Project invitations could not be loaded", iv.error);
      if (act.error) console.error("Project activity could not be loaded", act.error);
      setDocs(d.data || []);
      setMembers(m.data || []);
      setInvites(iv.data || []);
      setActivity(act.data || []);

      setArtifactsLoading(true);
      try {
        setArtifacts(await listProjectArtifacts(id));
        setArtifactsError(null);
      } catch (artifactError) {
        console.error("Could not load project artifacts", artifactError);
        setArtifacts([]);
        setArtifactsError(artifactError instanceof Error ? artifactError.message : "Workspace files could not be loaded.");
      } finally {
        setArtifactsLoading(false);
      }
    } catch (error) {
      console.error("Unexpected project detail load error", error);
      toast.error("প্রজেক্ট লোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [id, user]);

  const retryLoadArtifacts = async () => {
    if (!id) return;
    setArtifactsLoading(true);
    try {
      setArtifacts(await listProjectArtifacts(id));
      setArtifactsError(null);
    } catch (error) {
      setArtifactsError(error instanceof Error ? error.message : "Workspace files could not be loaded.");
    } finally {
      setArtifactsLoading(false);
    }
  };

  const canEdit = role === "admin" || role === "engineer";
  const isAdmin = role === "admin";

  const logActivity = async (action: string, details: any = {}) => {
    if (!user || !id) return;
    await (supabase as any).from("project_activity").insert({ project_id: id, user_id: user.id, action, details });
  };

  const uploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !user) return;
    const allowedExtensions = /\.(pdf|dwg|dxf|png|jpe?g|gif|webp|docx?|xlsx?)$/i;
    const maxFileSize = 25 * 1024 * 1024;
    if (!allowedExtensions.test(file.name)) {
      toast.error("Supported files: PDF, DWG, DXF, images, DOC/DOCX and XLS/XLSX.");
      e.target.value = "";
      return;
    }
    if (file.size > maxFileSize) {
      toast.error("ফাইলের আকার সর্বোচ্চ ২৫ MB হতে পারবে।");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const safeFileName = file.name.replace(/[\/\\\u0000-\u001f]/g, "_").replace(/\.\./g, "_");
      const path = `${id}/${Date.now()}-${safeFileName}`;
      const { error: uploadError } = await supabase.storage.from("project-documents").upload(path, file);
      if (uploadError) throw uploadError;
      const { error: recordError } = await (supabase as any).from("project_documents").insert({
        project_id: id, file_name: file.name, file_url: path, file_type: file.type || "application/octet-stream",
        file_size: file.size, uploaded_by: user.id,
      });
      if (recordError) {
        // Roll back the uploaded object if its database record could not be created.
        const { error: cleanupError } = await supabase.storage.from("project-documents").remove([path]);
        if (cleanupError) console.error("Could not clean up orphaned project upload", cleanupError);
        throw recordError;
      }
      await logActivity("document_uploaded", { file_name: file.name });
      toast.success("ফাইল আপলোড সফল");
      await load();
    } catch (err) {
      console.error("Project document upload failed", err);
      toast.error(err instanceof Error ? err.message : "ফাইল আপলোড করা যায়নি। আবার চেষ্টা করুন।");
    }
    finally { setUploading(false); e.target.value = ""; }
  };

  const exportWorkspaceZip = async () => {
    if (!project || !id || exportingBackup) return;
    setExportingBackup(true);
    try {
      const binaryFiles: { path: string; bytes: Uint8Array; sourceName: string }[] = [];
      const omittedFiles: string[] = [];
      const MAX_FILE_BYTES = 50 * 1024 * 1024;
      const MAX_TOTAL_BYTES = 180 * 1024 * 1024;
      let totalBytes = 0;
      const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/\.\./g, "_").slice(0, 180) || "file";

      for (const document of docs) {
        const path = typeof document.file_url === "string" ? document.file_url : "";
        if (!path) { omittedFiles.push(`Document ${document.file_name || document.id}: missing storage path`); continue; }
        try {
          const { data, error } = await supabase.storage.from("project-documents").download(path);
          if (error || !data) throw error || new Error("File unavailable");
          if (data.size > MAX_FILE_BYTES || totalBytes + data.size > MAX_TOTAL_BYTES) {
            omittedFiles.push(`Document ${document.file_name}: export size limit reached`);
            continue;
          }
          const bytes = new Uint8Array(await data.arrayBuffer());
          binaryFiles.push({ path: `uploaded-files/project-documents/${String(binaryFiles.length + 1).padStart(3, "0")}-${safeName(document.file_name || "document")}`, bytes, sourceName: document.file_name || "document" });
          totalBytes += bytes.byteLength;
        } catch (error) {
          omittedFiles.push(`Document ${document.file_name}: ${error instanceof Error ? error.message : "download failed"}`);
        }
      }

      for (const artifact of artifacts) {
        if (!artifact.storage_path) continue;
        try {
          const { data, error } = await supabase.storage.from("project-artifacts").download(artifact.storage_path);
          if (error || !data) throw error || new Error("File unavailable");
          if (data.size > MAX_FILE_BYTES || totalBytes + data.size > MAX_TOTAL_BYTES) {
            omittedFiles.push(`Artifact file ${artifact.file_name || artifact.title}: export size limit reached`);
            continue;
          }
          const bytes = new Uint8Array(await data.arrayBuffer());
          binaryFiles.push({ path: `uploaded-files/project-artifacts/${String(binaryFiles.length + 1).padStart(3, "0")}-${safeName(artifact.file_name || artifact.title || "artifact-file")}`, bytes, sourceName: artifact.file_name || artifact.title });
          totalBytes += bytes.byteLength;
        } catch (error) {
          omittedFiles.push(`Artifact file ${artifact.file_name || artifact.title}: ${error instanceof Error ? error.message : "download failed"}`);
        }
      }

      const backup = createProjectWorkspaceBackup(project, artifacts, docs, binaryFiles, omittedFiles);
      const url = URL.createObjectURL(backup.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backup.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Workspace ZIP ready: ${backup.artifactCount} artifacts, ${docs.length} document records, ${binaryFiles.length} files included.`);
      if (omittedFiles.length) toast.warning(`${omittedFiles.length} file(s) could not be included. See manifest.json inside the ZIP.`);
      await logActivity("workspace_backup_exported", { artifact_count: backup.artifactCount, document_count: docs.length, binary_file_count: binaryFiles.length, omitted_file_count: omittedFiles.length, format_version: 2 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export workspace backup.");
    } finally {
      setExportingBackup(false);
    }
  };

  const importWorkspaceZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !user) return;
    if (!canEdit) {
      toast.error("Only project admins and engineers can restore workspace artifacts.");
      e.target.value = "";
      return;
    }
    setImportingBackup(true);
    try {
      const backup = await readProjectWorkspaceBackup(file);
      if (!window.confirm(
        `Import ${backup.artifacts.length} artifact(s) from "${backup.manifest.project?.name || "another project"}" into this project? Existing artifacts with the same type and title will be updated. Project details and uploaded documents will not be overwritten.`
      )) return;
      let created = 0;
      let updated = 0;
      // Keep a map for this import so repeated type/title pairs in one archive update
      // the artifact created earlier in this same restore instead of duplicating it.
      const artifactByKey = new Map(
        artifacts.map((artifact) => [`${artifact.artifact_type}\\u0000${artifact.title}`, artifact] as const),
      );
      for (const item of backup.artifacts) {
        const key = `${item.artifact_type}\\u0000${item.title}`;
        const existing = artifactByKey.get(key);
        const metadata = {
          ...(item.metadata || {}),
          importedFromBackup: true,
          originalArtifactId: item.id ?? null,
          importedAt: new Date().toISOString(),
        };
        const savedArtifact = await saveProjectArtifact({
          ...(existing ? { id: existing.id } : {}),
          projectId: id,
          artifactType: item.artifact_type,
          title: item.title,
          description: item.description ?? null,
          data: item.data ?? {},
          metadata,
        });
        artifactByKey.set(key, savedArtifact);
        if (existing) updated++; else created++;
      }
      await logActivity("workspace_backup_imported", {
        source_project_id: backup.manifest.project?.id ?? null,
        source_project_name: backup.manifest.project?.name ?? null,
        created_artifacts: created,
        updated_artifacts: updated,
      });
      toast.success(`Restore complete: ${created} new, ${updated} updated artifact(s).`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import workspace backup.");
    } finally {
      setImportingBackup(false);
      e.target.value = "";
    }
  };

  const downloadDoc = async (d: any) => {
    // Open a window synchronously in the click handler so popup blockers do not
    // discard the download after the signed-URL request finishes.
    const downloadWindow = window.open("about:blank", "_blank");
    if (downloadWindow) downloadWindow.opener = null;
    try {
      const { data, error } = await supabase.storage.from("project-documents").createSignedUrl(d.file_url, 3600);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Download link could not be created.");
      if (downloadWindow) {
        downloadWindow.location.replace(data.signedUrl);
      } else {
        // If the browser blocks popups, leave the user on the page and offer a direct link.
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.referrerPolicy = "no-referrer";
        link.click();
      }
    } catch (error) {
      downloadWindow?.close();
      console.error("Project document download failed", error);
      toast.error("ফাইল ডাউনলোড লিংক তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    }
  };

  const deleteDoc = async (d: any) => {
    if (!window.confirm(`“${d.file_name}” ফাইলটি মুছে ফেলবেন?`)) return;
    try {
      const { error: recordError } = await (supabase as any).from("project_documents").delete().eq("id", d.id);
      if (recordError) throw recordError;
      const { error: storageError } = await supabase.storage.from("project-documents").remove([d.file_url]);
      if (storageError) console.error("Project document record deleted but storage cleanup failed", storageError);
      toast.success("ফাইল মুছে ফেলা হয়েছে");
      await load();
    } catch (error) {
      console.error("Project document deletion failed", error);
      toast.error("ফাইল মুছে ফেলা যায়নি। আবার চেষ্টা করুন।");
    }
  };

  const sendInvite = async () => {
    if (!id || !user) return;
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 255) {
      return toast.error("Enter a valid email address");
    }
    const { data, error } = await (supabase as any).from("invitations").insert({
      project_id: id, invited_email: normalizedEmail, role: inviteRole, invited_by: user.id,
    }).select().single();
    if (error) return toast.error(error.message);
    const inviteUrl = `${window.location.origin}/invite?token=${encodeURIComponent(data.token)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success(`Secure invite created for ${normalizedEmail}. Link copied.`);
    } catch {
      toast.success(`Secure invite created for ${normalizedEmail}.`);
    }
    await logActivity("member_invited", { email: normalizedEmail, role: inviteRole });
    setInviteEmail(""); load();
  };

  const cancelInvite = async (invId: string) => {
    await (supabase as any).from("invitations").delete().eq("id", invId);
    load();
  };

  const removeMember = async (memId: string) => {
    await (supabase as any).from("project_members").delete().eq("id", memId);
    toast.success("Member removed"); load();
  };

  const updateStatus = async (status: string) => {
    if (!id || !project || !isAdmin || !["planning", "active", "completed"].includes(status)) return;
    const previousStatus = project.status;
    setProject({ ...project, status });
    try {
      const { error } = await supabase.from("projects").update({ status } as any).eq("id", id);
      if (error) throw error;
      await logActivity("status_changed", { status });
      toast.success("Project status updated");
    } catch (error) {
      console.error("Project status update failed", error);
      setProject((current: any) => current ? { ...current, status: previousStatus } : current);
      toast.error("Project status update failed. Please try again.");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin"/></div>;
  if (!role) return <div className="min-h-screen flex items-center justify-center flex-col gap-3"><Lock className="h-8 w-8"/><p>You don't have access to this project.</p><Button onClick={()=>navigate("/projects")}>Back</Button></div>;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container max-w-6xl space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={()=>navigate("/projects")}><ArrowLeft className="h-4 w-4 mr-1"/>Projects</Button>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl md:text-3xl font-bold">{project.name}</h1>
              <p className="text-sm text-muted-foreground">{project.client_name} · {project.location} · {project.project_type}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={roleColor[role]} variant="outline">{role.toUpperCase()}</Badge>
              {isAdmin ? (
                <Select value={project.status} onValueChange={updateStatus}>
                  <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              ) : <Badge variant="outline">{project.status}</Badge>}
            </div>
          </div>

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="boq">BOQ</TabsTrigger>
              <TabsTrigger value="bbs">BBS</TabsTrigger>
              <TabsTrigger value="estimates">Estimates</TabsTrigger>
              <TabsTrigger value="artifacts">Workspace Files</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="activity">Activity Log</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card><CardHeader><CardTitle className="text-sm">Budget</CardTitle></CardHeader><CardContent className="text-2xl font-bold">৳{project.budget?.toLocaleString() || "—"}</CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm">Documents</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{docs.length}</CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm">Team Members</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{members.length + 1}</CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Project Info</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><b>Start:</b> {project.start_date || "—"}</p>
                  <p><b>End:</b> {project.end_date || "—"}</p>
                  <p><b>Status:</b> {project.status}</p>
                </CardContent>
              </Card>
            </TabsContent>

            {["boq","bbs","estimates"].map(t => (
              <TabsContent key={t} value={t}>
                <Card><CardContent className="py-10 text-center space-y-3">
                  <p className="text-muted-foreground">Open {t.toUpperCase()} tools scoped to this project.</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button asChild variant="outline"><Link to={`/boq-hub?project=${id}`}>BOQ Hub</Link></Button>
                    <Button asChild variant="outline"><Link to={`/boq?project=${id}`}>BOQ Generator</Link></Button>
                    <Button asChild variant="outline"><Link to={`/rate-analysis?project=${id}`}>Rate Analysis</Link></Button>
                    <Button asChild variant="outline"><Link to={`/visualizations?project=${id}`}>3D Visualization</Link></Button>
                    <Button asChild variant="outline"><Link to={`/estimate/demo`}>Estimator</Link></Button>
                  </div>
                </CardContent></Card>
              </TabsContent>
            ))}

            <TabsContent value="artifacts" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Unified Project Workspace</CardTitle><div className="flex flex-wrap gap-2"><input type="file" accept=".zip,application/zip" className="hidden" id="workspace-backup-import" onChange={importWorkspaceZip} /><Button variant="outline" size="sm" onClick={() => document.getElementById("workspace-backup-import")?.click()} disabled={importingBackup || !canEdit}><Upload className="mr-2 h-4 w-4" /> {importingBackup ? "Restoring…" : "Import ZIP"}</Button><Button variant="outline" size="sm" onClick={exportWorkspaceZip} disabled={artifactsLoading || exportingBackup || !project}><Archive className="mr-2 h-4 w-4" /> {exportingBackup ? "Preparing ZIP…" : "Download Complete Workspace"}</Button></div></div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Saved outputs from connected engineering modules appear here. Complete Workspace ZIP includes project data, structured artifacts, uploaded project documents and saved artifact files when storage access allows.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">Saved artifacts: {artifacts.length}</Badge>
                    <Badge variant="outline">Role: {role}</Badge>
                  </div>
                </CardContent>
              </Card>
              {artifactsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : artifactsError ? (
                <Card><CardContent className="py-8 text-center space-y-3">
                  <p className="font-medium">Workspace files could not be loaded</p>
                  <p className="text-sm text-muted-foreground break-words">{artifactsError}</p>
                  <p className="text-xs text-muted-foreground">If this is a new environment, confirm the workspace database migration and project permissions are configured.</p>
                  <Button variant="outline" size="sm" onClick={retryLoadArtifacts}>Retry</Button>
                </CardContent></Card>
              ) : artifacts.length === 0 ? (
                <Card><CardContent className="py-10 text-center space-y-2">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="font-medium">No saved workspace artifacts yet</p>
                  <p className="text-sm text-muted-foreground">Once an engineering module saves its output to this project, it will be listed here.</p>
                </CardContent></Card>
              ) : (
                <div className="border rounded-lg divide-y">
                  {artifacts.map((artifact) => (
                    <div key={artifact.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{artifact.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {artifact.artifact_type} · Updated {new Date(artifact.updated_at).toLocaleString()}
                        </p>
                        {artifact.description && <p className="text-sm text-muted-foreground mt-1">{artifact.description}</p>}
                        {artifact.file_name && <p className="text-xs mt-1">{artifact.file_name}</p>}
                      </div>
                      {artifact.storage_path && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const url = await createProjectArtifactDownloadUrl(artifact.storage_path!);
                            window.open(url, "_blank", "noopener,noreferrer");
                          } catch (downloadError) {
                            toast.error(downloadError instanceof Error ? downloadError.message : "Download failed");
                          }
                        }}>
                          Download file
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              {canEdit && (
                <div>
                  <input id="file" type="file" className="hidden" onChange={uploadDoc}
                    accept=".pdf,.dwg,.dxf,image/*,.doc,.docx,.xls,.xlsx"/>
                  <Button asChild disabled={uploading}>
                    <label htmlFor="file" className="cursor-pointer">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}
                      Upload Document
                    </label>
                  </Button>
                </div>
              )}
              <div className="border rounded-lg divide-y">
                {docs.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No documents yet</p> :
                  docs.map(d => (
                    <div key={d.id} className="p-3 flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0"/>
                      <button onClick={()=>downloadDoc(d)} className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium truncate">{d.file_name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>
                      </button>
                      {(isAdmin || d.uploaded_by === user?.id) &&
                        <Button size="icon" variant="ghost" onClick={()=>deleteDoc(d)}><Trash2 className="h-4 w-4"/></Button>}
                    </div>
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="team" className="space-y-4">
              {isAdmin ? (
                <Card><CardContent className="pt-6 flex flex-col sm:flex-row gap-2">
                  <Input placeholder="member@email.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} />
                  <Select value={inviteRole} onValueChange={(v:Role)=>setInviteRole(v)}>
                    <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="engineer">Engineer</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={sendInvite}><UserPlus className="h-4 w-4"/>Invite</Button>
                </CardContent></Card>
              ) : <p className="text-sm text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3"/> Only admin can invite</p>}

              <div>
                <h3 className="font-semibold mb-2">Members</h3>
                <div className="border rounded-lg divide-y">
                  <div className="p-3 flex items-center justify-between">
                    <div><p className="text-sm font-medium">Owner</p><p className="text-xs text-muted-foreground">Project creator</p></div>
                    <Badge className={roleColor.admin} variant="outline">ADMIN</Badge>
                  </div>
                  {members.map(m => (
                    <div key={m.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{m.profiles?.display_name || m.user_id.slice(0,8)}</p>
                        <p className="text-xs text-muted-foreground">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={roleColor[m.role as Role]} variant="outline">{m.role?.toUpperCase()}</Badge>
                        {isAdmin && <Button size="icon" variant="ghost" onClick={()=>removeMember(m.id)}><Trash2 className="h-4 w-4"/></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {invites.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Pending Invitations</h3>
                  <div className="border rounded-lg divide-y">
                    {invites.map(iv => (
                      <div key={iv.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm">{iv.invited_email}</p>
                          <p className="text-xs text-muted-foreground">{iv.role} · {new Date(iv.created_at).toLocaleDateString()}</p>
                        </div>
                        {isAdmin && <Button size="sm" variant="ghost" onClick={()=>cancelInvite(iv.id)}>Cancel</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity">
              <div className="border rounded-lg divide-y">
                {activity.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No activity yet</p> :
                  activity.map(a => (
                    <div key={a.id} className="p-3 flex items-start gap-3">
                      <Activity className="h-4 w-4 text-muted-foreground mt-0.5"/>
                      <div className="flex-1">
                        <p className="text-sm"><b>{a.profiles?.display_name || "Someone"}</b> {a.action.replace(/_/g," ")}</p>
                        <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
