import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Badge } from "@/components/ui/badge";
import { DraftingCompass, ShieldCheck } from "lucide-react";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import ProfessionalCadWorkspace from "@/components/cad/ProfessionalCadWorkspace";

/**
 * IndoCAD is a dedicated, full-page drafting workspace.
 * It intentionally reuses CivilOS AI's existing CAD engine and keeps the
 * surrounding application navigation/authentication intact.
 */
export default function IndoCADPage() {
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
                Professional 2D drafting · Architectural tools · Precision editing
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden border-emerald-500/40 text-emerald-600 sm:inline-flex">
                <ShieldCheck className="mr-1 h-3 w-3" /> Dedicated workspace
              </Badge>
              <ThemeToggle />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto p-2 md:p-4">
            <div className="mx-auto w-full max-w-[1800px]">
              <ProfessionalCadWorkspace />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
