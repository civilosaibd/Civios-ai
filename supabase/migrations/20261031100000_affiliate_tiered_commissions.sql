-- Phase 3: tiered recurring affiliate commissions.
-- First eligible verified payment per referred user: 30%.
-- Every subsequent eligible verified payment for that same user: 10%.
-- Existing ledger entries are retained and count as prior commission events.
-- Remove the legacy one-commission-per-referred-user index so repeat payments can earn 10%.
DROP INDEX IF EXISTS public.referral_commissions_one_per_referred_user;
INSERT INTO public.app_settings (key, value)
VALUES
  ('affiliate.first_payment_commission_rate', '0.30'::jsonb),
  ('affiliate.commission_rate', '0.10'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.record_referral_commission(_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  ref public.referrals%ROWTYPE;
  rate numeric;
  first_rate numeric;
  subsequent_rate numeric;
  has_prior_commission boolean;
  reason text;
  digits text;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = _payment_id AND status = 'verified';
  IF pay.id IS NULL THEN RETURN; END IF;

  SELECT * INTO ref FROM public.referrals WHERE referred_user_id = pay.user_id;
  IF ref.id IS NULL THEN RETURN; END IF;
  IF ref.referrer_id = pay.user_id THEN RETURN; END IF;
  IF coalesce(pay.amount, 0) <= 0 THEN RETURN; END IF;

  -- Serialize eligibility checks for this referred account, including concurrent approvals.
  PERFORM pg_advisory_xact_lock(hashtextextended('affiliate:' || ref.referred_user_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.referral_commissions WHERE payment_id = pay.id) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.referral_commissions
    WHERE referred_user_id = ref.referred_user_id
  ) INTO has_prior_commission;

  SELECT least(greatest((value #>> '{}')::numeric, 0), 1)
    INTO first_rate FROM public.app_settings
    WHERE key = 'affiliate.first_payment_commission_rate';
  SELECT least(greatest((value #>> '{}')::numeric, 0), 1)
    INTO subsequent_rate FROM public.app_settings
    WHERE key = 'affiliate.commission_rate';

  first_rate := coalesce(first_rate, 0.30);
  subsequent_rate := coalesce(subsequent_rate, 0.10);
  rate := CASE WHEN has_prior_commission THEN subsequent_rate ELSE first_rate END;

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

  UPDATE public.referrals
     SET plan = (SELECT code FROM public.plans WHERE id = pay.plan_id)
   WHERE id = ref.id;
  PERFORM public.refresh_referral_totals(ref.id);
END;
$$;
