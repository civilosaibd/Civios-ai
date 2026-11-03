import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls, useGLTF } from "@react-three/drei";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Box, CheckCircle2, Eye, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";

type HeroModel = {
  id: string;
  name: string;
  description: string | null;
  file_path: string;
  file_size: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
};

function ModelPreview({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <Center><primitive object={scene.clone()} /></Center>;
}

export default function HeroArchitectureManager() {
  const [models, setModels] = useState<HeroModel[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HeroModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
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

  const uploadModel = async () => {
    if (!name.trim()) return toast.error("Model name is required.");
    if (!file) return toast.error("Choose a .glb file first.");
    if (!file.name.toLowerCase().endsWith(".glb")) return toast.error("Only self-contained .glb files are supported.");
    if (file.size > 50 * 1024 * 1024) return toast.error("Maximum file size is 50 MB.");
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `models/${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await supabase.storage.from("homepage-hero-models").upload(path, file, {
      contentType: file.type || "model/gltf-binary",
      cacheControl: "3600",
      upsert: false,
    });
    if (storageError) {
      setUploading(false);
      return toast.error("Upload failed: " + storageError.message);
    }
    const { error: rowError } = await (supabase.from("homepage_hero_models" as any) as any).insert({
      name: name.trim(),
      description: description.trim() || null,
      file_path: path,
      file_size: file.size,
      created_by: (await supabase.auth.getUser()).data.user?.id,
      is_active: false,
    });
    if (rowError) {
      await supabase.storage.from("homepage-hero-models").remove([path]);
      setUploading(false);
      return toast.error("Model record could not be saved: " + rowError.message);
    }
    setName("");
    setDescription("");
    setFile(null);
    const input = document.getElementById("hero-glb-upload") as HTMLInputElement | null;
    if (input) input.value = "";
    await loadModels();
    setUploading(false);
    toast.success("3D model uploaded. Preview it, then activate it for the homepage.");
  };

  const activateModel = async (model: HeroModel) => {
    setBusyId(model.id);
    // Deactivate the current model first; the database unique index prevents two active models.
    const { error: deactivateError } = await (supabase.from("homepage_hero_models" as any) as any)
      .update({ is_active: false }).eq("is_active", true);
    if (deactivateError) {
      setBusyId(null);
      return toast.error("Could not deactivate current model: " + deactivateError.message);
    }
    const { error } = await (supabase.from("homepage_hero_models" as any) as any)
      .update({ is_active: true }).eq("id", model.id);
    setBusyId(null);
    if (error) toast.error("Could not activate model: " + error.message);
    else { toast.success("Homepage 3D model updated."); await loadModels(); }
  };

  const deleteModel = async (model: HeroModel) => {
    if (model.is_active) return toast.error("Deactivate or replace the active model before deleting it.");
    if (!window.confirm(`Permanently delete "${model.name}" and its uploaded GLB file?`)) return;
    setBusyId(model.id);
    const { error: rowError } = await (supabase.from("homepage_hero_models" as any) as any).delete().eq("id", model.id);
    if (rowError) {
      setBusyId(null);
      return toast.error("Could not delete model record: " + rowError.message);
    }
    const { error: storageError } = await supabase.storage.from("homepage-hero-models").remove([model.file_path]);
    setBusyId(null);
    if (storageError) toast.error("Record deleted, but storage cleanup failed: " + storageError.message);
    else toast.success("3D model deleted.");
    await loadModels();
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3"><Box className="h-5 w-5 text-primary" /></div>
        <div>
          <h2 className="text-lg font-semibold">Homepage 3D Architecture</h2>
          <p className="text-sm text-muted-foreground">Upload and manage the architectural model displayed in the homepage hero.</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Upload new GLB model</h3>
          <div className="space-y-2">
            <Label htmlFor="hero-model-name">Model name</Label>
            <Input id="hero-model-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contemporary Mixed-use Tower" maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-model-description">Internal description (optional)</Label>
            <Textarea id="hero-model-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Building type, floors, asset notes…" rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-glb-upload">3D model file (.glb, max 50 MB)</Label>
            <Input id="hero-glb-upload" type="file" accept=".glb,model/gltf-binary" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
          <Button onClick={uploadModel} disabled={uploading || !file || !name.trim()}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            Upload 3D model
          </Button>
          <p className="text-xs text-muted-foreground">Use optimized, self-contained GLB files. Uploading does not publish a model automatically.</p>
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Model preview</h3>
            {preview && <Badge variant="outline">{preview.name}</Badge>}
          </div>
          {preview ? (
            <div className="h-[280px] overflow-hidden rounded-lg bg-slate-950">
              <Canvas camera={{ position: [5, 4, 6], fov: 40 }} dpr={[1, 1.5]}>
                <ambientLight intensity={1.4} />
                <directionalLight position={[5, 8, 5]} intensity={2} />
                <Suspense fallback={null}><ModelPreview url={getUrl(preview)} /></Suspense>
                <OrbitControls makeDefault />
              </Canvas>
            </div>
          ) : (
            <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Select Preview on a model below.</div>
          )}
          <p className="text-xs text-muted-foreground">Drag to orbit and use the scroll wheel to zoom.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Uploaded models</h3><Button size="sm" variant="outline" onClick={() => void loadModels()}><Eye className="mr-2 h-3.5 w-3.5" />Refresh</Button></div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          models.length === 0 ? <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No uploaded models yet.</p> :
          models.map((model) => (
            <div key={model.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap"><p className="font-medium">{model.name}</p>{model.is_active && <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />Active on homepage</Badge>}</div>
                <p className="mt-1 text-xs text-muted-foreground">{model.description || "No description"} · {(model.file_size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPreview(model)}><Eye className="mr-1 h-3.5 w-3.5" />Preview</Button>
              {!model.is_active && <Button size="sm" onClick={() => void activateModel(model)} disabled={busyId === model.id}>{busyId === model.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Set active</Button>}
              <Button size="sm" variant="destructive" onClick={() => void deleteModel(model)} disabled={busyId === model.id || model.is_active}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
            </div>
          ))
        }
      </div>
    </section>
  );
}
