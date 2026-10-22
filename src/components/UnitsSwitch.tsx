import { useUnits } from "@/lib/UnitsContext";
import { useI18n } from "@/lib/i18n";
import type { UnitSystem } from "@/lib/units";

/** Small two-way switch: Feet (imperial) / Metre (metric). */
export default function UnitsSwitch({ className = "" }: { className?: string }) {
  const { system, setSystem } = useUnits();
  const { lang } = useI18n();
  const bn = lang === "bn";
  const opts: { v: UnitSystem; label: string }[] = [
    { v: "imperial", label: bn ? "ফুট" : "Feet" },
    { v: "metric", label: bn ? "মিটার" : "Metric" },
  ];
  return (
    <div role="group" aria-label={bn ? "একক পদ্ধতি" : "Unit system"} data-testid="units-switch" className={`inline-flex rounded-md border p-0.5 text-xs ${className}`}>
      {opts.map((o) => (
        <button key={o.v} type="button" aria-pressed={system === o.v} onClick={() => setSystem(o.v)}
          className={`rounded px-2 py-1 transition-colors ${system === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
