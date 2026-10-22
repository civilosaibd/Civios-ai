-- ============================================================================
-- Phase 4b — referral for sign-ups that cannot carry ?ref= in their metadata (Google sign-in)
--
-- REVIEW BEFORE APPLYING. Idempotent. Adds claim_referral(_code):
--   a brand-new account (< 24 h old) with no referrer yet and no verified payment
--   can attach a valid referral code ONCE. The code owner can never be the caller.
-- Returns 'claimed' | 'already_referred' | 'too_late' | 'invalid_code' | 'self'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_referral(_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  code text := upper(trim(coalesce(_code, '')));
  referrer uuid;
  created timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF code !~ '^[A-Z0-9-]{4,32}$' THEN RETURN 'invalid_code'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_referral:' || uid::text));

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = uid)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND referred_by IS NOT NULL) THEN
    RETURN 'already_referred';
  END IF;

  SELECT u.created_at INTO created FROM auth.users u WHERE u.id = uid;
  IF created IS NULL OR created < now() - interval '24 hours'
     OR EXISTS (SELECT 1 FROM public.payments WHERE user_id = uid AND status = 'verified') THEN
    RETURN 'too_late';
  END IF;

  SELECT id INTO referrer FROM public.profiles WHERE referral_code = code;
  IF referrer IS NULL THEN RETURN 'invalid_code'; END IF;
  IF referrer = uid THEN RETURN 'self'; END IF;

  UPDATE public.profiles SET referred_by = referrer WHERE id = uid;   -- SECURITY DEFINER: allowed by the protect trigger
  INSERT INTO public.referrals (referrer_id, referred_user_id, status)
  VALUES (referrer, uid, 'pending')
  ON CONFLICT (referred_user_id) DO NOTHING;
  RETURN 'claimed';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated, service_role;
