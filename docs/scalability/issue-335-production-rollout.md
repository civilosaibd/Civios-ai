# Issue #335 — production rollout checklist

Status of the repository side, verified on 2026-11-05 against `main`.
Everything in the first section is already in the code. Everything in the
second section happens **outside** the repository (Supabase dashboard /
CLI, by a person with production access) and is **not** done by merging
any pull request.

## 1. Already fixed in the repository

- **Workspace table migration exists:**
  `supabase/migrations/20261103120000_create_user_workspace.sql` creates
  `public.user_workspace` with the `(user_id, key)` primary key, RLS
  enabled, `REVOKE ALL ... FROM anon`, and four owner-only policies
  (`(select auth.uid()) = user_id`).
  It intentionally matches the Drizzle baseline
  (`drizzle/migrations/0000_migration.sql`). Note: neither the baseline
  nor this migration adds a foreign key to `auth.users`, although the
  issue text mentioned one. Adding an FK is a separate, deliberate
  migration — do not edit this migration in place.
- **Client sync resilience is merged:** PR #334
  (cloud workspace sync failure handling) and PR #333
  (scalability readiness plan) were merged on 2026-11-03.
  `src/lib/cloudState.ts` keeps local data, never reports a failed sync
  as synced, and retries with bounded backoff.
- **Database-level tests exist:** `supabase/tests/security.test.mjs`
  covers `user_workspace` owner-only CRUD, anon having no privileges,
  RLS being enabled, and all four owner policies existing. CI runs this
  file (`.github/workflows/quality-checks.yml`).
- **Edge Function source is the current implementation:** `ai-chat` in
  the repository no longer uses the Lovable gateway; it selects OpenAI
  or OpenRouter from server-side configuration. The 500s in #335 came
  from the *deployed* function (version 11) differing from source, not
  from the source itself.
- **Config coverage:** every function directory under
  `supabase/functions/` has an explicit `[functions.<name>]` section in
  `supabase/config.toml` (guarded by
  `src/lib/workspaceSyncReadiness.test.ts`).

## 2. Production steps still required (in order)

Do these on **staging first**, verify, then repeat on production in a
planned window. Do not start 15K/50K/100K load testing before step 4
passes.

1. **Apply the migration.** `supabase migration list` to confirm
   `20261103120000` is not yet applied, then `supabase db push`.
   Verify afterwards:
   `select to_regclass('public.user_workspace');` must not be `NULL`.
2. **Verify RLS isolation with two authenticated test users.** User A
   can create/read/update/delete only A's rows; user B cannot see or
   modify A's rows; anon has no access. (The PGlite suite covers this
   logic; this step proves it on the real project.)
3. **Check secret *names* exist — never print their values.**
   In the Supabase dashboard (Project Settings → Edge Functions /
   Secrets), confirm these are present for the target project:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (platform-provided), `OPENAI_API_KEY` and/or
   `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` (for `ai-chat` /
   `ai-floorplan`, depending on `AI_PROVIDER`), and `LOVABLE_API_KEY`
   (still used by `ai-analyze`, `ai-structured`, `defect-detect` and
   `viz-analyze`). #335's `LOVABLE_API_KEY not configured` log line is
   resolved by the secret existing **and** by the redeploy in step 4 —
   `ai-chat` itself no longer needs it.
4. **Redeploy the Edge Functions from current source**, at minimum
   `ai-chat` and `ai-floorplan`
   (`supabase functions deploy ai-chat`, etc.). Compare each deployed
   function's version/hash with the repository afterwards; confirm the
   `ai-floorplan` route answers (no `OPTIONS 404`).
5. **Smoke test as a signed-in user:** cloud sync on a project,
   Backup export/import, Reports workspace read, one AI chat message,
   one floor-plan generation. Confirm no `POST 500` in the function
   logs for `ai-chat`.

## 3. Rollback notes

- The migration is additive (`CREATE TABLE IF NOT EXISTS`); rolling
  back application deploys does not require dropping the table. Do not
  drop `user_workspace` once real data exists.
- If a redeployed function misbehaves, redeploy the previous known
  version from its Git tag/commit; keep the migration in place.
