import { parseDxfToModel } from "./dxf";
import { sampleDxf } from "./fixtures";
import type { Balcony, Opening } from "./types";

/**
 * Offline architectural showcase model. It is deliberately marked as a demo:
 * the extra façade openings and balconies are illustrative and are not taken
 * from a user's uploaded drawing or suitable for construction documentation.
 */
export function demoModel() {
  const m = parseDxfToModel(sampleDxf(6, 1), { name: "Contemporary office showcase", floors: 3 }).model;
  const tracked = (id: string) => ({
    id, confidence: 0.98, source: "user" as const, basis: "user" as const, verified: true,
  });

  // Add a few well-spaced façade windows so the sample reads as a multi-storey
  // architectural model from all sides. These are demo-only visual details.
  const extraWindows: Opening[] = [
    { ...tracked("demo-window-back-left"), c: { x: 2.5, y: 8 }, width: 1.35, height: 1.25, sill: 0.9, floor: "all" },
    { ...tracked("demo-window-back-right"), c: { x: 7.5, y: 8 }, width: 1.35, height: 1.25, sill: 0.9, floor: "all" },
    { ...tracked("demo-window-left"), c: { x: 0, y: 4.2 }, width: 1.25, height: 1.25, sill: 0.9, floor: "all" },
  ];
  const existing = m.windows.filter((w) =>
    !extraWindows.some((x) => Math.hypot(x.c.x - w.c.x, x.c.y - w.c.y) < 0.75)
  );
  m.windows = [...existing, ...extraWindows];

  // Recessed-looking projecting balconies on upper storeys create a clearer
  // silhouette in the sample viewer. They are illustrative, not source-plan data.
  const balconies: Balcony[] = [1, 2].map((floor) => ({
    ...tracked(`demo-balcony-${floor}`),
    c: { x: 7.5, y: -0.72 }, w: 2.8, d: 1.35, rotation: 0, floor,
  }));
  m.balconies = [...m.balconies, ...balconies];
  m.assumptions.push(
    "DEMO: built-in sample only; it is not your uploaded drawing.",
    "DEMO: added façade windows and upper-floor balconies are illustrative visual details, not measured source geometry.",
    "DEMO: dimensions, structure, openings, and materials must not be used for construction without a verified drawing and engineering review."
  );
  return {
    ...m,
    name: "Contemporary office showcase",
    walls: m.walls.map((w) => ({ ...w, verified: true })),
    conceptual: true,
  };
}
