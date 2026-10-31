export const ACTIVE_PROJECT_STORAGE_KEY = "civilos.activeProjectId";

/** URL selection wins; the last selected project is retained for module-to-module navigation. */
export function getActiveProjectId() {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("project");
  if (fromUrl) return fromUrl;
  return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || null;
}
