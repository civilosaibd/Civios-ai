import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { Building2, Box, Maximize2, Minimize2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type ToolId = "floorplanmaker" | "floorplandrawer";

const TOOLS: { id: ToolId; name: string; subtitle: string; url: string; icon: typeof Building2 }[] = [
  {
    id: "floorplanmaker",
    name: "Automatic Floor Plan Generator",
    subtitle: "AI-assisted floor plan creation",
    url: "https://www.floorplanmaker.app/free-floor-plan-maker",
    icon: Building2,
  },
  {
    id: "floorplandrawer",
    name: "3D Designer",
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
    const onFullscreenChange = () => {
      const workspace = document.getElementById("floor-plan-design-workspace");
      setIsFullscreen(Boolean(workspace && document.fullscreenElement === workspace));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const workspace = document.getElementById("floor-plan-design-workspace");
    if (!workspace) return;

    try {
      if (document.fullscreenElement === workspace) {
        await document.exitFullscreen();
        return;
      }

      if (!document.fullscreenEnabled || typeof workspace.requestFullscreen !== "function") {
        toast.error("Full screen is not supported by this browser.");
        return;
      }

      await workspace.requestFullscreen();
    } catch {
      toast.error("Unable to enter full screen. Please try again or check browser permissions.");
    }
  };

  return (
    <SidebarProvider>
      <SEO
        title="Floor Plan & 3D Design Studio — CivilOS AI"
        description="Create floor plans and explore 3D designs inside the CivilOS AI workspace."
      />
      <div className="flex h-dvh min-h-[560px] w-full overflow-hidden bg-background">
        <DashboardSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold md:text-base">Floor Plan & 3D Design Studio</h1>
              <p className="hidden text-[10px] text-muted-foreground sm:block">Plan, design and visualize your building</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden border-emerald-500/40 text-emerald-600 sm:inline-flex">
                <ShieldCheck className="mr-1 h-3 w-3" /> Workspace
              </Badge>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 md:gap-3 md:p-3">
            <section className="flex shrink-0 flex-col gap-2 rounded-xl border bg-card px-3 py-2 md:flex-row md:items-center md:justify-between md:px-4 md:py-2.5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Choose your design tool</h2>
                <p className="text-[11px] text-muted-foreground">Select one workspace to get started.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Button
                      key={tool.id}
                      size="sm"
                      variant={active === tool.id ? "default" : "outline"}
                      onClick={() => {
                        if (active !== tool.id) {
                          setActive(tool.id);
                          setReloadKey((key) => key + 1);
                        }
                      }}
                      className="h-9 gap-2"
                      aria-pressed={active === tool.id}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tool.name}</span>
                    </Button>
                  );
                })}
              </div>
            </section>

            <section
              id="floor-plan-design-workspace"
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-background"
            >
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selected.name}</p>
                  <p className="text-[11px] text-muted-foreground">{selected.subtitle}</p>
                </div>

                <div
                  className="flex min-w-0 items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground"
                  role="note"
                  aria-label="Drawing workspace tip"
                >
                  <Maximize2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="leading-tight">Drawing করার সুবিধার্থে Full Screen করে নিন</span>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Reload design tool"
                    title="Reload design tool"
                    onClick={() => setReloadKey((key) => key + 1)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={isFullscreen ? "default" : "outline"}
                    onClick={toggleFullscreen}
                    className="gap-2"
                    aria-label={isFullscreen ? "Exit full screen" : "Enter full screen for drawing"}
                    aria-pressed={isFullscreen}
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    <span>{isFullscreen ? "Exit Full Screen" : "Full Screen"}</span>
                  </Button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 bg-muted/20">
                <iframe
                  key={active + "-" + reloadKey}
                  title={selected.name}
                  src={selected.url}
                  className="absolute inset-0 h-full w-full border-0 bg-background"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals"
                  allow="fullscreen; clipboard-read; clipboard-write"
                />
              </div>
            </section>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
