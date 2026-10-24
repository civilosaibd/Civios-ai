-- Referral policy: 10% of the first verified paid payment for Starter, Professional, or Business.
-- One commission per referred user; later renewals/upgrades never generate another commission.
-- Does not alter plan prices, payment records, or existing commissions.
CREATE OR REPLACE FUNCTION public.record_referral_commission(_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  ref public.referrals%ROWTYPE;
  rate numeric := 0.10;
  reason text;
  digits text;
  plan_code text;
  inserted_count integer;
BEGIN
  SELECT * INTO pay
  FROM public.payments
  WHERE id = _payment_id
    AND status = 'verified';

  IF pay.id IS NULL OR coalesce(pay.amount, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT code INTO plan_code
  FROM public.plans
  WHERE id = pay.plan_id;

  IF plan_code IS NULL OR plan_code NOT IN ('starter', 'professional', 'business') THEN
    RETURN;
  END IF;

  SELECT * INTO ref
  FROM public.referrals
  WHERE referred_user_id = pay.user_id;

  IF ref.id IS NULL OR ref.referrer_id = pay.user_id THEN
    RETURN;
  END IF;

  -- If an earlier verified payment exists, this is not the referred user's first
  -- verified payment and cannot earn a commission. Use stable tie-breakers when
  -- two payments share the same verified_at timestamp.
  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.user_id = pay.user_id
      AND p.id <> pay.id
      AND p.status = 'verified'
      AND coalesce(p.amount, 0) > 0
      AND (
        coalesce(p.verified_at, p.created_at),
        p.created_at,
        p.id
      ) < (
        coalesce(pay.verified_at, pay.created_at),
        pay.created_at,
        pay.id
      )
  ) THEN
    RETURN;
  END IF;

  -- The unique index is the final concurrency guard; this existence check
  -- makes repeated calls for the same referred user an inexpensive no-op.
  IF EXISTS (
    SELECT 1
    FROM public.referral_commissions c
    WHERE c.referred_user_id = pay.user_id
  ) THEN
    RETURN;
  END IF;

  -- Policy is fixed at 10%; never trust a client-controlled or mutable setting
  -- for the commission percentage.
  digits := regexp_replace(coalesce(pay.sender_number, ''), '[^0-9]', '', 'g');
  IF length(digits) >= 5 AND EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.user_id = ref.referrer_id
      AND regexp_replace(coalesce(p.sender_number, ''), '[^0-9]', '', 'g') = digits
  ) THEN
    reason := 'Payment sender number matches a payment made by the referrer';
  ELSIF length(trim(coalesce(pay.transaction_id, ''))) > 0 AND EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.id <> pay.id
      AND lower(trim(p.transaction_id)) = lower(trim(pay.transaction_id))
  ) THEN
    reason := 'Transaction ID was used on another payment';
  END IF;

  INSERT INTO public.referral_commissions
    (referral_id, referrer_id, referred_user_id, payment_id, base_amount, rate, commission_amount, status, flag_reason)
  VALUES
    (ref.id, ref.referrer_id, pay.user_id, pay.id, pay.amount, rate,
     round(pay.amount * rate, 2),
     CASE WHEN reason IS NULL THEN 'approved' ELSE 'flagged' END,
     reason)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    RETURN;
  END IF;

  UPDATE public.referrals
  SET plan = plan_code
  WHERE id = ref.id;

  PERFORM public.refresh_referral_totals(ref.id);
END;
$$;

-- Keep the commission writer server-only. CREATE OR REPLACE preserves existing
-- ACLs, and these revokes make the intended boundary explicit in this migration.
REVOKE ALL ON FUNCTION public.record_referral_commission(uuid)
  FROM PUBLIC, anon, authenticated;
