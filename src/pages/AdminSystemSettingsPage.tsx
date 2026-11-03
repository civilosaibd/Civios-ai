import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings, Save, RefreshCw, ShieldAlert, Upload, Handshake, LockKeyhole, History } from "lucide-react";

type SettingsData = {
  visualization: { max_file_mb: number; max_files: number };
  affiliate: { first_payment_rate: number; subsequent_payment_rate: number; editable: false };
  can_manage: boolean;
};

export default function AdminSystemSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [maxFileMb, setMaxFileMb] = useState("25");
  const [maxFiles, setMaxFiles] = useState("10");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!authLoading && !user) navigate("/auth?redirect=/admin/settings"); }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_read_system_settings");
    if (error) {
      if (error.message?.toLowerCase().includes("permission required") || error.message?.toLowerCase().includes("admin access")) setIsAdmin(false);
      else toast.error(error.message || "Unable to load system settings. Apply the migration first.");
      setSettings(null);
    } else {
      const value = data as unknown as SettingsData;
      setIsAdmin(true); setSettings(value);
      setMaxFileMb(String(value.visualization.max_file_mb));
      setMaxFiles(String(value.visualization.max_files));
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const save = async () => {
    const mb = Number(maxFileMb), files = Number(maxFiles);
    if (!Number.isInteger(mb) || mb < 1 || mb > 50) return toast.error("Maximum file size must be 1–50 MB.");
    if (!Number.isInteger(files) || files < 1 || files > 20) return toast.error("Maximum files per job must be 1–20.");
    if (!window.confirm(`Save visualization upload limits? Max ${mb} MB per file and ${files} files per job.`)) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_visualization_limits", { _max_file_mb: mb, _max_files: files });
    if (error) toast.error(error.message || "Settings could not be saved.");
    else { toast.success("Visualization limits updated and audit logged."); await load(); }
    setSaving(false);
  };

  return <>
    <SEO title="Admin · System Settings" description="Manage validated CivilOS system configuration." />
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <DashboardSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 md:px-6">
            <SidebarTrigger /><h1 className="flex-1 font-heading text-base md:text-lg font-semibold truncate">System Settings</h1>
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
            <NotificationBell /><ThemeToggle />
          </header>
          <main className="flex-1 p-4 md:p-6 space-y-5 max-w-5xl w-full mx-auto">
            {loading && isAdmin === null ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></>
              : isAdmin === false ? <div className="rounded-xl border bg-card p-10 text-center"><ShieldAlert className="h-9 w-9 mx-auto mb-2 text-muted-foreground/50" /><p className="font-medium">Admin access required</p></div>
              : settings && <>
                <div className="rounded-xl border bg-card p-4 flex gap-3"><Settings className="h-5 w-5 mt-0.5 text-primary" /><div><p className="font-medium text-sm">Validated system configuration</p><p className="text-xs text-muted-foreground mt-1">Only the settings listed below are exposed. Sensitive keys and arbitrary app_settings writes are not available from this screen.</p></div></div>
                <section className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">3D Visualization Upload Limits</h2><p className="text-xs text-muted-foreground">Controls the upload constraints used by the visualization workflow.</p></div></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1"><span className="text-sm font-medium">Maximum file size (MB)</span><input type="number" min="1" max="50" step="1" value={maxFileMb} onChange={(e) => setMaxFileMb(e.target.value)} disabled={!settings.can_manage} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /><span className="text-xs text-muted-foreground">Allowed range: 1–50 MB</span></label>
                    <label className="space-y-1"><span className="text-sm font-medium">Maximum files per visualization</span><input type="number" min="1" max="20" step="1" value={maxFiles} onChange={(e) => setMaxFiles(e.target.value)} disabled={!settings.can_manage} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /><span className="text-xs text-muted-foreground">Allowed range: 1–20 files</span></label>
                  </div>
                  <div className="flex flex-wrap gap-2">{settings.can_manage ? <><Button onClick={() => void save()} disabled={saving || loading}><Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save limits"}</Button><Button variant="outline" onClick={() => { setMaxFileMb(String(settings.visualization.max_file_mb)); setMaxFiles(String(settings.visualization.max_files)); }} disabled={saving}>Reset form</Button></> : <Badge variant="secondary">Read only · settings.view</Badge>}</div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><History className="h-3.5 w-3.5" />Every successful change is written to a protected settings audit log.</p>
                </section>
                <section className="rounded-xl border bg-card p-5 space-y-3">
                  <div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">Affiliate Commission Policy</h2><p className="text-xs text-muted-foreground">Current configured rates applied by the server-side commission transaction.</p></div></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">First eligible verified payment</p><p className="text-2xl font-semibold">{(settings.affiliate.first_payment_rate * 100).toFixed(2)}%</p></div>
                    <div className="rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Subsequent eligible verified payments</p><p className="text-2xl font-semibold">{(settings.affiliate.subsequent_payment_rate * 100).toFixed(2)}%</p></div>
                  </div>
                  <Badge variant="secondary" className="gap-1"><LockKeyhole className="h-3 w-3" />Read-only policy</Badge>
                  <p className="text-xs text-muted-foreground">Commission rates are deliberately not editable here. Changing a financial policy requires a separate approved migration and audit/reconciliation plan so historical ledger rows are not silently altered.</p>
                </section>
              </>}
          </main>
        </div>
      </div>
    </SidebarProvider>
  </>;
}
