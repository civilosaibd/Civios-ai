import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const projectId = env.VITE_SUPABASE_PROJECT_ID?.trim();

  const missing = [
    ["VITE_SUPABASE_URL", supabaseUrl],
    ["VITE_SUPABASE_PUBLISHABLE_KEY", publishableKey],
    ["VITE_SUPABASE_PROJECT_ID", projectId],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing required Supabase build configuration: ${missing.join(", ")}. Set these variables in your local .env or deployment environment; the build no longer falls back to a different Supabase project.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl!);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be a valid absolute URL.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error("VITE_SUPABASE_URL must use HTTPS outside local development.");
  }
  if (parsedUrl.hostname.endsWith(".supabase.co")) {
    const urlProjectId = parsedUrl.hostname.split(".")[0];
    if (urlProjectId !== projectId) {
      throw new Error(`Supabase project mismatch: VITE_SUPABASE_PROJECT_ID="${projectId}" does not match VITE_SUPABASE_URL host "${urlProjectId}".`);
    }
  }

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",
      filename: "sw.js",
      injectRegister: null,
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "civilos-pages", networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && ["script", "style", "image", "font"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "civilos-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publishableKey),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(projectId),
  },
  };
});
