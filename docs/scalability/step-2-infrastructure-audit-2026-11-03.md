# CivilOS AI — Step 2 Infrastructure Audit
**Audit date:** 2026-11-03  
**Scope:** Read-only review of the connected Vercel project, Supabase organization/project, current production deployment metadata, Supabase advisors, recent logs, database metadata, current Git source and deployed Edge Function source.

> This is an infrastructure audit, not a capacity certification. No plan upgrades, compute changes, production configuration changes, schema changes, or load tests were performed.

## Executive finding

**The current connected infrastructure is not ready to claim support for 100,000 concurrent active users.** The Vercel team is on Hobby and the Supabase organization is on Free. The live Supabase database is small and healthy at the time of inspection, but the Free-plan realtime and usage ceilings are far below a 100K all-live-user design. In addition, one app data-sync table referenced by the source code is absent from the connected production database, and at least one deployed AI Edge Function is not aligned with the current Git source.

A 100K *signed-in session* target is not the same as 100K simultaneous server-function executions or 100K realtime sockets. The architecture and test plan must specify each separately.

## 1. Vercel audit

| Item | Observed state |
|---|---|
| Team plan | Hobby |
| Project | `civilosai` |
| Framework | Vite |
| Connected repository | `zobaerio/CivilOS-AI` |
| Latest production deployment | READY |
| Latest production source | `main`, commit `f9e2e425fdf3ceb63c2d7f1631a3d92ab7f87986` |
| Production domain | `civilosai.pro.bd`, verified |
| Vercel alias | `civilosai.vercel.app`, redirects to custom domain |
| Production deployment region metadata | `iad1` |
| Runtime log retention | Hobby currently exposes only a short retention window (24-hour runtime-log query was rejected; 30-minute query returned no grouped entries) |
| Runtime error clusters | No runtime error clusters returned for the queried 24-hour window |

### Implications

- Vercel documents Hobby as a personal/non-commercial plan. CivilOS AI is being developed as a commercial SaaS, so the production operating plan needs to move to an appropriate paid plan before commercial launch.
- Hobby included usage is limited (for example, 1 million Function Invocations and 4 CPU-hours in the current plan documentation). A large traffic spike could exhaust included usage before the app's code reaches its technical concurrency ceiling.
- Vercel documents automatic function concurrency scaling, with higher ceilings on Enterprise than standard plans. This is a function-execution limit, **not a direct limit on static page sessions**. If the target is 100K simultaneous Vercel function executions, plan for an Enterprise capacity discussion rather than assuming Hobby or Pro is enough.
- The production deployment metadata reports `iad1`, while Supabase is located in `ap-northeast-2` (Seoul). Confirm which requests actually execute through Vercel Functions. Any database-bound function should be placed near its data where supported, then measured; do not change the region based on metadata alone.
- The current production deployment is READY and both configured production domains are verified. This only confirms deployment state and domain verification, not load capacity.

References:
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/limits
- https://vercel.com/docs/functions/concurrency-scaling

## 2. Supabase organization and project audit

| Item | Observed state |
|---|---|
| Organization plan | Free |
| Project | CivilOS-AI |
| Project status | ACTIVE_HEALTHY |
| Region | `ap-northeast-2` |
| PostgreSQL | 17.11.0.003 |
| Database size | 15 MB |
| `max_connections` | 60 |
| Current connections at audit snapshot | 15 total: 7 idle, 1 active, 7 with no state reported |
| Active Edge Functions | 7 listed |
| Applied Supabase migrations | Through `20261101105419_admin_excel_library` |

### Free-plan capacity gaps

The current Supabase Free organization is not suitable for a 100K all-live-user target. Supabase's current published quotas include 50,000 MAU, 500,000 Edge Function invocations, 5 GB egress, 500 MB database size and 200 peak Realtime connections. Realtime limits are especially important because the app currently opens a per-user Realtime notification subscription after sign-in.

Current published Realtime concurrency limits are 200 on Free, 500 on Pro, 10,000 on Pro without a spend cap / Team, and 10,000+ on Enterprise subject to configuration. Even Pro does not mean 100K simultaneous Realtime connections. We must either reduce the number of always-on sockets, use another scalable notification/event delivery design, or discuss Enterprise-scale limits.

The project metadata does not expose the selected Compute Add-on size through the connected API. Free projects normally use Nano compute (shared CPU, up to 0.5 GB RAM); verify the exact selection in the Supabase Dashboard before sizing any upgrade.

References:
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/functions/limits

## 3. Production database finding — workspace table missing

The current Git source `src/lib/cloudState.ts` reads and upserts `public.user_workspace` for cross-device account sync. The repository's Drizzle migration also defines that table. However, the connected production database inspection returned:

- `to_regclass('public.user_workspace') = NULL`
- `information_schema.tables` returned no table named `user_workspace` in any schema.
- The live public-table inventory did not list this table.

This is a **P0 data-sync blocker** to investigate. The hook currently ignores the initial SELECT/UPSERT errors in some branches and can still set its local `synced` state to true, so a missing table can be disguised as a successful sync in the UI.

Required next action: create a reviewed Supabase migration for `user_workspace`, enable RLS, add strict owner-only SELECT/INSERT/UPDATE/DELETE policies, verify the key uniqueness and `user_id` foreign key behavior, then change the hook to surface failed sync state and retry safely. Do not create the table directly in production without a reviewed migration and regression tests.

## 4. Realtime and client write amplification

### Notifications

`src/components/NotificationBell.tsx`:
- fetches up to 30 notifications when the signed-in user is loaded;
- opens a separate Supabase Realtime channel for that user's notification rows;
- on every matching database event, fetches the notification list again.

This is a per-user live socket pattern. It is acceptable at small scale but conflicts with the current Free plan's 200 peak-connection quota and will be a bottleneck long before 100K users if every session keeps the channel open. Review a batched notification feed, event fanout, or an alternative delivery strategy. Add reconnect/backoff and ensure the UI does not open duplicate channels.

### Cloud workspace state

`src/lib/cloudState.ts` saves local state immediately and debounces each hook key's Supabase upsert by 800 ms. This reduces keystroke writes, but many independent hook keys/components can still create parallel reads and writes. After the missing table is resolved, consolidate sync where practical, batch writes, avoid writes for unchanged values, and instrument write volume and retry rates.

## 5. Supabase advisor results

### Performance advisor

| Finding | Count | Level |
|---|---:|---|
| Auth calls re-evaluated inside RLS row policies (RLS initplan) | 82 | WARN |
| Multiple permissive RLS policies | 19 | WARN |
| Foreign keys without covering indexes | 17 | INFO |
| Unused indexes | 15 | INFO |

The 82 RLS findings should be reviewed for `(select auth.uid())` / `(select auth.jwt())`-style initialization rather than per-row reevaluation. Add the missing foreign-key indexes only after reviewing existing indexes and migration history. Do not automatically drop the 15 unused indexes: the database is currently tiny and workload history is not representative.

### Security advisor

| Finding | Count | Level |
|---|---:|---|
| SECURITY DEFINER functions executable by authenticated role | 17 | WARN |
| RLS enabled with no policies | 6 | INFO |
| Leaked-password protection disabled | 1 | WARN |

The six RLS tables with no policies appear to include server-managed audit/rate-limit tables; no policy may be intentional to deny direct client access. Do not add permissive policies just to silence the advisor. Review all 17 SECURITY DEFINER RPCs individually for explicit identity/role checks and least-privilege grants before deciding whether authenticated execution is intended. Enable leaked-password protection after checking the Auth configuration and user impact.

References:
- https://supabase.com/docs/guides/database/database-linter
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/password-security

## 6. Edge Function drift and recent errors

The current production `ai-chat` Edge Function is version 11. The deployed source retrieved from Supabase is an older Lovable-only implementation. The current Git `main` source has newer configurable `AI_PROVIDER` selection, OpenAI support, AI credit consumption and shared rate-limit helpers. The two versions are not aligned.

Recent Supabase function-edge logs in the queried 24-hour window contained:
- one `POST 500` from `ai-chat`;
- the corresponding function log says `LOVABLE_API_KEY not configured`;
- one `OPTIONS 404` for `ai-floorplan`.

This indicates a live AI integration/deployment gap, not a load-capacity measurement. Before load testing, compare every deployed function with the repository version, confirm required server-side secrets exist without printing them, deploy reviewed code, and run authenticated smoke tests. Never put provider secrets in `VITE_*` variables or in Git.

The `agent` function has gateway JWT verification disabled in Supabase, but its current handler manually validates the user bearer token and separately checks the server-only cron key. Preserve this custom-auth design only with regression tests for missing, invalid, expired and non-admin tokens; do not remove the handler-level checks.

## 7. Recent log and data snapshot

- Supabase unified logs (queried window): 664 edge-log entries, 133 Realtime entries, 114 Postgres entries, 69 PgBouncer entries, 36 Auth entries, 24 Auth-audit entries, 14 PostgREST entries, 5 function logs and 3 function-edge entries.
- No connection-saturation keywords were found in the sampled PgBouncer logs.
- One Postgres log sample contained `unexpected EOF on standby connection`; sampled PgBouncer reconnects were normal server-lifetime rotations.
- The database was only 15 MB and had 15 connections at the time of the snapshot.

These values show that the current project has a small observed data/connection footprint. They do **not** demonstrate performance under a large user population.

## 8. Prioritized actions before any large load test

| Priority | Action | Why |
|---|---|---|
| P0 | Confirm and migrate missing `user_workspace` table with owner-only RLS | Cross-device account sync references a table absent from production |
| P0 | Reconcile deployed Edge Functions with Git and repair AI provider configuration | A recent AI chat request returned 500; one function route returned 404 |
| P1 | Decide Vercel commercial plan and capacity path | Current team is Hobby; commercial product usage and high concurrency need a suitable plan |
| P1 | Decide Supabase paid/Enterprise path from real workload and budget | Free quotas, especially 200 Realtime connections, do not support an all-users-live 100K model |
| P1 | Redesign/limit per-user Realtime subscriptions and notification refetching | Avoid one always-on socket and a full notification query per event for every active user |
| P1 | Review 82 RLS initplan findings and 17 missing FK indexes | Reduce database cost per query before volume increases |
| P1 | Review 17 SECURITY DEFINER functions and six no-policy tables | Confirm server-only boundaries and avoid insecure policy changes |
| P2 | Add request/DB/queue/AI telemetry, correlation IDs and alerting | Current Hobby log retention is too short for useful operational diagnosis |
| P2 | Build staging synthetic data and realistic k6 workload profiles | Required before any 1K–100K stress tests |

## 9. Stop/go decision

**Do not run 15K, 50K or 100K load tests against production yet.** First fix P0 items, establish a staging environment, document per-route request rates and database read/write mix, obtain provider plan/capacity and spend approval, and define a stop/rollback procedure.

No infrastructure upgrades or billing changes were made during this audit. No load test was run. The project is not yet certified for 100K concurrent users.
