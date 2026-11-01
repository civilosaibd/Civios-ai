import { useEffect, useState } from "react";

export const ACTIVE_PROJECT_STORAGE_KEY = "civilos.activeProjectId";
export const ACTIVE_PROJECT_CHANGE_EVENT = "civilos:project-change";

/** URL selection wins; the last selected project is retained for module-to-module navigation. */
export function getActiveProjectId() {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("project");
  if (fromUrl) return fromUrl;
  return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || null;
}

/** Reactive active project selection shared by all modules with the workspace selector. */
export function useActiveProjectId() {
  const [projectId, setProjectId] = useState<string | null>(() => getActiveProjectId());
  useEffect(() => {
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<string | null> | undefined)?.detail;
      setProjectId(detail === undefined ? getActiveProjectId() : detail);
    };
    window.addEventListener(ACTIVE_PROJECT_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(ACTIVE_PROJECT_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  return projectId;
}
