# Phases 0–2 — deploy notes (security + yearly-only billing)

Branch: `fix/security-money-rls` (based on `security/phase-1-hardening`).

## Apply order (IMPORTANT)
1. **Database first.** Run, in order, on a Supabase *staging* project, then production:
   - `20261020080000_yearly_prices_match_monthly.sql` (from security branch)
   - `20261020120000_close_money_and_referral_holes.sql`
   - `20261020130000_yearly_only_billing.sql` (also re-asserts `price_yearly = price_monthly`)
2. **Then deploy the frontend.** Production currently has `price_yearly = 10 × monthly`
   (4990 / 19990 / 49990, read-only check on 2026-10-20). The new UI shows `price_yearly`,
   so deploying it before step 1 would show/charge 10× the intended price.
3. Deploy edge functions `agent` and `ai-analyze` (JWT now required).

## What changed
See commit messages. Tests: `npm i --no-save @electric-sql/pglite && node --test supabase/tests/security.test.mjs`
(runs every real migration in PGlite with Supabase stubs; 19 tests incl. the price rule).

## Decisions that need the owner
- Existing ACTIVE monthly subscriptions are untouched (keep their renewal date).
- Pending LEGACY monthly payments cannot be approved (admin must reject; user resubmits yearly).
- "AI credits / month" is a usage quota reset period, not a billing period — left as is.
- `plans.price_monthly` column kept (deprecated) — drop only with explicit approval.
- Commission engine, referral columns, `/register?ref=` and localStorage capture = Phase 3 (not done).
