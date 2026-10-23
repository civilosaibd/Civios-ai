-- ============================================================================
-- Phase 4c — remove table privileges nothing needs (defence in depth; RLS is unchanged)
--
-- REVIEW BEFORE APPLYING. Idempotent. Supabase's default grants give anon/authenticated
-- TRUNCATE / REFERENCES / TRIGGER on every table, and anon full DML on some money tables.
-- TRUNCATE is NOT subject to RLS. This only REVOKEs; no policy, row or function changes.
--   * payments, withdrawals, subscriptions, referrals: anon loses everything (no public use)
--   * these + profiles: anon & authenticated lose TRUNCATE, REFERENCES, TRIGGER
--   * profiles: anon also loses INSERT/UPDATE/DELETE (its policies need auth.uid() anyway)
-- ============================================================================
REVOKE ALL ON public.payments, public.withdrawals, public.subscriptions, public.referrals FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.payments, public.withdrawals, public.subscriptions, public.referrals, public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;
