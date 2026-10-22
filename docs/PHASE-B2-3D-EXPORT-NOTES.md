# 3D Phase B2 — PDF report, video export, accurate OBJ/STL/GLB exports

Frontend only. No database or edge-function change.

* **PDF report** (`src/lib/viz/report.ts`): summary (floors, size, areas, counts), scale basis, illustrative stage table with real element counts, low-confidence items, every assumption (marked estimated), warnings, disclaimer, a snapshot of the current 3D view. Built from the verified model only; no quantities are invented and it is NOT a BOQ. Latin text only (built-in PDF fonts): Bengali characters print as "?".
* **Video** (Viewer3D → Export menu): records the canvas with the browser's MediaRecorder while the 8-stage sequence plays once (MP4 when the browser supports it, otherwise WebM). Cancel button; stops after a 1.2 s hold on the final frame. Needs a desktop Chrome/Edge/Firefox; Safari/old browsers show a clear "not supported" message.
* **Export fix** (`src/lib/viz/exportScene.ts`): OBJ and STL used to export hidden layers too (three's exporters ignore `visible`). GLB/OBJ/STL now export exactly what is shown (layers, floor isolation, exploded position, construction stage). Surroundings are never exported.
* Duplicate and rename already existed (list page and workspace); unchanged.

Tests: vitest `report.test.ts` (8) + browser check on the demo (7/7: PDF, OBJ with/without walls, video record + cancel). Video decoded with OpenCV: 555 frames, ≈35 s, 3 sampled frames show the stages building up.
Not verified: Safari, long recording on a low-end phone, video of a real uploaded model, Bengali PDF text.
