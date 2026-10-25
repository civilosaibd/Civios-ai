-- Public signup must never grant global admin privileges automatically.
-- Existing user_roles rows are deliberately not modified by this migration.
-- Bootstrap trusted administrators manually using docs/security/ADMIN_BOOTSTRAP.md.

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

  -- Never elevate an account on the basis of a self-supplied signup email.
  -- Global admin assignment is an out-of-band, reviewed operator action.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;
