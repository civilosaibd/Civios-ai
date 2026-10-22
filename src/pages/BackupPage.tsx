import { useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Upload, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { WORKSPACE_KEYS, buildBackup, parseBackup, type Backup } from "@/lib/backup";

const PROJECT_COLS = "name,client_name,location,project_type,status,start_date,end_date,budget,file_name,inputs,estimate,bnbc_loads";

export default function BackupPage() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const L = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ backup: Backup; skipped: string[]; fileName: string } | null>(null);
  const [pickKeys, setPickKeys] = useState<Record<string, boolean>>({});
  const [pickProjects, setPickProjects] = useState(true);

  const exportAll = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const [ws, pr] = await Promise.all([
        supabase.from("user_workspace").select("key,value").eq("user_id", user.id),
        supabase.from("projects").select(PROJECT_COLS).eq("user_id", user.id).order("created_at", { ascending: true }),
      ]);
      if (ws.error || pr.error) throw new Error(ws.error?.message || pr.error?.message);
      // edits that have not reached the account yet live in this browser: prefer them for those sections
      const rows = (ws.data ?? []).map((r) => {
        if (localStorage.getItem(`${r.key}:unsaved`) === user.id) {
          try { const raw = localStorage.getItem(r.key); if (raw) return { key: r.key, value: JSON.parse(raw) as unknown }; } catch { /* use server copy */ }
        }
        return { key: r.key, value: r.value as unknown };
      });
      const backup = buildBackup(rows, (pr.data ?? []) as Record<string, unknown>[]);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `civilos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success(L(`Backup downloaded: ${Object.keys(backup.workspace).length} sections, ${backup.projects.length} projects`, `ব্যাকআপ ডাউনলোড হয়েছে: ${Object.keys(backup.workspace).length}টি সেকশন, ${backup.projects.length}টি প্রজেক্ট`));
    } catch (e) {
      toast.error(L("Export failed: ", "এক্সপোর্ট ব্যর্থ: ") + (e instanceof Error ? e.message : ""));
    } finally { setBusy(false); }
  };

  const onFile = async (f?: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error(L("File too large (max 5 MB)", "ফাইল অনেক বড় (সর্বোচ্চ ৫ MB)")); return; }
    const res = parseBackup(await f.text());
    if (!res.ok || !res.backup) { setPending(null); toast.error(res.error ?? "Invalid file"); return; }
    setPickKeys(Object.fromEntries(Object.keys(res.backup.workspace).map((k) => [k, true])));
    setPickProjects(res.backup.projects.length > 0);
    setPending({ backup: res.backup, skipped: res.skipped, fileName: f.name });
  };

  const restore = async () => {
    if (!user || !pending) return;
    setBusy(true);
    let sections = 0, projects = 0, failed = 0;
    try {
      for (const [key, value] of Object.entries(pending.backup.workspace)) {
        if (!pickKeys[key]) continue;
        const { error } = await supabase.from("user_workspace").upsert({ user_id: user.id, key, value: value as never, updated_at: new Date().toISOString() });
        if (error) { failed++; continue; }
        localStorage.setItem(key, JSON.stringify(value));
        localStorage.removeItem(`${key}:unsaved`);
        sections++;
      }
      if (pickProjects && pending.backup.projects.length) {
        const rows = pending.backup.projects.map((p) => ({ ...p, user_id: user.id, inputs: p.inputs as never, estimate: p.estimate as never, bnbc_loads: p.bnbc_loads as never }));
        const { error } = await supabase.from("projects").insert(rows);
        if (error) failed += rows.length; else projects = rows.length;
      }
      if (failed) toast.error(L(`Restored ${sections} sections and ${projects} project(s); ${failed} item(s) failed.`, `${sections}টি সেকশন ও ${projects}টি প্রজেক্ট রিস্টোর হয়েছে; ${failed}টি ব্যর্থ।`));
      else toast.success(L(`Restored ${sections} sections and ${projects} project(s).`, `${sections}টি সেকশন ও ${projects}টি প্রজেক্ট রিস্টোর হয়েছে।`));
      setPending(null); if (fileRef.current) fileRef.current.value = "";
    } finally { setBusy(false); }
  };

  const chosen = pending ? Object.keys(pending.backup.workspace).filter((k) => pickKeys[k]).length + (pickProjects ? pending.backup.projects.length : 0) : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10">
        <div className="container max-w-2xl space-y-4">
          <h1 className="font-heading text-2xl md:text-3xl font-bold">{L("Backup & Restore", "ব্যাকআপ ও রিস্টোর")}</h1>
          {!loading && !user ? (
            <Card><CardContent className="pt-6 space-y-3">
              <p>{L("Sign in to back up or restore your projects and saved tool data.", "প্রজেক্ট ও সেভ করা ডেটা ব্যাকআপ/রিস্টোর করতে সাইন ইন করুন।")}</p>
              <Button asChild><Link to="/auth">{L("Sign in", "সাইন ইন")}</Link></Button>
            </CardContent></Card>
          ) : (<>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Download className="h-5 w-5" />{L("Export", "এক্সপোর্ট")}</CardTitle>
                <CardDescription>{L("Download one JSON file with your projects and saved data (schedule, QA, site map, inventory, equipment, finance, defects, plan input). It never contains your password, plan, payments or sharing links.", "আপনার প্রজেক্ট ও সেভ করা ডেটা (শিডিউল, QA, সাইট ম্যাপ, ইনভেন্টরি, যন্ত্রপাতি, ফিন্যান্স, ত্রুটি, প্ল্যান ইনপুট) এক JSON ফাইলে নামান। এতে পাসওয়ার্ড, প্ল্যান, পেমেন্ট বা শেয়ার লিংক থাকে না।")}</CardDescription>
              </CardHeader>
              <CardContent><Button onClick={exportAll} disabled={busy || !user}><Download className="h-4 w-4 mr-2" />{L("Download backup", "ব্যাকআপ ডাউনলোড")}</Button></CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Upload className="h-5 w-5" />{L("Restore from a backup", "ব্যাকআপ থেকে রিস্টোর")}</CardTitle>
                <CardDescription>{L("Choose a CivilOS AI backup file. You will see what it contains before anything changes.", "CivilOS AI ব্যাকআপ ফাইল বাছাই করুন। কিছু বদলানোর আগে আপনি ভেতরের তথ্য দেখতে পাবেন।")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input ref={fileRef} type="file" accept="application/json,.json" aria-label={L("Backup file", "ব্যাকআপ ফাইল")} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-2 file:text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
                {pending && (
                  <div className="rounded-md border p-4 space-y-3" data-testid="restore-preview">
                    <p className="text-sm font-medium break-all">{pending.fileName}{pending.backup.exportedAt ? ` · ${pending.backup.exportedAt.slice(0, 10)}` : ""}</p>
                    {Object.keys(pending.backup.workspace).map((k) => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={!!pickKeys[k]} onCheckedChange={(v) => setPickKeys((p) => ({ ...p, [k]: v === true }))} />
                        {lang === "bn" ? WORKSPACE_KEYS[k].bn : WORKSPACE_KEYS[k].en}
                        <span className="text-muted-foreground">— {L("replaces your current data", "বর্তমান ডেটা বদলে যাবে")}</span>
                      </label>
                    ))}
                    {pending.backup.projects.length > 0 && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={pickProjects} onCheckedChange={(v) => setPickProjects(v === true)} />
                        {L(`${pending.backup.projects.length} project(s)`, `${pending.backup.projects.length}টি প্রজেক্ট`)}
                        <span className="text-muted-foreground">— {L("added as new projects; existing ones are not touched", "নতুন প্রজেক্ট হিসেবে যোগ হবে; পুরনোগুলো অক্ষত")}</span>
                      </label>
                    )}
                    {pending.skipped.length > 0 && (
                      <div className="text-xs text-muted-foreground flex gap-2"><ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                        <div><p>{L("Skipped for safety:", "নিরাপত্তার জন্য বাদ গেছে:")}</p><ul className="list-disc pl-4">{pending.skipped.slice(0, 8).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                      </div>
                    )}
                    <p className="text-xs text-amber-600 dark:text-amber-400">{L("Tip: download a backup of your current data first. Restoring cannot be undone.", "পরামর্শ: আগে বর্তমান ডেটার ব্যাকআপ নামিয়ে নিন। রিস্টোর ফেরত নেওয়া যায় না।")}</p>
                    <div className="flex gap-2">
                      <Button onClick={restore} disabled={busy || chosen === 0}>{L("Restore selected", "নির্বাচিতগুলো রিস্টোর")}</Button>
                      <Button variant="outline" disabled={busy} onClick={() => { setPending(null); if (fileRef.current) fileRef.current.value = ""; }}>{L("Cancel", "বাতিল")}</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>)}
        </div>
      </main>
      <Footer />
    </div>
  );
}
