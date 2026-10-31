import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, FileSearch, Sparkles, Workflow, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import FloatingAssistantChat from "@/components/FloatingAssistantChat";
import { useI18n } from "@/lib/i18n";

const HIDDEN_PREFIXES = [
  "/auth", "/register", "/ai-assistant", "/ai-engineer", "/agent",
  "/admin", "/visualizations", "/upload", "/billing",
];
const POSITION_KEY = "civilos-floating-assistant-position";

export const showFloatingAssistant = (pathname: string, signedIn: boolean) =>
  signedIn && pathname !== "/" &&
  !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));

const shortcuts = [
  { to: "/ai-engineer", icon: Bot, title: "Engineering Assistant" },
  { to: "/agent", icon: Workflow, title: "AI Agent" },
  { to: "/file-assistant", icon: FileSearch, title: "Analyze a Drawing" },
];

type Position = { left: number; top: number };
type DragState = { pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean };

export default function FloatingAssistant() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return Number.isFinite(parsed.left) && Number.isFinite(parsed.top)
        ? { left: parsed.left, top: parsed.top }
        : null;
    } catch { return null; }
  });
  const dragRef = useRef<DragState | null>(null);
  const reduceMotion = useReducedMotion();
  const isBangla = lang === "bn";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!position) return;
    const clampPosition = () => {
      setPosition((current) => current ? ({
        left: Math.max(8, Math.min(current.left, window.innerWidth - 58)),
        top: Math.max(8, Math.min(current.top, window.innerHeight - 58)),
      }) : null);
    };
    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, [position]);

  if (!showFloatingAssistant(pathname, !!user)) return null;

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const left = Math.max(8, Math.min(drag.left + dx, window.innerWidth - 58));
    const top = Math.max(8, Math.min(drag.top + dy, window.innerHeight - 58));
    setPosition({ left, top });
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      const next = {
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 58)),
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 58)),
      };
      setPosition(next);
      localStorage.setItem(POSITION_KEY, JSON.stringify(next));
    } else {
      setOpen((value) => !value);
    }
    dragRef.current = null;
  };

  const customPosition = !!position;
  const panelBelow = customPosition && position.top < window.innerHeight / 2;
  const alignLeft = customPosition && position.left < window.innerWidth / 2;

  return (
    <div
      className={`print:hidden fixed z-[70] flex ${panelBelow ? "flex-col-reverse" : "flex-col"} ${alignLeft ? "items-start" : "items-end"} gap-2`}
      style={position
        ? { left: position.left, top: position.top }
        : { right: 12, bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      data-testid="floating-assistant"
    >
      <AnimatePresence>
        {open && (
          <motion.section
            id="civilos-floating-assistant-panel"
            role="dialog"
            aria-label={isBangla ? "CivilOS AI সহকারী" : "CivilOS AI assistant"}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-[min(21rem,calc(100vw-1.25rem))] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 text-white shadow-[0_20px_65px_-18px_rgba(2,6,23,.8)] ring-1 ring-cyan-300/20 backdrop-blur-2xl"
          >
            <div className="relative border-b border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,.35),transparent_42%),linear-gradient(135deg,#07152f,#17132e)] px-3 py-2.5">
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10">
                    <Sparkles className="h-4 w-4 text-cyan-100" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[.18em] text-cyan-200/80">CivilOS AI</p>
                    <h2 className="truncate text-xs font-bold">{isBangla ? "AI ইঞ্জিনিয়ারিং সহকারী" : "Engineering Assistant"}</h2>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label={isBangla ? "বন্ধ করুন" : "Close assistant"} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <FloatingAssistantChat userId={user?.id ?? "guest"} isBangla={isBangla} />

            <div className="flex items-center gap-1 border-t border-white/[0.08] px-2 py-1.5">
              {shortcuts.map(({ to, icon: Icon, title }) => (
                <Link key={to} to={to} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[9px] text-slate-400 transition hover:bg-white/[0.07] hover:text-cyan-200">
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{isBangla ? (to === "/ai-engineer" ? "ইঞ্জিনিয়ার" : to === "/agent" ? "এজেন্ট" : "ড্রয়িং") : title === "Engineering Assistant" ? "Engineer" : title === "Analyze a Drawing" ? "Drawing" : "Agent"}</span>
                </Link>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-label={isBangla ? "CivilOS AI খুলুন; টেনে সরানো যাবে" : "Open CivilOS AI; drag to move"}
        aria-expanded={open}
        aria-controls="civilos-floating-assistant-panel"
        title={isBangla ? "ধরে টেনে সরান" : "Drag to move"}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        className="group relative grid h-12 w-12 touch-none place-items-center rounded-full border border-white/35 bg-[linear-gradient(135deg,#06b6d4_0%,#2563eb_52%,#7c3aed_100%)] text-white shadow-[0_8px_28px_-8px_rgba(37,99,235,.75)] transition duration-200 hover:scale-105 hover:shadow-[0_12px_34px_-8px_rgba(124,58,237,.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="pointer-events-none absolute inset-[2px] rounded-full bg-[linear-gradient(145deg,rgba(255,255,255,.25),transparent_50%,rgba(2,6,23,.16))]" />
        {open ? <X className="relative h-5 w-5" /> : <Bot className="relative h-5 w-5 transition-transform group-hover:scale-110" />}
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
      </button>
    </div>
  );
}
