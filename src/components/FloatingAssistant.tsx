import { Link, useLocation } from "react-router-dom";
import { Bot } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/** pages where the button would be redundant or would cover a working surface */
const HIDDEN_PREFIXES = ["/auth", "/register", "/ai-assistant", "/ai-engineer", "/agent", "/admin", "/visualizations", "/upload", "/billing"];
export const showFloatingAssistant = (pathname: string, signedIn: boolean) =>
  signedIn && pathname !== "/" && !HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

/** One-tap shortcut to the AI assistant from any signed-in page (the assistant itself needs login and uses the existing /ai-assistant page). */
export default function FloatingAssistant() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { lang } = useI18n();
  if (!showFloatingAssistant(pathname, !!user)) return null;
  const label = lang === "bn" ? "AI সহকারী" : "AI Assistant";
  return (
    <Link
      to="/ai-assistant"
      aria-label={label}
      title={label}
      data-testid="floating-assistant"
      className="fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 print:hidden md:h-14 md:w-14"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Bot className="h-6 w-6" />
    </Link>
  );
}
