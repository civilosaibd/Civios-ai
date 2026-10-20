-- ============================================================================
-- Phase 2 — Yearly-only billing  ("same price, new billing period")
--
-- REVIEW BEFORE APPLYING. Idempotent. Does NOT modify any plan amount:
-- price_yearly was already set equal to price_monthly by
-- 20261020080000_yearly_prices_match_monthly.sql (no x12). This migration only
-- stops the database from accepting / granting MONTHLY billing.
--
-- Existing data is left alone:
--   * existing ACTIVE monthly subscriptions keep their renewal_date;
--   * historical payments keep billing_cycle = 'monthly' (records, not options);
--   * plans.price_monthly column is kept (history) but is no longer used.
-- ============================================================================

-- Same-price rule, made self-contained: yearly amount = existing monthly amount.
-- (Identical to 20261020080000_yearly_prices_match_monthly.sql; a no-op if that ran.)
-- LIVE CHECK (read-only, anon key, 2026-10-20): production still has price_yearly = 10 x monthly
-- (4990 / 19990 / 49990), so this UPDATE is REQUIRED before the new frontend is deployed.
UPDATE public.plans
   SET price_yearly = price_monthly, updated_at = now()
 WHERE code IN ('starter', 'professional', 'business')
   AND price_yearly IS DISTINCT FROM price_monthly;

COMMENT ON COLUMN public.plans.price_monthly IS
  'DEPRECATED legacy column. Billing is yearly-only; price_yearly is the single source of truth.';

ALTER TABLE public.subscriptions ALTER COLUMN billing_cycle SET DEFAULT 'yearly';
ALTER TABLE public.payments      ALTER COLUMN billing_cycle SET DEFAULT 'yearly';

-- New payments: always yearly, amount = plans.price_yearly (never client-supplied)
CREATE OR REPLACE FUNCTION public.payments_enforce_server_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p public.plans%ROWTYPE;
BEGIN
  IF new.plan_id IS NULL THEN RAISE EXCEPTION 'plan_id is required'; END IF;
  SELECT * INTO p FROM public.plans WHERE id = new.plan_id AND is_active = true;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Unknown or inactive plan'; END IF;

  new.billing_cycle := 'yearly';
  new.amount := p.price_yearly;
  new.currency := coalesce(p.currency, 'BDT');
  IF current_user IN ('authenticated', 'anon') THEN
    new.status := 'pending';
    new.verified_at := NULL;
    new.subscription_id := NULL;
  END IF;
  RETURN new;
END;
$$;

-- Approval always grants a YEARLY subscription. A legacy pending MONTHLY payment
-- is refused so an admin makes an explicit decision (reject / ask user to resubmit).
CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  sub_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF pay.status <> 'pending' THEN RAISE EXCEPTION 'Payment is already %', pay.status; END IF;
  IF pay.plan_id IS NULL THEN RAISE EXCEPTION 'Payment has no plan'; END IF;
  IF pay.billing_cycle <> 'yearly' THEN
    RAISE EXCEPTION 'Legacy monthly payment: monthly billing was removed. Reject it and ask the user to resubmit a yearly payment.';
  END IF;

  INSERT INTO public.subscriptions (user_id, plan_id, status, billing_cycle, start_date, renewal_date, cancelled_at, payment_provider)
  VALUES (pay.user_id, pay.plan_id, 'active', 'yearly', now(), now() + interval '1 year', NULL, 'manual')
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, status = 'active', billing_cycle = 'yearly',
        start_date = EXCLUDED.start_date, renewal_date = EXCLUDED.renewal_date,
        cancelled_at = NULL, payment_provider = 'manual'
  RETURNING id INTO sub_id;

  UPDATE public.payments
     SET status = 'verified', verified_at = now(), subscription_id = sub_id
   WHERE id = pay.id;

  RETURN sub_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payment(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.payments_enforce_server_amount() FROM PUBLIC, anon, authenticated;
