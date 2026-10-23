# 3D Phase B1 — construction-stage simulation + environment presets

Frontend only. No database change, no edge function change.

* `src/lib/viz/stages.ts` — 8 stages (site, foundation, columns, beams & slabs, walls, doors/windows/stairs, roof, completed). Pure visibility rules; walls/columns/slabs rise floor by floor.
* `src/lib/viz/environment.ts` — Minimal / Residential / Urban / Commercial / Custom surroundings, seeded and deterministic, never overlapping the building.
* `StagePlayer.tsx` (play/pause, prev/next, 0.5×/1×/2×, scrub, stage buttons, cinematic orbit camera), `Surroundings.tsx`, `EnvironmentPanel.tsx`; wired into `Viewer3D.tsx`.

Honesty rules kept: the sequence is ILLUSTRATIVE (no durations, costs or % progress; the label shows "n of m model elements"); surroundings are generic placeholders, not the real site and not part of GLB/OBJ/STL exports.

Tests: vitest `stages.test.ts` (14) + mocked-backend browser check (9/9, demo route, desktop + 390 px). Not verified: real-device performance, a real uploaded model.
Also fixed: horizontal overflow of the viewer on small screens (grid `minmax(0,1fr)`).
Not in B1: PDF report, MP4/WebM video, duplicate/rename, OBJ/STL respecting the current stage.
