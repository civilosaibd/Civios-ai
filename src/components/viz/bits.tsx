import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { confidenceLabel, type ConfidenceLabel } from "@/lib/viz/types";
import { useI18n } from "@/lib/i18n";

export const useL = () => { const { lang } = useI18n(); return (en: string, bn: string) => (lang === "bn" ? bn : en); };

const STYLE: Record<ConfidenceLabel, string> = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  low: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
};

export function ConfidenceBadge({ value, className = "" }: { value: number; className?: string }) {
  const L = useL();
  const l = confidenceLabel(value);
  const t = { high: L("High", "উচ্চ"), medium: L("Medium", "মাঝারি"), low: L("Low", "কম") }[l];
  return <Badge variant="outline" className={`${STYLE[l]} ${className}`} title={`${Math.round(value * 100)}%`}>{t} · {Math.round(value * 100)}%</Badge>;
}

/** Small, non-intrusive AI disclaimer (always visible, never a blocking modal). */
export function Disclaimer({ conceptual }: { conceptual?: boolean }) {
  const L = useL();
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
      <Info className="h-3.5 w-3.5 mt-px shrink-0" />
      <span>
        {conceptual && <b className="text-foreground">{L("Conceptual 3D Reconstruction. ", "কনসেপ্টুয়াল ৩ডি পুনর্গঠন। ")}</b>}
        {L("AI-assisted visualization, not a structural design or construction drawing. Dimensions marked “estimated” are AI/default assumptions — verify with a licensed engineer.", "এটি AI-সহায়তায় তৈরি ভিজ্যুয়ালাইজেশন, স্ট্রাকচারাল ডিজাইন বা কনস্ট্রাকশন ড্রয়িং নয়। “estimated” চিহ্নিত মাপ AI/ডিফল্ট অনুমান — লাইসেন্সপ্রাপ্ত ইঞ্জিনিয়ারকে দিয়ে যাচাই করুন।")}
      </span>
    </p>
  );
}

export function Warn({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"><AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" /><div>{children}</div></div>;
}
