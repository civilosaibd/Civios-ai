-- ============================================================================
-- Phase 3 — Affiliate commission (server-side, 10% of each verified payment)
--
-- REVIEW BEFORE APPLYING. Idempotent. Changes:
--   * NEW table  referral_commissions  (ledger: one row per verified payment)
--   * approve_payment()  now also records the referral commission, atomically
--   * available_commission_balance()  now reads the ledger (approved rows only)
--   * NEW  my_affiliate_stats() / review_commission() / helper functions
--   * NEW  app_settings key 'affiliate.commission_rate' (default 0.10)
-- It does NOT touch plan prices, subscriptions or existing payments.
--
-- Rules enforced here (the client sends no amounts, ever):
--   commission = round(verified payment amount x rate, 2)
--   - one ledger row per payment (UNIQUE payment_id)  -> replay can't pay twice
--   - self-referral never earns (also blocked by a CHECK on referrals)
--   - suspicious payments are held as 'flagged' until an admin approves/rejects:
--       * referred user's payment uses the same sender number as the referrer's
--       * the same transaction id was used on another payment
--   - only 'approved' rows count towards the withdrawable balance
-- ============================================================================

-- ---- commission rate is configuration, not code -----------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.app_settings (key, value) VALUES ('affiliate.commission_rate', '0.10'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---- ledger ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE SET NULL,
  base_amount numeric NOT NULL CHECK (base_amount >= 0),
  rate numeric NOT NULL CHECK (rate >= 0 AND rate <= 1),
  commission_amount numeric NOT NULL CHECK (commission_amount >= 0),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'flagged', 'rejected')),
  flag_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refcomm_referrer ON public.referral_commissions (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refcomm_referral ON public.referral_commissions (referral_id);

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Referrer views own commissions" ON public.referral_commissions;
CREATE POLICY "Referrer views own commissions" ON public.referral_commissions
  FOR SELECT TO authenticated USING (referrer_id = auth.uid());
DROP POLICY IF EXISTS "Admins view commissions" ON public.referral_commissions;
CREATE POLICY "Admins view commissions" ON public.referral_commissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- no INSERT / UPDATE / DELETE policy: only the SECURITY DEFINER functions below write here
REVOKE ALL ON public.referral_commissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.referral_commissions FROM authenticated;
GRANT SELECT ON public.referral_commissions TO authenticated;
GRANT ALL ON public.referral_commissions TO service_role;

-- a user can never be their own referrer (NOT VALID: no scan of old rows, enforced for all new ones)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_no_self_referral') THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_user_id) NOT VALID;
  END IF;
END $$;

-- ---- helpers (internal) --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_referral_totals(_referral uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tot numeric; n_flag int; n_rej int;
BEGIN
  SELECT coalesce(sum(commission_amount) FILTER (WHERE status = 'approved'), 0),
         count(*) FILTER (WHERE status = 'flagged'),
         count(*) FILTER (WHERE status = 'rejected')
    INTO tot, n_flag, n_rej
    FROM public.referral_commissions WHERE referral_id = _referral;

  UPDATE public.referrals
     SET commission_amount = tot,
         status = CASE WHEN tot > 0 THEN 'converted'
                       WHEN n_flag > 0 THEN 'flagged'
                       WHEN n_rej > 0 THEN 'rejected'
                       ELSE status END
   WHERE id = _referral;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_referral_commission(_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  ref public.referrals%ROWTYPE;
  rate numeric;
  reason text;
  digits text;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = _payment_id AND status = 'verified';
  IF pay.id IS NULL THEN RETURN; END IF;

  SELECT * INTO ref FROM public.referrals WHERE referred_user_id = pay.user_id;
  IF ref.id IS NULL THEN RETURN; END IF;                       -- not a referred user
  IF ref.referrer_id = pay.user_id THEN RETURN; END IF;        -- self-referral never earns
  IF coalesce(pay.amount, 0) <= 0 THEN RETURN; END IF;

  SELECT least(greatest((value #>> '{}')::numeric, 0), 1) INTO rate
    FROM public.app_settings WHERE key = 'affiliate.commission_rate';
  rate := coalesce(rate, 0.10);

  digits := regexp_replace(coalesce(pay.sender_number, ''), '\D', '', 'g');
  IF length(digits) >= 5 AND EXISTS (
       SELECT 1 FROM public.payments p
        WHERE p.user_id = ref.referrer_id
          AND regexp_replace(coalesce(p.sender_number, ''), '\D', '', 'g') = digits) THEN
    reason := 'Payment sender number matches a payment made by the referrer';
  ELSIF length(trim(coalesce(pay.transaction_id, ''))) > 0 AND EXISTS (
       SELECT 1 FROM public.payments p
        WHERE p.id <> pay.id AND lower(trim(p.transaction_id)) = lower(trim(pay.transaction_id))) THEN
    reason := 'Transaction ID was used on another payment';
  END IF;

  INSERT INTO public.referral_commissions
    (referral_id, referrer_id, referred_user_id, payment_id, base_amount, rate, commission_amount, status, flag_reason)
  VALUES
    (ref.id, ref.referrer_id, pay.user_id, pay.id, pay.amount, rate, round(pay.amount * rate, 2),
     CASE WHEN reason IS NULL THEN 'approved' ELSE 'flagged' END, reason)
  ON CONFLICT (payment_id) DO NOTHING;

  UPDATE public.referrals SET plan = (SELECT code FROM public.plans WHERE id = pay.plan_id) WHERE id = ref.id;
  PERFORM public.refresh_referral_totals(ref.id);
END;
$$;

-- ---- approve_payment: same as the Phase-2 version + commission, in ONE transaction ----
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

  PERFORM public.record_referral_commission(pay.id);

  RETURN sub_id;
END;
$$;

-- ---- admin review of a flagged commission -----------------------------------------
CREATE OR REPLACE FUNCTION public.review_commission(_commission_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.referral_commissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT * INTO c FROM public.referral_commissions WHERE id = _commission_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Commission not found'; END IF;
  IF c.status <> 'flagged' THEN RAISE EXCEPTION 'Only flagged commissions can be reviewed (status is %)', c.status; END IF;

  UPDATE public.referral_commissions
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         flag_reason = coalesce(nullif(trim(_note), ''), flag_reason),
         reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = c.id;
  PERFORM public.refresh_referral_totals(c.referral_id);
END;
$$;

-- ---- balance = approved ledger - every withdrawal that was not rejected -------------
CREATE OR REPLACE FUNCTION public.available_commission_balance(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT sum(commission_amount) FROM public.referral_commissions
                    WHERE referrer_id = _user_id AND status = 'approved'), 0)
       - coalesce((SELECT sum(amount) FROM public.withdrawals
                    WHERE user_id = _user_id AND status IN ('pending', 'approved', 'paid')), 0)
$$;

-- ---- the caller's own numbers, from the same source the withdrawal check uses -------
CREATE OR REPLACE FUNCTION public.my_affiliate_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  earned numeric; in_review numeric; paid numeric; reserved numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT coalesce(sum(commission_amount) FILTER (WHERE status = 'approved'), 0),
         coalesce(sum(commission_amount) FILTER (WHERE status = 'flagged'), 0)
    INTO earned, in_review FROM public.referral_commissions WHERE referrer_id = uid;
  SELECT coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0),
         coalesce(sum(amount) FILTER (WHERE status IN ('pending', 'approved')), 0)
    INTO paid, reserved FROM public.withdrawals WHERE user_id = uid;
  RETURN jsonb_build_object(
    'referred',  (SELECT count(*) FROM public.referrals WHERE referrer_id = uid),
    'converted', (SELECT count(*) FROM public.referrals WHERE referrer_id = uid AND status = 'converted'),
    'earned', earned, 'in_review', in_review, 'withdrawn', paid, 'requested', reserved,
    'available', earned - paid - reserved,
    'rate', coalesce((SELECT (value #>> '{}')::numeric FROM public.app_settings WHERE key = 'affiliate.commission_rate'), 0.10));
END;
$$;

-- ---- privileges --------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.refresh_referral_totals(uuid)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_referral_commission(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_payment(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_commission(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.available_commission_balance(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_affiliate_stats()                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_payment(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_commission(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_affiliate_stats()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.available_commission_balance(uuid)     TO service_role;
