import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Bot,
  FileSearch,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import FloatingAssistantChat from "@/components/FloatingAssistantChat";
import { useI18n } from "@/lib/i18n";

/** Pages where the launcher would be redundant or cover a focused workspace. */
const HIDDEN_PREFIXES = [
  "/auth",
  "/register",
  "/ai-assistant",
  "/ai-engineer",
  "/agent",
  "/admin",
  "/visualizations",
  "/upload",
  "/billing",
];

export const showFloatingAssistant = (pathname: string, signedIn: boolean) =>
  signedIn &&
  pathname !== "/" &&
  !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));

const shortcuts = [
  {
    to: "/ai-engineer",
    icon: Bot,
    title: "Engineering Assistant",
    description: "Ask technical and construction questions",
    tone: "from-blue-500 to-violet-500",
  },
  {
    to: "/agent",
    icon: Workflow,
    title: "AI Agent",
    description: "Work with your CivilOS workspace",
    tone: "from-cyan-500 to-blue-500",
  },
  {
    to: "/file-assistant",
    icon: FileSearch,
    title: "Analyze a Drawing",
    description: "Review plans and project documents",
    tone: "from-orange-500 to-rose-500",
  },
];

/** Premium global launcher for the existing CivilOS AI engineering assistant. */
export default function FloatingAssistant() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const isBangla = lang === "bn";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!showFloatingAssistant(pathname, !!user)) return null;

  return (
    <div
      className="print:hidden fixed right-4 z-[70] flex flex-col items-end gap-3 sm:right-6"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      data-testid="floating-assistant"
    >
      <AnimatePresence>
        {open && (
          <motion.section
            id="civilos-floating-assistant-panel"
            role="dialog"
            aria-label={isBangla ? "CivilOS AI সহকারী" : "CivilOS AI assistant"}
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[1.4rem] border border-white/15 bg-slate-950/95 text-white shadow-[0_24px_80px_-18px_rgba(2,6,23,0.8)] ring-1 ring-cyan-300/20 backdrop-blur-2xl"
          >
            <div className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,.42),transparent_42%),radial-gradient(circle_at_100%_20%,rgba(168,85,247,.34),transparent_40%),linear-gradient(135deg,#07152f,#11102c_58%,#24113b)] p-4">
              <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full border border-cyan-200/20 shadow-[0_0_55px_rgba(34,211,238,.18)]" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-[0_0_28px_rgba(59,130,246,.35)]">
                    <div className="absolute inset-1 rounded-xl bg-gradient-to-br from-cyan-300/20 via-blue-500/20 to-fuchsia-500/30" />
                    <Sparkles className="relative h-6 w-6 text-cyan-100" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200/80">CivilOS AI</p>
                    <h2 className="mt-0.5 text-base font-bold tracking-tight">
                      {isBangla ? "আপনার AI ইঞ্জিনিয়ারিং সহকারী" : "Your AI Engineering Assistant"}
                    </h2>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.9)]" />
                      {isBangla ? "সরাসরি AI চ্যাট" : "Live AI chat"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={isBangla ? "বন্ধ করুন" : "Close assistant"}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="relative mt-4 max-w-[19rem] text-xs leading-relaxed text-slate-200/80">
                {isBangla
                  ? "বাংলা বা ইংরেজিতে প্রশ্ন করুন — CivilOS AI উত্তর দেবে।"
                  : "Ask in Bangla or English — CivilOS AI will help you."}
              </p>
            </div>

            <FloatingAssistantChat userId={user?.id ?? "guest"} isBangla={isBangla} />
            <div className="flex items-center gap-1 border-t border-white/[0.08] px-3 py-2">
              {shortcuts.map(({ to, icon: Icon, title }) => (
                <Link key={to} to={to} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[9px] text-slate-400 transition hover:bg-white/[0.07] hover:text-cyan-200">
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{isBangla ? (to === "/ai-engineer" ? "ইঞ্জিনিয়ার" : to === "/agent" ? "এজেন্ট" : "ড্রয়িং") : title === "Engineering Assistant" ? "Engineer" : title === "Analyze a Drawing" ? "Drawing" : "Agent"}</span>
                </Link>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-2.5 text-[9px] text-slate-500">
              <span>Built for better engineering decisions</span>
              <span className="font-semibold tracking-wider text-cyan-200/70">CIVILOS</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="relative">
        {!open && (
          <>
            <span className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-r from-cyan-400/25 via-blue-500/25 to-fuchsia-500/25 blur-xl" />
            <span className="pointer-events-none absolute -inset-1 rounded-full border border-cyan-200/35 animate-ping [animation-duration:3.2s]" />
          </>
        )}
        <button
          type="button"
          aria-label={isBangla ? "CivilOS AI সহকারী খুলুন" : "Open CivilOS AI assistant"}
          aria-expanded={open}
          aria-controls="civilos-floating-assistant-panel"
          onClick={() => setOpen((value) => !value)}
          className="group relative flex h-[3.75rem] items-center gap-2 overflow-hidden rounded-full border border-white/35 bg-[linear-gradient(135deg,#06b6d4_0%,#2563eb_42%,#7c3aed_76%,#ec4899_100%)] px-3.5 text-white shadow-[0_12px_38px_-8px_rgba(37,99,235,.75)] transition duration-300 hover:-translate-y-1 hover:scale-[1.035] hover:shadow-[0_18px_48px_-8px_rgba(124,58,237,.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="pointer-events-none absolute inset-[1px] rounded-full bg-[linear-gradient(145deg,rgba(255,255,255,.28),transparent_45%,rgba(2,6,23,.18))]" />
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/30 bg-white/15 shadow-inner backdrop-blur-md">
            <span className="absolute inset-0 rounded-full bg-white/10 animate-pulse" />
            {open ? <X className="relative h-5 w-5" /> : <Bot className="relative h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />}
          </span>
          <span className="relative pr-1 text-left leading-tight">
            <span className="block text-[9px] font-semibold uppercase tracking-[.18em] text-white/75">CivilOS AI</span>
            <span className="block text-xs font-bold">{isBangla ? "AI সহকারী" : "Ask AI"}</span>
          </span>
          <span className="relative mr-0.5 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.95)]" />
        </button>
      </div>
    </div>
  );
}
