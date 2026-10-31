import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { Building2, Box, Maximize2, Monitor, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

type ToolId = "floorplanmaker" | "gridsnap" | "floorplandrawer";

const TOOLS: { id: ToolId; name: string; subtitle: string; url: string; icon: typeof Building2 }[] = [
  {
    id: "floorplanmaker",
    name: "Automatic Floor Plan Generator",
    subtitle: "AI-assisted floor plan creation",
    url: "https://www.floorplanmaker.app/free-floor-plan-maker",
    icon: Building2,
  },
  {
    id: "gridsnap",
    name: "Professional Floor Plan CAD",
    subtitle: "Precision 2D planning workspace",
    url: "https://gridsnap.app/",
    icon: Monitor,
  },
  {
    id: "floorplandrawer",
    name: "Free 3D Designer",
    subtitle: "Floor plan drawing and 3D design",
    url: "https://floorplandrawer.com/",
    icon: Box,
  },
];

export default function FloorPlanStudioPage() {
  const [active, setActive] = useState<ToolId>("floorplanmaker");
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const selected = TOOLS.find((tool) => tool.id === active)!;

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const workspace = document.getElementById("floor-plan-embed-workspace");
    if (!workspace) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await workspace.requestFullscreen();
    } catch {
      // Fullscreen is an optional browser capability; the embedded workspace remains usable.
    }
  };

  return (
    <SidebarProvider>
      <SEO
        title="Floor Plan & 3D Design Studio — CivilOS AI"
        description="Use floor planning and 3D design tools inside the CivilOS AI workspace."
      />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold md:text-base">Floor Plan & 3D Design Studio</h1>
              <p className="hidden text-[10px] text-muted-foreground sm:block">External tools embedded inside your CivilOS AI workspace</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden border-emerald-500/40 text-emerald-600 sm:inline-flex">
                <ShieldCheck className="mr-1 h-3 w-3" /> Embedded mode
              </Badge>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex flex-1 flex-col gap-3 p-3 md:p-5">
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Choose a design workspace</h2>
                <p className="text-xs text-muted-foreground">Switch tools without leaving the CivilOS AI app.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Button
                      key={tool.id}
                      size="sm"
                      variant={active === tool.id ? "default" : "outline"}
                      onClick={() => { setActive(tool.id); setReloadKey((key) => key + 1); }}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tool.name}</span>
                    </Button>
                  );
                })}
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selected.name}</p>
                  <p className="text-[11px] text-muted-foreground">{selected.subtitle}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Reload embedded tool" onClick={() => setReloadKey((key) => key + 1)}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={toggleFullscreen} className="gap-2">
                  <Maximize2 className="h-4 w-4" /> <span className="hidden sm:inline">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
                </Button>
              </div>

              <div id="floor-plan-embed-workspace" className="relative min-h-[68vh] flex-1 bg-muted/20">
                <iframe
                  key={active + "-" + reloadKey}
                  title={selected.name}
                  src={selected.url}
                  className="absolute inset-0 h-full min-h-[68vh] w-full border-0 bg-background"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals"
                  allow="fullscreen; clipboard-read; clipboard-write"
                />
              </div>
            </section>

            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                These are third-party tools displayed in an embedded frame. A provider may block embedding through its security policy, or some features may require its own account or paid plan. If a workspace stays blank or incomplete, it cannot be fixed from CivilOS AI alone; no external tab or browser will be opened automatically.
              </p>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
