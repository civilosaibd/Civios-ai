import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_UNIT_SYSTEM, UNITS_STORAGE_KEY, isUnitSystem, type UnitSystem } from "./units";

interface Ctx { system: UnitSystem; setSystem: (s: UnitSystem) => void }
const UnitsContext = createContext<Ctx>({ system: DEFAULT_UNIT_SYSTEM, setSystem: () => {} });

const read = (): UnitSystem => {
  try { const v = localStorage.getItem(UNITS_STORAGE_KEY); return isUnitSystem(v) ? v : DEFAULT_UNIT_SYSTEM; } catch { return DEFAULT_UNIT_SYSTEM; }
};

/** Device-level preference (like language/theme): metric or imperial, remembered in this browser. */
export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, set] = useState<UnitSystem>(read);
  const setSystem = useCallback((s: UnitSystem) => {
    if (!isUnitSystem(s)) return;
    set(s);
    try { localStorage.setItem(UNITS_STORAGE_KEY, s); } catch { /* private mode: keep in memory only */ }
  }, []);
  const value = useMemo(() => ({ system, setSystem }), [system, setSystem]);
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUnits = () => useContext(UnitsContext);
