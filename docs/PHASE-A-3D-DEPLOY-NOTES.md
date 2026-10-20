# 3D Construction Visualization — Phase A deploy notes

Branch: `feat/3d-construction-viz` (stacked on `fix/security-money-rls`). Nothing here has been applied to a live project.

## Order
1. Review + apply `supabase/migrations/20261020140000_construction_visualization.sql` (staging first).
   Creates: `app_settings` (`viz.max_file_mb`=25, `viz.max_files`=10 — admin editable), 6 tables, RLS, private bucket `visualization-files`, helpers.
2. Deploy edge function: `supabase functions deploy viz-analyze` (verify_jwt = true in `config.toml`). Needs the existing `LOVABLE_API_KEY` secret.
3. Deploy the frontend. `package.json` gained `pdfjs-dist` — run `npm install` to refresh the lockfile(s) (`package-lock.json`/`bun.lock` were already out of sync and are NOT modified here).

## Verified here
- 41 Vitest tests (units, DXF, model, geometry, normalisation, workflow, edits, upload validation).
- 10 PGlite tests for the migration's RLS/storage policies (+19 earlier security tests).
- UI journey against an in-memory MOCK backend (create → upload validation → analyze (fail+retry) → calibrate → verify/edit → confirm → 3D → reopen; DXF path; mobile sheet).

## NOT verified (needs your environment)
- Real RLS/storage on Supabase, the `viz-analyze` function (Deno; not type-checked or run here) and real Gemini output quality.
- PDF rasterisation with real PDFs (code path only).

## Known limits
- Footprint = convex hull of walls (L-shapes are over-filled and flagged); stair voids are not cut from slabs.
- "Explain this model" is rule-based (restates model data), not a generative AI call.
- Not in Phase A: construction-stage simulation, PDF report, video export, environment presets.
