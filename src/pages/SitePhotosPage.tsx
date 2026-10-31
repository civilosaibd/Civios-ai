import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Camera, MapPin, Trash2, Loader2, Upload, Images, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { useActiveProjectId } from "@/lib/projectSelection";
import { listProjectArtifacts, saveProjectArtifact } from "@/lib/projectArtifacts";

type PhotoRecord = {
  id: string;
  user_id: string;
  project_name: string | null;
  activity: string;
  caption: string;
  storage_path: string;
  taken_on: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  imageUrl?: string;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export default function SitePhotosPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const projectId = useActiveProjectId();
  const [projectArtifactId, setProjectArtifactId] = useState<string | undefined>();
  const [projectReady, setProjectReady] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [projectName, setProjectName] = useState("");
  const [activity, setActivity] = useState("");
  const [caption, setCaption] = useState("");
  const [takenOn, setTakenOn] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const loadPhotos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (projectId) {
      try {
        const items = await listProjectArtifacts(projectId);
        const artifact = items.find((item) => item.artifact_type === "project-site-photos");
        const rows = Array.isArray(artifact?.data?.photos) ? artifact.data.photos as PhotoRecord[] : [];
        setProjectArtifactId(artifact?.id);
        const withUrls = await Promise.all(rows.map(async (photo) => {
          const { data: signed } = await supabase.storage.from("site-photos").createSignedUrl(photo.storage_path, 60 * 60);
          return { ...photo, imageUrl: signed?.signedUrl };
        }));
        setPhotos(withUrls);
        setProjectReady(true); setProjectError(null); setLoading(false);
      } catch (error) {
        setProjectError(error instanceof Error ? error.message : "Could not load project photos.");
        setPhotos([]); setProjectReady(true); setLoading(false);
      }
      return;
    }
    const { data, error } = await (supabase.from("site_photos" as any) as any)
      .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (error) {
      toast.error("Could not load site photos. Check that the latest database migration has been applied.");
      setPhotos([]);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as PhotoRecord[];
    const withUrls = await Promise.all(rows.map(async (photo) => {
      const { data: signed } = await supabase.storage.from("site-photos").createSignedUrl(photo.storage_path, 60 * 60);
      return { ...photo, imageUrl: signed?.signedUrl };
    }));
    setPhotos(withUrls);
    setLoading(false);
  }, [user, projectId]);

  useEffect(() => {
    if (user) void loadPhotos();
  }, [user, loadPhotos]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        toast.success("Location added to this upload.");
      },
      () => toast.error("Location permission was not granted. You can upload without geo-tagging."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const uploadPhotos = async () => {
    if (!user || files.length === 0) {
      toast.error("Select at least one photo first.");
      return;
    }
    const invalid = files.find((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_BYTES);
    if (invalid) {
      toast.error("Use JPG, PNG, WebP or HEIC photos, each no larger than 10 MB.");
      return;
    }
    setUploading(true);
    let succeeded = 0;
    let projectRows: PhotoRecord[] = [];
    for (const file of files) {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("site-photos").upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        toast.error(`Upload failed for ${file.name}: ${uploadError.message}`);
        continue;
      }
      if (projectId) {
        projectRows.push({ id: crypto.randomUUID(), user_id: user.id, project_name: projectName.trim() || null, activity: activity.trim(), caption: caption.trim(), storage_path: storagePath, taken_on: takenOn, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, created_at: new Date().toISOString() });
        succeeded += 1;
        continue;
      }
      const { error: rowError } = await (supabase.from("site_photos" as any) as any).insert({
        user_id: user.id,
        project_name: projectName.trim() || null,
        activity: activity.trim(),
        caption: caption.trim(),
        storage_path: storagePath,
        taken_on: takenOn,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      });
      if (rowError) {
        await supabase.storage.from("site-photos").remove([storagePath]);
        toast.error(`Photo metadata could not be saved: ${rowError.message}`);
        continue;
      }
      succeeded += 1;
    }
    if (projectId && projectRows.length > 0) {
      try {
        const current = photos.map(({ imageUrl: _imageUrl, ...photo }) => photo);
        const saved = await saveProjectArtifact({ id: projectArtifactId, projectId, artifactType: "project-site-photos", title: "Site Photo Library", description: "Private construction progress photos with activity, date and optional GPS coordinates", data: { photos: [...projectRows, ...current].slice(0, 500) } });
        setProjectArtifactId(saved.id);
      } catch (error) {
        await supabase.storage.from("site-photos").remove(projectRows.map((row) => row.storage_path));
        succeeded = 0;
        toast.error(error instanceof Error ? error.message : "Could not save project photo records.");
      }
    }
    setUploading(false);
    if (succeeded > 0) {
      toast.success(`${succeeded} photo${succeeded === 1 ? "" : "s"} uploaded.`);
      setFiles([]);
      setCaption("");
      setLocation(null);
      const input = document.getElementById("site-photo-files") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadPhotos();
    }
  };

  const deletePhoto = async (photo: PhotoRecord) => {
    if (!window.confirm("Delete this photo permanently?")) return;
    const { error: storageError } = await supabase.storage.from("site-photos").remove([photo.storage_path]);
    if (storageError) {
      toast.error(`Could not delete image file: ${storageError.message}`);
      return;
    }
    if (projectId) {
      try {
        const remaining = photos.filter((item) => item.id !== photo.id).map(({ imageUrl: _imageUrl, ...row }) => row);
        const saved = await saveProjectArtifact({ id: projectArtifactId, projectId, artifactType: "project-site-photos", title: "Site Photo Library", description: "Private construction progress photos with activity, date and optional GPS coordinates", data: { photos: remaining } });
        setProjectArtifactId(saved.id);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update project photo register."); return; }
    } else {
      const { error } = await (supabase.from("site_photos" as any) as any).delete().eq("id", photo.id).eq("user_id", user?.id);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Photo deleted.");
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
  };

  if (authLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <>
      <SEO title="Site Photos — CivilOS AI" description="Upload and organize construction site photos by project, activity and date." url="/site-photos" />
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <DashboardSidebar />
          <main className="flex-1 min-w-0">
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <SidebarTrigger />
              <Camera className="h-5 w-5 text-accent" />
              <div>
                <h1 className="font-heading font-bold leading-tight">Site Photos</h1>{projectId && <p className="text-xs text-muted-foreground">{projectError || (projectReady ? "Project-specific photo library" : "Loading project photos…")}</p>}
                <p className="text-xs text-muted-foreground">Private photo records for your construction projects</p>
              </div>
            </header>
            <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
              <Card>
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Upload className="h-5 w-5" /> Upload site photos</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <label className="block space-y-2 text-sm font-medium">
                    Photos (multiple allowed)
                    <Input id="site-photo-files" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple capture="environment" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
                    <span className="block text-xs font-normal text-muted-foreground">JPG, PNG, WebP or HEIC · max 10 MB per photo · private storage</span>
                  </label>
                  {files.length > 0 && <p className="text-sm">{files.length} photo(s) selected: {files.map((file) => file.name).join(", ")}</p>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium">Project name (optional)<Input maxLength={160} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Sample Residence" /></label>
                    <label className="space-y-1 text-sm font-medium">Activity / location on site<Input maxLength={160} value={activity} onChange={(event) => setActivity(event.target.value)} placeholder="e.g. Foundation rebar inspection" /></label>
                    <label className="space-y-1 text-sm font-medium sm:col-span-2">Caption / notes<Textarea maxLength={2000} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="What does this photo show? Add observations or follow-up notes." rows={3} /></label>
                    <label className="space-y-1 text-sm font-medium">Photo date<Input type="date" value={takenOn} onChange={(event) => setTakenOn(event.target.value)} /></label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" onClick={requestLocation}><MapPin className="mr-2 h-4 w-4" />{location ? "Location added" : "Add current location"}</Button>
                    {location && <span className="text-xs text-muted-foreground">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span>}
                    <Button className="sm:ml-auto" onClick={uploadPhotos} disabled={uploading || files.length === 0 || (!!projectId && !projectReady)}>
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? "Uploading…" : "Upload photos"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Location is optional and is only attached after you press the location button. Confirm that site photos do not expose sensitive client or property information before sharing them.</p>
                </CardContent>
              </Card>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3"><h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Images className="h-5 w-5" /> Your photo library</h2><span className="text-sm text-muted-foreground">{photos.length} / 100 recent photos</span></div>
                {loading ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div> :
                  photos.length === 0 ? <Card><CardContent className="grid min-h-40 place-items-center p-6 text-center text-sm text-muted-foreground">No site photos yet. Upload your first site photo above.</CardContent></Card> :
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {photos.map((photo) => <Card key={photo.id} className="overflow-hidden">
                      {photo.imageUrl ? <img src={photo.imageUrl} alt={photo.caption || photo.activity || "Construction site photo"} loading="lazy" className="aspect-[4/3] w-full object-cover bg-muted" /> : <div className="grid aspect-[4/3] place-items-center bg-muted text-sm text-muted-foreground">Preview unavailable</div>}
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-2"><p className="font-medium break-words">{photo.project_name || "Unassigned project"}</p><Button variant="ghost" size="icon" aria-label="Delete photo" onClick={() => void deletePhoto(photo)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                        {photo.activity && <p className="text-sm">{photo.activity}</p>}
                        {photo.caption && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{photo.caption}</p>}
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{photo.taken_on}</p>
                        {photo.latitude !== null && photo.longitude !== null && <a className="text-xs text-primary underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${photo.latitude}&mlon=${photo.longitude}#map=17/${photo.latitude}/${photo.longitude}`}>View tagged location</a>}
                      </CardContent>
                    </Card>)}
                  </div>
                }
              </section>
            </div>
          </main>
        </div>
      </SidebarProvider>
    </>
  );
}
