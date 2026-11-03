# CivilOS AI — 100K Concurrent-User Scalability Readiness

## Status

This is an implementation and verification plan, **not a claim that the current production deployment can serve 100,000 concurrent users**. No production settings, database schema, billing plan, or live traffic were changed by this work.

## What the repository currently tells us

- The client is a Vite + React SPA; Vercel currently rewrites all paths to `/index.html`.
- The browser connects to Supabase through `@supabase/supabase-js`.
- The app includes Three.js / React Three Fiber and a PWA service worker. Static assets can be CDN-cached; 3D computation should remain primarily client-side where practical.
- `AGENTS.md` documents `useCloudState` syncing user workspace state to `user_workspace`, and a shared Supabase Edge Function named `agent`.
- The repository does not, by itself, prove the production Supabase compute tier, pooler configuration, Vercel plan/limits, Edge Function quotas, AI provider limits, or measured throughput. Those must be inspected before capacity can be stated.

## Capacity target and terminology

The planning target is **100,000 concurrent active sessions**, not 100,000 requests per second. These are very different workloads. Capacity must be defined by:
- active sessions and requests/second per route;
- read/write mix and payload sizes;
- simultaneous AI jobs, 3D sessions, uploads and exports;
- acceptable p95/p99 latency and error rate;
- geographic distribution and peak duration.

A 100K target is an architecture objective. Production readiness is only earned after representative tests and provider-limit review.

## Target architecture

1. **Delivery layer**
   - Keep the Vite SPA and immutable, fingerprinted assets behind Vercel's CDN.
   - Cache only public, versioned assets and genuinely public GET responses.
   - Never cache authenticated HTML/API responses or user-specific data in a shared cache.
   - Lazy-load CAD/BIM/3D bundles and large engineering libraries; use Web Workers for CPU-heavy browser calculations where feasible.

2. **API and identity**
   - Treat the browser as untrusted. Enforce authorization in Supabase RLS and server-side functions.
   - Keep privileged keys server-side only.
   - Apply per-user and per-IP quotas to expensive endpoints; use idempotency keys for retryable writes.
   - Avoid turning every UI interaction into a database round trip. Batch writes and debounce autosave.

3. **Database**
   - Inspect actual query patterns and indexes before adding indexes or changing schema.
   - Use Supabase connection pooling for server-side workloads that need Postgres connections; do not create long-lived direct Postgres connections per browser session.
   - Paginate large lists, select only needed columns, avoid N+1 queries, and bound all queries.
   - Separate transactional user data from analytics/telemetry workloads where measurement shows contention.
   - Establish tested backup/restore and point-in-time recovery objectives appropriate to the selected plan.

4. **Background workloads**
   - Move long-running estimates, drawing parsing, report generation, BIM conversion and bulk imports out of request/response paths.
   - Use a durable queue with bounded concurrency, retries with backoff, dead-letter handling and idempotent workers.
   - Return a job ID and expose progress/status rather than holding a web request open.
   - Apply per-tenant concurrency limits so one customer cannot starve others.

5. **AI and third-party services**
   - Put model calls behind a server-side gateway; never expose provider secrets in the browser.
   - Enforce plan entitlements, token budgets, request quotas, timeouts and circuit breakers.
   - Queue or shed excess work gracefully; do not let AI provider throttling take down normal app workflows.
   - Record latency, provider errors and token/cost usage without logging prompts or sensitive project content unnecessarily.

6. **Reliability and observability**
   - Track request rate, p50/p95/p99 latency, 4xx/5xx, database connections, slow queries, queue depth/age, function duration, AI-provider failures and cost.
   - Add alerting for sustained error/latency thresholds and queue backlogs.
   - Define graceful degradation: pause expensive AI/3D exports first while keeping authentication, project reads and core calculations available.
   - Test backup restoration and incident runbooks.

## Rollout gates

| Stage | Test target | Gate before proceeding |
|---|---:|---|
| 0 | Baseline / 50 VUs | Establish route-level baseline, no functional regressions |
| 1 | 100–500 VUs | p95 and error budget met; no connection saturation |
| 2 | 1,000–3,000 VUs | Stable database pool, no runaway query count |
| 3 | 5,000–15,000 VUs | Queue and AI limits behave correctly; no tenant starvation |
| 4 | 25,000–50,000 VUs | Multi-region/CDN and database bottlenecks measured |
| 5 | 100,000 VUs | Only after provider capacity, budget, test environment and rollback plan are approved |

Do not run high-volume tests against production without an explicit maintenance window, provider approval, a spend cap and a tested rollback/stop procedure. Start with staging and synthetic test accounts.

## Required workload profiles

A homepage-only test is not a platform capacity test. Build separate profiles for:
- anonymous landing-page and static-asset delivery;
- sign-in/session refresh (using synthetic accounts and safe test credentials);
- dashboard and paginated project reads;
- project autosave and bounded write bursts;
- quantity/BOQ calculations;
- AI requests with a mocked provider first, then a separately budgeted provider test;
- CAD/3D/BIM client-side performance and upload/download paths;
- background job enqueue, worker throughput, retry and queue recovery.

## Acceptance criteria (initial proposal)

Agree exact SLOs with product owners before load testing. Suggested starting gates:
- normal read APIs: p95 < 500 ms at the agreed test load;
- writes: p95 < 800 ms, with no lost or duplicated writes;
- 5xx rate < 0.5% during steady-state tests;
- no cross-tenant data leakage, RLS bypass or authorization regression;
- queue age remains bounded and drains after a burst;
- no unbounded memory, connection, retry or cost growth;
- app remains usable when AI provider is throttled or unavailable.

These are proposed test gates, not measured current performance or guaranteed service levels.

## Immediate audit checklist

- [ ] Confirm Vercel project plan, function runtime/region, limits and current deployment configuration.
- [ ] Confirm Supabase project, compute tier, connection pooler mode/limits, database size, indexes and RLS policies.
- [ ] Review Edge Function invocations, timeouts, concurrency and secrets handling.
- [ ] Inventory all API routes and high-cost browser-to-database calls.
- [ ] Add route-level telemetry and correlation IDs without collecting secrets.
- [ ] Create staging environment with synthetic data and test accounts.
- [ ] Add k6 scenarios for real application routes and API workloads.
- [ ] Run baseline tests, inspect bottlenecks, fix them, and repeat.
- [ ] Obtain provider capacity and cost approval before 25K/50K/100K tests.

## Important operational note

Do not purchase or enable Redis, a queue provider, larger database compute, extra regions or paid load-testing capacity merely because they appear in this plan. First measure the bottleneck and compare the incremental cost. Scaling settings are provider- and plan-dependent; no infrastructure is automatically upgraded by this document.
