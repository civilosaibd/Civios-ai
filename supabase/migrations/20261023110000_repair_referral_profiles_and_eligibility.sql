-- Repair referral profile provisioning and enforce one-time Professional yearly commissions.
-- Existing plan prices are not changed by this migration.

-- Ensure every existing Auth account has a profile and unique referral code.
DO $$
DECLARE
  u auth.users%ROWTYPE;
  code text;
  referrer uuid;
BEGIN
  FOR u IN SELECT * FROM auth.users LOOP
    LOOP
      code := 'CIVIL-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.referral_code = code);
    END LOOP;

    referrer := NULL;
    IF coalesce(u.raw_user_meta_data->>'ref', '') ~* '^[A-Z0-9-]{4,32}$' THEN
      SELECT p.id INTO referrer
      FROM public.profiles p
      WHERE upper(p.referral_code) = upper(trim(u.raw_user_meta_data->>'ref'))
        AND p.id <> u.id
      LIMIT 1;
    END IF;

    INSERT INTO public.profiles (id, display_name, avatar_url, referral_code, referred_by)
    VALUES (
      u.id,
      coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1), 'CivilOS User'),
      u.raw_user_meta_data->>'avatar_url',
      code,
      referrer
    )
    ON CONFLICT (id) DO UPDATE
      SET referral_code = coalesce(nullif(trim(public.profiles.referral_code), ''), EXCLUDED.referral_code),
          display_name = coalesce(nullif(trim(public.profiles.display_name), ''), EXCLUDED.display_name),
          avatar_url = coalesce(public.profiles.avatar_url, EXCLUDED.avatar_url);

    IF referrer IS NOT NULL THEN
      INSERT INTO public.referrals (referrer_id, referred_user_id, status)
      VALUES (referrer, u.id, 'pending')
      ON CONFLICT (referred_user_id) DO NOTHING;
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      u.id,
      CASE
        WHEN lower(coalesce(u.email, '')) IN ('zobaerio24@gmail.com', 'zobaerhasan431@gmail.com')
          THEN 'admin'::public.app_role
        ELSE 'user'::public.app_role
      END
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Do not swallow profile/role creation errors during future sign-ups. A signup must
-- either provision its profile and role or fail visibly instead of creating a broken account.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_code text := upper(trim(coalesce(new.raw_user_meta_data->>'ref', '')));
  ref_user uuid;
  code text;
BEGIN
  IF ref_code ~ '^[A-Z0-9-]{4,32}$' THEN
    SELECT p.id INTO ref_user
    FROM public.profiles p
    WHERE upper(p.referral_code) = ref_code AND p.id <> new.id
    LIMIT 1;
  END IF;

  LOOP
    code := 'CIVIL-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.referral_code = code);
  END LOOP;

  INSERT INTO public.profiles (id, display_name, avatar_url, referral_code, referred_by)
  VALUES (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1), 'CivilOS User'),
    new.raw_user_meta_data->>'avatar_url',
    code,
    ref_user
  )
  ON CONFLICT (id) DO UPDATE
    SET referral_code = coalesce(nullif(trim(public.profiles.referral_code), ''), EXCLUDED.referral_code),
        display_name = coalesce(nullif(trim(public.profiles.display_name), ''), EXCLUDED.display_name),
        avatar_url = coalesce(public.profiles.avatar_url, EXCLUDED.avatar_url);

  IF ref_user IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_user_id, status)
    VALUES (ref_user, new.id, 'pending')
    ON CONFLICT (referred_user_id) DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id,
    CASE
      WHEN lower(coalesce(new.email, '')) IN ('zobaerio24@gmail.com', 'zobaerhasan431@gmail.com')
        THEN 'admin'::public.app_role
      ELSE 'user'::public.app_role
    END
  )
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

-- A referred account can earn only one commission: its first verified Professional yearly payment.
-- The commission amount remains 10% of the server-verified payment amount (or configured rate).
CREATE UNIQUE INDEX IF NOT EXISTS referral_commissions_one_per_referred_user
  ON public.referral_commissions (referred_user_id);

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

  -- Do not create a second commission if this referred account has already had
  -- its first eligible Professional yearly payment reviewed/recorded.
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

  digits := regexp_replace(coalesce(pay.sender_number, ''), '\\D', '', 'g');
  IF length(digits) >= 5 AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.user_id = ref.referrer_id
      AND regexp_replace(coalesce(p.sender_number, ''), '\\D', '', 'g') = digits
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
