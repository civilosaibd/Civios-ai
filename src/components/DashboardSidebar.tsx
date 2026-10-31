import { useEffect, useState } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { ChevronRight, Lock, Wrench, Sparkles, CreditCard, FolderKanban } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth";
import { ACTIVE_PROJECT_STORAGE_KEY, ACTIVE_PROJECT_CHANGE_EVENT } from "@/lib/projectSelection";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/lib/subscription";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  topNav, bottomNav, constructionTools, learningNav, analyticsNav, settingsNav,
  findActiveCategory, type NavCategory,
} from "@/lib/navigation";
import CivilOSLogo from "@/components/CivilOSLogo";
import InstallCivilOS from "@/components/InstallCivilOS";

const isRouteActive = (pathname: string, url: string) =>
  pathname === url || (url !== "/" && pathname.startsWith(`${url}/`));

function CategoryGroup({
  cat, collapsed, pathname, locked,
}: { cat: NavCategory; collapsed: boolean; pathname: string; locked: (f?: string) => boolean }) {
  const active = cat.items.some((i) => isRouteActive(pathname, i.url));
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active && !open} tooltip={cat.label} className="justify-between">
            <span className="flex items-center gap-2 min-w-0">
              <cat.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{cat.label}</span>}
            </span>
            {!collapsed && (
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
            )}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        {!collapsed && (
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <SidebarMenuSub>
              {cat.items.map((item) => (
                <SidebarMenuSubItem key={item.url + item.title}>
                  <SidebarMenuSubButton asChild isActive={isRouteActive(pathname, item.url)}>
                    <NavLink to={item.url} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.title}</span>
                      {locked(item.feature) && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    </NavLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}


type WorkspaceProject = { id: string; name: string; created_at?: string };

export function ProjectWorkspaceSelector({ collapsed = false }: { collapsed?: boolean }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProjects([]); setSelected(""); setLoading(false); return; }
    let active = true;
    setLoading(true);
    supabase.from("projects").select("id,name,created_at").order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error("Could not load workspace projects", error);
        const rows = (data || []) as WorkspaceProject[];
        setProjects(rows);
        const urlProject = searchParams.get("project");
        const storedProject = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
        const candidate = urlProject || storedProject || "";
        const valid = rows.some((project) => project.id === candidate) ? candidate : "";
        setSelected(valid);
        if (valid) window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, valid);
        else window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user, searchParams]);

  const changeProject = (value: string) => {
    const next = value === "__none__" ? "" : value;
    setSelected(next);
    if (next) window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, next);
    else window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("project", next);
    else params.delete("project");
    setSearchParams(params, { replace: true });
    window.dispatchEvent(new CustomEvent(ACTIVE_PROJECT_CHANGE_EVENT, { detail: next || null }));
  };

  if (!user) return null;
  return (
    <div className={collapsed ? "px-1 py-2" : "px-3 py-3"}>
      {!collapsed && <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><FolderKanban className="h-3.5 w-3.5" /> Active Project</div>}
      <Select value={selected || "__none__"} onValueChange={changeProject} disabled={loading}>
        <SelectTrigger className={collapsed ? "h-9 w-full justify-center px-1" : "h-9 w-full text-xs"} aria-label="Choose active project" title="Choose active project">
          {collapsed ? <FolderKanban className="h-4 w-4" /> : <SelectValue placeholder={loading ? "Loading projects…" : "Select project"} />}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Personal / No project</SelectItem>
          {projects.map((project, index) => <SelectItem key={project.id} value={project.id}>Project #{index + 1} · {project.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {!collapsed && <p className="mt-1 text-[10px] text-muted-foreground">নতুন কাজ এই প্রজেক্টে সংরক্ষণের জন্য এটি নির্বাচন করুন।</p>}
    </div>
  );
}

export function DashboardSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  // On phones, close the navigation drawer after a route change so the page is usable immediately.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
  const { user } = useAuth();
  const { plan, hasFeature } = useSubscription();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  // Features the user turned off (e.g. via the AI Agent) are hidden from the menu.
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!user) { setHidden([]); return; }
    const URLS: Record<string, string> = { boq: "/boq-hub", cost_estimator: "/upload", rate_analysis: "/rate-analysis", plan_generator: "/plan-generator", bim_studio: "/bim-studio", site_geo: "/site-geo", scheduler: "/scheduler", inventory: "/inventory", tender: "/tender", ai_writer: "/ai-writer", analytics: "/analytics" };
    supabase.from("user_feature_settings").select("feature_key").eq("user_id", user.id).eq("enabled", false)
      .then(({ data }) => setHidden((data || []).map((r) => URLS[r.feature_key]).filter(Boolean)));
  }, [user, pathname]);
  const visibleTools = constructionTools.map((c) => ({ ...c, items: c.items.filter((i) => !hidden.includes(i.url)) })).filter((c) => c.items.length);

  const locked = (feature?: string) => !!feature && !hasFeature(feature);
  const toolsActive = findActiveCategory(pathname) !== null;
  const [toolsOpen, setToolsOpen] = useState(toolsActive);
  useEffect(() => { if (toolsActive) setToolsOpen(true); }, [toolsActive]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <CivilOSLogo variant="icon" size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-bold leading-tight truncate">CivilOS AI</p>
              <p className="text-[10px] text-muted-foreground leading-tight truncate">
                The AI Operating System for Civil Engineers
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ProjectWorkspaceSelector collapsed={collapsed} />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topNav.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                    <NavLink to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">Workspace</SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible open={collapsed ? true : toolsOpen} onOpenChange={setToolsOpen}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Construction Tools" className="justify-between font-medium">
                      <span className="flex items-center gap-2 min-w-0">
                        <Wrench className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">Construction Tools</span>}
                      </span>
                      {!collapsed && (
                        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${toolsOpen ? "rotate-90" : ""}`} />
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <SidebarMenu className={collapsed ? "" : "ml-2 border-l pl-1"}>
                      {visibleTools.map((cat) => (
                        <CategoryGroup key={cat.label} cat={cat} collapsed={collapsed} pathname={pathname} locked={locked} />
                      ))}
                    </SidebarMenu>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <CategoryGroup cat={learningNav} collapsed={collapsed} pathname={pathname} locked={locked} />

              <CategoryGroup cat={analyticsNav} collapsed={collapsed} pathname={pathname} locked={locked} />

              {bottomNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                    <NavLink to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <CategoryGroup
                cat={{ ...settingsNav, items: settingsNav.items.filter((i) => !i.adminOnly || isAdmin) }}
                collapsed={collapsed} pathname={pathname} locked={locked}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && (
          <div className="p-3 mt-auto">
            <div className="space-y-2">
            <InstallCivilOS triggerOnly />
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-accent" /> {plan?.name || "Free"} plan
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Unlock AI Drawing, AI Writer, analytics & team seats.
              </p>
              <NavLink to="/billing" className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline">
                <CreditCard className="h-3 w-3" /> Plans &amp; Billing
              </NavLink>
            </div>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
