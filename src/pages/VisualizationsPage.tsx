import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Box, Copy, Loader2, Pencil, Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { createVisualization, deleteVisualization, duplicateVisualization, listVisualizations, updateVisualization, type VizRow } from "@/lib/viz/api";
import { Disclaimer, useL } from "@/components/viz/bits";

const STATUS: Record<string, { en: string; bn: string; cls: string }> = {
  draft: { en: "Draft", bn: "ড্রাফট", cls: "" }, analyzing: { en: "Analyzing", bn: "বিশ্লেষণ চলছে", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  needs_review: { en: "Needs review", bn: "যাচাই বাকি", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  verified: { en: "Verified", bn: "যাচাইকৃত", cls: "bg-emerald-500/15 text-emerald-700" }, generated: { en: "3D ready", bn: "৩ডি প্রস্তুত", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  failed: { en: "Failed", bn: "ব্যর্থ", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

export default function VisualizationsPage() {
  const L = useL();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const project = sp.get("project");
  const [items, setItems] = useState<VizRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<VizRow | null>(null);
  const [ren, setRen] = useState<{ row: VizRow; name: string } | null>(null);

  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);
  const load = useCallback(async () => { try { setError(null); setItems(await listVisualizations(project)); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setItems([]); } }, [project]);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const create = async () => {
    setCreating(true);
    try { const v = await createVisualization({ name: L("New 3D visualization", "নতুন ৩ডি ভিজ্যুয়ালাইজেশন"), project_id: project }); navigate(`/visualizations/${v.id}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not create"); setCreating(false); }
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } };

  return (
    <SidebarProvider>
      <SEO title="3D Construction Visualization — CivilOS AI" description="Turn floor plans, CAD files and renders into verified, interactive 3D building models." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2"><SidebarTrigger /><h1 className="font-heading font-semibold flex items-center gap-2"><Box className="h-4 w-4 text-accent" />{L("3D Construction Visualization", "৩ডি কনস্ট্রাকশন ভিজ্যুয়ালাইজেশন")}</h1></div>
            <ThemeToggle />
          </header>
          <main className="p-4 md:p-6 max-w-6xl w-full mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground max-w-xl">{L("Upload a plan (JPG/PNG/PDF/DXF) or a render, calibrate it, verify what the AI found, then explore a 3D model. Nothing is generated without your confirmation.", "প্ল্যান (JPG/PNG/PDF/DXF) বা রেন্ডার আপলোড করুন, স্কেল ক্যালিব্রেট করুন, AI যা পেয়েছে তা যাচাই করুন, তারপর ৩ডি মডেল দেখুন। আপনার নিশ্চিতকরণ ছাড়া কিছু তৈরি হয় না।")}</p>
              <div className="flex gap-2">
                <Button variant="outline" asChild><Link to="/visualizations/demo"><Sparkles className="h-4 w-4 mr-1" />{L("Try the demo", "ডেমো দেখুন")}</Link></Button>
                <Button onClick={create} disabled={creating} data-testid="viz-new">{creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}{L("New visualization", "নতুন")}</Button>
              </div>
            </div>
            {project && <Badge variant="outline">{L("Filtered by project", "প্রজেক্ট ফিল্টার")} · <Link className="underline ml-1" to="/visualizations">{L("clear", "মুছুন")}</Link></Badge>}
            {error && <Card className="p-4 text-sm border-destructive/50"><b>{L("Could not load.", "লোড করা যায়নি।")}</b> {error}<div className="text-xs text-muted-foreground mt-1">{L("If this is a new setup, the database migration for this module may not be applied yet.", "নতুন সেটআপ হলে এই মডিউলের ডাটাবেস মাইগ্রেশন এখনো প্রয়োগ হয়নি হতে পারে।")}</div></Card>}
            {items === null && <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {items?.length === 0 && !error && (
              <Card className="p-10 text-center space-y-3"><Box className="h-10 w-10 mx-auto text-muted-foreground" /><p className="font-medium">{L("No visualizations yet", "এখনো কোনো ভিজ্যুয়ালাইজেশন নেই")}</p><Button onClick={create} disabled={creating}>{L("Create your first one", "প্রথমটি তৈরি করুন")}</Button></Card>
            )}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {items?.map((v) => (
                <Card key={v.id} className="p-4 space-y-3 hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/visualizations/${v.id}`} className="font-semibold hover:underline line-clamp-2">{v.name}</Link>
                    <Badge variant="outline" className={STATUS[v.status]?.cls}>{L(STATUS[v.status]?.en ?? v.status, STATUS[v.status]?.bn ?? v.status)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{v.building_type ?? "—"} · {v.floor_count ? `${v.floor_count} ${L("floors", "তলা")}` : L("floors: auto", "তলা: অটো")} · {new Date(v.updated_at).toLocaleDateString()}</div>
                  <div className="flex gap-1">
                    <Button size="sm" asChild><Link to={`/visualizations/${v.id}`}>{L("Open", "খুলুন")}</Link></Button>
                    <Button size="icon" variant="ghost" aria-label="Rename" onClick={() => setRen({ row: v, name: v.name })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Duplicate" onClick={() => void act(() => duplicateVisualization(v.id), L("Duplicated", "ডুপ্লিকেট হয়েছে"))}><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDel(v)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </Card>
              ))}
            </div>
            <Disclaimer />
          </main>
        </div>
      </div>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{L("Delete this visualization?", "এই ভিজ্যুয়ালাইজেশন মুছবেন?")}</AlertDialogTitle><AlertDialogDescription>{del?.name} — {L("uploaded files and the 3D model will be permanently deleted.", "আপলোড করা ফাইল ও ৩ডি মডেল স্থায়ীভাবে মুছে যাবে।")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{L("Cancel", "বাতিল")}</AlertDialogCancel><AlertDialogAction onClick={() => { const d = del!; setDel(null); void act(() => deleteVisualization(d.id), L("Deleted", "মুছে ফেলা হয়েছে")); }}>{L("Delete", "মুছুন")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!ren} onOpenChange={(o) => !o && setRen(null)}>
        <DialogContent><DialogHeader><DialogTitle>{L("Rename", "নাম বদলান")}</DialogTitle></DialogHeader>
          <Input value={ren?.name ?? ""} maxLength={200} onChange={(e) => ren && setRen({ ...ren, name: e.target.value })} />
          <DialogFooter><Button disabled={!ren?.name.trim()} onClick={() => { const r = ren!; setRen(null); void act(() => updateVisualization(r.row.id, { name: r.name.trim() }), L("Renamed", "নাম বদলানো হয়েছে")); }}>{L("Save", "সেভ")}</Button></DialogFooter></DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
