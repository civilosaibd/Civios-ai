import { ChangeEvent, Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls, useGLTF } from "@react-three/drei";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Box, CheckCircle2, Eye, Loader2, Pause, Play, Trash2, UploadCloud, Images } from "lucide-react";

type HeroModel = {
  id: string; name: string; description: string | null; file_path: string;
  file_size: number; is_active: boolean; display_order: number; created_at: string;
};
function ModelPreview({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <Center><primitive object={scene.clone()} /></Center>;
}
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_BATCH_FILES = 30;
const CONCURRENCY = 3;
const modelNameFromFile = (file: File) =>
  file.name.replace(/\.glb$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Architectural model";

export default function HeroArchitectureManager() {
  const [models, setModels] = useState<HeroModel[]>([]);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<HeroModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadModels = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("homepage_hero_models" as any) as any)
      .select("*").order("display_order", { ascending: true }).order("created_at", { ascending: false });
    if (error) toast.error("Could not load 3D models: " + error.message);
    else setModels((data || []) as HeroModel[]);
    setLoading(false);
  };
  useEffect(() => { void loadModels(); }, []);
  const getUrl = (model: HeroModel) =>
    supabase.storage.from("homepage-hero-models").getPublicUrl(model.file_path).data.publicUrl;

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length > MAX_BATCH_FILES) {
      toast.error(`Select up to ${MAX_BATCH_FILES} GLB files per batch.`);
      event.target.value = ""; setFiles([]); return;
    }
    const invalid = selected.filter((file) => !file.name.toLowerCase().endsWith(".glb") || file.size <= 0 || file.size > MAX_FILE_SIZE);
    if (invalid.length) {
      toast.error("Only valid .glb files up to 50 MB each are accepted.");
      event.target.value = ""; setFiles([]); return;
    }
    setFiles(selected);
  };

  const uploadBatch = async () => {
    if (!files.length) return toast.error("Choose one or more .glb files first.");
    setUploading(true); setUploadProgress({ done: 0, total: files.length });
    const userResult = await supabase.auth.getUser();
    const userId = userResult.data.user?.id;
    if (!userId) { setUploading(false); return toast.error("Your admin session expired. Please sign in again."); }
    let nextIndex = 0;
    let uploaded = 0;
    const failures: string[] = [];
    const worker = async () => {
      while (nextIndex < files.length) {
        const index = nextIndex++;
        const file = files[index];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `models/${crypto.randomUUID()}-${safeName}`;
        const { error: storageError } = await supabase.storage.from("homepage-hero-models").upload(path, file, {
          contentType: "model/gltf-binary", cacheControl: "3600", upsert: false,
        });
        if (storageError) {
          failures.push(`${file.name}: ${storageError.message}`);
          setUploadProgress((current) => ({ ...current, done: current.done + 1 }));
          continue;
        }
        const { error: rowError } = await (supabase.from("homepage_hero_models" as any) as any).insert({
          name: modelNameFromFile(file), description: description.trim() || null,
          file_path: path, file_size: file.size, created_by: userId,
          is_active: true, display_order: Date.now() + index,
        });
        if (rowError) {
          await supabase.storage.from("homepage-hero-models").remove([path]);
          failures.push(`${file.name}: ${rowError.message}`);
        } else uploaded += 1;
        setUploadProgress((current) => ({ ...current, done: current.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()));
    setUploading(false); setFiles([]); setDescription("");
    const input = document.getElementById("hero-glb-upload") as HTMLInputElement | null;
    if (input) input.value = "";
    await loadModels();
    if (uploaded) toast.success(`${uploaded} model(s) uploaded and added to the homepage slideshow.`);
    if (failures.length) toast.error(`${failures.length} upload(s) failed. ${failures.slice(0, 2).join(" | ")}`);
  };

  const setModelVisibility = async (model: HeroModel, enabled: boolean) => {
    setBusyId(model.id);
    const { error } = await (supabase.from("homepage_hero_models" as any) as any)
      .update({ is_active: enabled, updated_at: new Date().toISOString() }).eq("id", model.id);
    setBusyId(null);
    if (error) toast.error("Could not update slideshow: " + error.message);
    else { toast.success(enabled ? "Model added to homepage slideshow." : "Model removed from homepage slideshow."); await loadModels(); }
  };

  const deleteModel = async (model: HeroModel) => {
    if (!window.confirm(`Permanently delete "${model.name}" and its uploaded GLB file?`)) return;
    setBusyId(model.id);
    const { error: rowError } = await (supabase.from("homepage_hero_models" as any) as any).delete().eq("id", model.id);
    if (rowError) { setBusyId(null); return toast.error("Could not delete model record: " + rowError.message); }
    const { error: storageError } = await supabase.storage.from("homepage-hero-models").remove([model.file_path]);
    setBusyId(null);
    if (storageError) toast.error("Record deleted, but storage cleanup failed: " + storageError.message);
    else toast.success("3D model deleted.");
    if (preview?.id === model.id) setPreview(null);
    await loadModels();
  };

  const activeCount = models.filter((model) => model.is_active).length;
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3"><Box className="h-5 w-5 text-primary" /></div>
        <div><h2 className="text-lg font-semibold">Homepage 3D Architecture Slideshow</h2>
          <p className="text-sm text-muted-foreground">Upload multiple building models. Enabled models automatically rotate on the homepage.</p></div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Bulk upload GLB models</h3><Badge variant="secondary"><Images className="mr-1 h-3 w-3" />Multi-select</Badge></div>
          <div className="space-y-2"><Label htmlFor="hero-model-description">Shared description (optional)</Label>
            <Textarea id="hero-model-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note applied to every selected model…" rows={2} /></div>
          <div className="space-y-2"><Label htmlFor="hero-glb-upload">Select GLB files (up to {MAX_BATCH_FILES}; max 50 MB each)</Label>
            <Input id="hero-glb-upload" type="file" accept=".glb,model/gltf-binary" multiple onChange={selectFiles} disabled={uploading} />
            <p className="text-xs text-muted-foreground">Select many .glb files at once. Each filename becomes its slide title. All successful uploads are automatically enabled in the slideshow.</p></div>
          {files.length > 0 && <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
            {files.map((file) => <div key={file.name + file.lastModified} className="flex justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><span className="shrink-0 text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}
          </div>}
          {uploading && <div className="space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>Uploading models…</span><span>{uploadProgress.done}/{uploadProgress.total}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress.total ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }} /></div></div>}
          <Button onClick={uploadBatch} disabled={uploading || files.length === 0}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            {uploading ? `Uploading ${uploadProgress.done}/${uploadProgress.total}` : `Upload ${files.length || ""} 3D model(s)`}
          </Button>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Model preview</h3>{preview && <Badge variant="outline">{preview.name}</Badge>}</div>
          {preview ? <div className="h-[280px] overflow-hidden rounded-lg bg-slate-950"><Canvas camera={{ position: [5, 4, 6], fov: 40 }} dpr={[1, 1.5]}>
            <ambientLight intensity={1.4} /><directionalLight position={[5, 8, 5]} intensity={2} />
            <Suspense fallback={null}><ModelPreview url={getUrl(preview)} /></Suspense><OrbitControls makeDefault />
          </Canvas></div> : <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Select Preview on a model below.</div>}
          <p className="text-xs text-muted-foreground">Drag to orbit and use the scroll wheel to zoom.</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Uploaded models</h3>
          <p className="text-xs text-muted-foreground">{activeCount} model(s) currently included in the homepage slideshow.</p></div>
          <Button size="sm" variant="outline" onClick={() => void loadModels()}><Eye className="mr-2 h-3.5 w-3.5" />Refresh</Button></div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          models.length === 0 ? <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No uploaded models yet.</p> :
          models.map((model) => <div key={model.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><p className="font-medium">{model.name}</p>
              {model.is_active && <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />In slideshow</Badge>}</div>
              <p className="mt-1 text-xs text-muted-foreground">{model.description || "No description"} · {(model.file_size / 1024 / 1024).toFixed(2)} MB</p></div>
            <Button size="sm" variant="outline" onClick={() => setPreview(model)}><Eye className="mr-1 h-3.5 w-3.5" />Preview</Button>
            <Button size="sm" variant={model.is_active ? "secondary" : "default"} onClick={() => void setModelVisibility(model, !model.is_active)} disabled={busyId === model.id}>
              {busyId === model.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : model.is_active ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
              {model.is_active ? "Remove from slides" : "Add to slides"}</Button>
            <Button size="sm" variant="destructive" onClick={() => void deleteModel(model)} disabled={busyId === model.id}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
          </div>)}
      </div>
    </section>
  );
}
