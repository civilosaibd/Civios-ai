import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary.tsx";
import "./index.css";
import { registerCivilOsPwa } from "./lib/registerPwa";

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Application root was not found");

createRoot(rootElement).render(
  <HelmetProvider>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </HelmetProvider>
);

const finishBoot = () => window.dispatchEvent(new Event("civilos:ready"));
if (document.documentElement.classList.contains("civilos-seen")) {
  requestAnimationFrame(() => requestAnimationFrame(finishBoot));
} else {
  // Let the one-time 360° brand intro finish while React mounts behind it.
  window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(finishBoot)), 1750);
}

void registerCivilOsPwa();

// Firebase Analytics (production only)
import("./lib/firebase").then((m) => void m.initFirebaseAnalytics());
