import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUnits } from "@/lib/UnitsContext";
import { displayToFt, ftToDisplay, roundTo } from "@/lib/units";

/**
 * A length field whose value is STORED in feet but typed/shown in the user's unit system.
 * Keeps a text draft so typing is never fought by clamping; the range is applied when the field loses focus.
 */
export default function LengthInput({ label, valueFt, onChangeFt, minFt, maxFt, unitLabel }: {
  label: string; valueFt: number; onChangeFt: (ft: number) => void; minFt: number; maxFt: number; unitLabel: string;
}) {
  const { system } = useUnits();
  const shown = roundTo(ftToDisplay(valueFt, system), 3);
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => { if (Number(draft) !== shown) setDraft(String(shown)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shown, system]);
  const toFt = (n: number) => roundTo(displayToFt(n, system), 4);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label} ({unitLabel})</Label>
      <Input type="number" inputMode="decimal" step="any" value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) { const ft = toFt(n); if (ft >= minFt && ft <= maxFt) onChangeFt(ft); }
        }}
        onBlur={() => {
          const n = Number(draft);
          const ft = Math.min(maxFt, Math.max(minFt, draft.trim() !== "" && Number.isFinite(n) ? toFt(n) : minFt));
          onChangeFt(ft); setDraft(String(roundTo(ftToDisplay(ft, system), 3)));
        }} />
    </div>
  );
}
