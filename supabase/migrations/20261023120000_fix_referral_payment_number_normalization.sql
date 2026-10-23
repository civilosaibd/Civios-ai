-- Make referral payment fraud checks normalize phone numbers with a portable POSIX digit class.
-- Using [^0-9] avoids backslash escaping differences between SQL strings and regex engines.
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
  plan_code text;
BEGIN
  SELECT * INTO pay
  FROM public.payments
  WHERE id = _payment_id AND status = 'verified';

  IF pay.id IS NULL OR coalesce(pay.amount, 0) <= 0 OR pay.billing_cycle <> 'yearly' THEN
    RETURN;
  END IF;

  SELECT code INTO plan_code FROM public.plans WHERE id = pay.plan_id;
  IF plan_code IS DISTINCT FROM 'professional' THEN
    RETURN;
  END IF;

  SELECT * INTO ref
  FROM public.referrals
  WHERE referred_user_id = pay.user_id;

  IF ref.id IS NULL OR ref.referrer_id = pay.user_id THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referral_commissions c
    WHERE c.referred_user_id = pay.user_id
  ) THEN
    RETURN;
  END IF;

  SELECT least(greatest((value #>> '{}')::numeric, 0), 1)
  INTO rate
  FROM public.app_settings
  WHERE key = 'affiliate.commission_rate';
  rate := coalesce(rate, 0.10);

  digits := regexp_replace(coalesce(pay.sender_number, ''), '[^0-9]', '', 'g');
  IF length(digits) >= 5 AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.user_id = ref.referrer_id
      AND regexp_replace(coalesce(p.sender_number, ''), '[^0-9]', '', 'g') = digits
  ) THEN
    reason := 'Payment sender number matches a payment made by the referrer';
  ELSIF length(trim(coalesce(pay.transaction_id, ''))) > 0 AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.id <> pay.id
      AND lower(trim(p.transaction_id)) = lower(trim(pay.transaction_id))
  ) THEN
    reason := 'Transaction ID was used on another payment';
  END IF;

  INSERT INTO public.referral_commissions
    (referral_id, referrer_id, referred_user_id, payment_id, base_amount, rate, commission_amount, status, flag_reason)
  VALUES
    (ref.id, ref.referrer_id, pay.user_id, pay.id, pay.amount, rate, round(pay.amount * rate, 2),
     CASE WHEN reason IS NULL THEN 'approved' ELSE 'flagged' END, reason)
  ON CONFLICT DO NOTHING;

  UPDATE public.referrals
  SET plan = (SELECT code FROM public.plans WHERE id = pay.plan_id)
  WHERE id = ref.id;

  PERFORM public.refresh_referral_totals(ref.id);
END;
$$;
