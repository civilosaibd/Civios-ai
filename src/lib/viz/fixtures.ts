// Test fixtures (not imported by app code)
// ---- DXF fixture: 10 m × 8 m building, 4 columns, 1 door, 2 windows, 1 partition, labels --------
const dx = (pairs: (string | number)[]) => pairs.join("\n") + "\n";
export function sampleDxf(insunits: number | null = 6, k = 1) {
  const head = insunits === null ? [] : [9, "$INSUNITS", 70, insunits];
  const lw = (layer: string, pts: [number, number][], closed: boolean) =>
    [0, "LWPOLYLINE", 8, layer, 90, pts.length, 70, closed ? 1 : 0, ...pts.flatMap(([x, y]) => [10, x * k, 20, y * k])];
  const line = (layer: string, a: [number, number], b: [number, number]) => [0, "LINE", 8, layer, 10, a[0] * k, 20, a[1] * k, 11, b[0] * k, 21, b[1] * k];
  const txt = (s: string, x: number, y: number) => [0, "TEXT", 8, "TEXT", 10, x * k, 20, y * k, 1, s];
  const sq = (layer: string, cx: number, cy: number, s: number) => lw(layer, [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]], true);
  return dx([
    0, "SECTION", 2, "HEADER", ...head, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES",
    ...lw("A-WALL", [[0, 0], [10, 0], [10, 8], [0, 8]], true),
    ...line("A-WALL", [5, 0], [5, 8]),
    ...sq("A-COLUMN", 0, 0, 0.3), ...sq("A-COLUMN", 10, 0, 0.3), ...sq("A-COLUMN", 10, 8, 0.3), ...sq("A-COLUMN", 0, 8, 0.3),
    ...lw("A-DOOR", [[2, 0], [2.9, 0]], false), ...lw("A-WINDOW", [[7, 0], [8.2, 0]], false), ...lw("A-WINDOW", [[10, 4], [10, 5.2]], false),
    ...txt("BEDROOM", 2.5, 4), ...txt("LIVING ROOM", 7.5, 4), ...txt("3200", 5, 9),
    ...line("DIMENSIONS", [0, -1], [10, -1]),
    0, "ENDSEC", 0, "EOF",
  ]);
}
