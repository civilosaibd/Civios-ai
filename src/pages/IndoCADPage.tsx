import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Badge } from "@/components/ui/badge";
import { DraftingCompass, ShieldCheck, Clock3, LockKeyhole } from "lucide-react";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { useActiveProjectId } from "@/lib/projectSelection";
import ProfessionalCadWorkspace from "@/components/cad/ProfessionalCadWorkspace";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * IndoCAD is a dedicated, full-page drafting workspace.
 * It intentionally reuses CivilOS AI's existing CAD engine and keeps the
 * surrounding application navigation/authentication intact.
 */
export default function IndoCADPage() {
  const activeProjectId = useActiveProjectId();
  const storageKey = `civilos-indocad:v1:${activeProjectId ?? "personal"}`;
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      setRoleLoading(false);
      return () => { active = false; };
    }
    setRoleLoading(true);
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setIsAdmin(!error && !!data);
        setRoleLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  const canAccessWorkspace = !authLoading && !roleLoading && !!user && isAdmin;

  return (
    <SidebarProvider>
      <SEO
        title="IndoCAD — Professional Drawing Workspace | CivilOS AI"
        description="A dedicated 2D architectural and engineering drafting workspace inside CivilOS AI."
      />
      <div className="flex h-dvh min-h-[560px] w-full overflow-hidden bg-background">
        <DashboardSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm">
              <DraftingCompass className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold md:text-base">IndoCAD Workspace</h1>
              <p className="hidden text-[10px] text-muted-foreground sm:block">
                Professional 2D drafting · {activeProjectId ? "Project drawing" : "Personal drawing"} · Auto-saved locally
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className={isAdmin ? "hidden border-emerald-500/40 text-emerald-600 sm:inline-flex" : "border-amber-500/40 text-amber-600"}>
                {isAdmin ? <><ShieldCheck className="mr-1 h-3 w-3" /> Admin preview</> : <><Clock3 className="mr-1 h-3 w-3" /> Coming Soon</>}
              </Badge>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex min-h-0 flex-1 overflow-hidden">
            {canAccessWorkspace ? (
              <div className="h-full min-h-0 w-full">
                <ProfessionalCadWorkspace key={storageKey} storageKey={storageKey} />
              </div>
            ) : (
              <div className="flex min-h-full w-full items-center justify-center bg-gradient-to-br from-background via-muted/30 to-amber-500/5 p-6">
                <div className="w-full max-w-xl rounded-3xl border bg-card/90 p-8 text-center shadow-xl backdrop-blur">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                    {authLoading || roleLoading ? <Clock3 className="h-8 w-8 animate-pulse" /> : <LockKeyhole className="h-8 w-8" />}
                  </div>
                  <Badge variant="outline" className="mb-4 border-amber-500/40 text-amber-600">Coming Soon</Badge>
                  <h2 className="mb-3 text-2xl font-bold tracking-tight">IndoCAD is under development</h2>
                  <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                    We are preparing the professional 2D drafting workspace for release. IndoCAD will become available to users after development and quality testing are complete.
                  </p>
                  <p className="mt-5 text-xs text-muted-foreground">Admin preview access only · Public launch pending</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
