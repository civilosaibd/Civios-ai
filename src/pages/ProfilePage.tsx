import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { usePwaInstall } from "@/lib/pwa";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Upload, UserRound, ShieldCheck, Mail, Sparkles } from "lucide-react";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ProfilePage = () => {
  const { user, loading: authLoading } = useAuth();
  const { checkForUpdate, applyUpdate } = usePwaInstall();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const runUpdateCheck = async () => {
    setCheckingUpdate(true);
    try {
      const hasUpdate = await checkForUpdate();
      if (hasUpdate) {
        toast.success("New version found — reloading…");
        await applyUpdate();
      } else {
        toast.info("You're already on the latest version.");
      }
    } catch {
      toast.error("Couldn't check for updates. Check your connection and try again.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) {
      if (!authLoading) setLoading(false);
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled && data) {
          setDisplayName(data.display_name || "");
          setAvatarUrl(data.avatar_url || null);
        }
      } catch {
        if (!cancelled) toast.error("Couldn't load your profile. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const save = async () => {
    if (!user) return;
    const cleanName = displayName.trim();
    if (cleanName.length > 60) {
      toast.error("Display name must be 60 characters or fewer.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: cleanName, avatar_url: avatarUrl })
        .eq("id", user.id);

      if (error) throw error;
      setDisplayName(cleanName);
      toast.success("Profile updated successfully.");
    } catch {
      toast.error("Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow selecting the same file again after an unsuccessful upload.
    e.target.value = "";
    if (!file || !user) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("Profile images must be 2 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const nextAvatarUrl = data.publicUrl;
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: nextAvatarUrl })
        .eq("id", user.id);

      if (profileError) throw profileError;
      setAvatarUrl(nextAvatarUrl);
      toast.success("Profile photo updated.");
    } catch {
      toast.error("Couldn't upload your photo. Check the image and try again.");
    } finally {
      setUploading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading profile">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;

  const initials = displayName.trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || user.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <SEO title="Profile Settings | CivilOS AI" description="Manage your CivilOS AI profile, profile photo and application updates." path="/profile" />
      <Navbar />
      <main className="flex-1 py-8 sm:py-12">
        <div className="container max-w-4xl space-y-8">
          <header className="rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <UserRound className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Account workspace</p>
                <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight sm:text-4xl">Profile settings</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Keep your profile up to date and manage your CivilOS AI app experience.
                </p>
              </div>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
              <div className="mb-6 flex items-center gap-3 border-b pb-5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-heading text-lg font-semibold">Personal information</h2>
                  <p className="text-sm text-muted-foreground">Manage how your name and photo appear.</p>
                </div>
              </div>

              <div className="mb-7 flex flex-col gap-4 rounded-2xl bg-muted/40 p-4 sm:flex-row sm:items-center">
                <Avatar className="h-20 w-20 border-2 border-background shadow-sm">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName ? `${displayName}'s profile photo` : "Profile photo"} />
                  <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{displayName.trim() || "CivilOS AI user"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">JPG, PNG or WebP · Maximum 2 MB</p>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onUpload} />
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => fileRef.current?.click()} disabled={uploading} aria-busy={uploading}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {uploading ? "Uploading photo…" : "Change profile photo"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-display-name">Display name</Label>
                <Input id="profile-display-name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="Enter your display name" />
                <p className="text-right text-xs text-muted-foreground">{displayName.length}/60</p>
              </div>

              <div className="mt-5 space-y-2">
                <Label htmlFor="profile-email">Email address</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="profile-email" className="pl-9" type="email" autoComplete="email" value={user.email || ""} disabled />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Your sign-in email is managed by your authentication provider.</p>
              </div>

              <Button onClick={save} disabled={saving || uploading} className="mt-6 w-full sm:w-auto">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? "Saving changes…" : "Save profile"}
              </Button>
            </section>

            <aside className="space-y-6">
              <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-heading font-semibold">Account basics</h2>
                    <p className="text-xs text-muted-foreground">Your profile at a glance</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3 border-b pb-3">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-medium">Signed in</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Profile photo</span>
                    <span className="font-medium">{avatarUrl ? "Added" : "Not set"}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-heading font-semibold">App updates</h2>
                    <p className="text-xs text-muted-foreground">Stay on the latest version</p>
                  </div>
                </div>
                <p className="mb-4 text-sm leading-6 text-muted-foreground">
                  Check whether a newer CivilOS AI version is available and refresh the app when an update is ready.
                </p>
                <Button variant="outline" className="w-full" onClick={runUpdateCheck} disabled={checkingUpdate} aria-busy={checkingUpdate}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${checkingUpdate ? "animate-spin" : ""}`} />
                  {checkingUpdate ? "Checking for updates…" : "Check for updates"}
                </Button>
              </section>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProfilePage;
