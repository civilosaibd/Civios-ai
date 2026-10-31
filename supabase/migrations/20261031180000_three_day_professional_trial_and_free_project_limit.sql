-- Three-day Professional trial for new accounts and a hard one-project Free quota.
-- Existing subscriptions and existing project records are intentionally preserved.

UPDATE public.plans
SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{projects}', '1'::jsonb, true),
    features = CASE
      WHEN COALESCE(features, '[]'::jsonb) @> '["1 project"]'::jsonb THEN features
      ELSE COALESCE(features, '[]'::jsonb) || '["1 project"]'::jsonb
    END,
    updated_at = now()
WHERE code = 'free';

-- New signups receive a three-day Professional trial. The subscription row is
-- created by this trusted auth trigger, never by a browser-supplied plan choice.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  ref_code text := upper(trim(coalesce(new.raw_user_meta_data->>'ref', '')));
  ref_user uuid;
  code text;
  professional_plan_id uuid;
BEGIN
  IF ref_code ~ '^[A-Z0-9-]{4,32}$' THEN
    SELECT p.id INTO ref_user
    FROM public.profiles p
    WHERE upper(p.referral_code) = ref_code AND p.id <> new.id
    LIMIT 1;
  END IF;

  LOOP
    code := 'CIVIL-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.referral_code = code);
  END LOOP;

  INSERT INTO public.profiles (id, display_name, avatar_url, referral_code, referred_by)
  VALUES (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'CivilOS User'
    ),
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
  VALUES (new.id, 'user'::public.app_role)
  ON CONFLICT DO NOTHING;

  SELECT id INTO professional_plan_id
  FROM public.plans
  WHERE code = 'professional' AND is_active = true
  LIMIT 1;

  IF professional_plan_id IS NULL THEN
    RAISE EXCEPTION 'Professional plan is not configured; cannot start signup trial';
  END IF;

  INSERT INTO public.subscriptions (
    user_id, plan_id, status, billing_cycle, start_date, renewal_date, payment_provider
  )
  VALUES (
    new.id, professional_plan_id, 'trialing', 'trial', now(), now() + interval '3 days', 'trial'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;

-- Enforce project limits in Postgres so direct API calls cannot bypass the UI.
CREATE OR REPLACE FUNCTION public.enforce_project_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan_code text;
  v_project_limit integer;
  v_project_count integer;
BEGIN
  -- Trusted backend jobs may create records without an end-user JWT.
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'You can only create projects for your own account'
      USING ERRCODE = '42501';
  END IF;

  IF public.has_role(v_user_id, 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent project creation for the same owner to prevent races.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT p.code, COALESCE(NULLIF(p.limits->>'projects', '')::integer, 0)
    INTO v_plan_code, v_project_limit
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = v_user_id
    AND s.status IN ('active', 'trialing')
    AND (s.renewal_date IS NULL OR s.renewal_date > now())
    AND p.is_active = true
  LIMIT 1;

  IF v_plan_code IS NULL THEN
    SELECT p.code, COALESCE(NULLIF(p.limits->>'projects', '')::integer, 0)
      INTO v_plan_code, v_project_limit
    FROM public.plans p
    WHERE p.code = 'free' AND p.is_active = true
    LIMIT 1;
  END IF;

  IF v_plan_code IS NULL THEN
    RAISE EXCEPTION 'No active Free plan is configured'
      USING ERRCODE = '55000';
  END IF;

  IF v_project_limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer INTO v_project_count
  FROM public.projects
  WHERE user_id = v_user_id;

  IF v_project_count >= v_project_limit THEN
    RAISE EXCEPTION 'Project limit reached for your % plan (% project(s)). Upgrade your plan to create more projects.',
      initcap(v_plan_code), v_project_limit
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_project_plan_limit_before_insert ON public.projects;
CREATE TRIGGER enforce_project_plan_limit_before_insert
BEFORE INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.enforce_project_plan_limit();

REVOKE ALL ON FUNCTION public.enforce_project_plan_limit() FROM PUBLIC, anon, authenticated;
