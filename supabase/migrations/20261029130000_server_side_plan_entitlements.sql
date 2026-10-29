-- Server-authoritative plan entitlements for premium capabilities.
-- Users cannot grant themselves paid plans or alter subscription entitlements directly.
DROP POLICY IF EXISTS "Users cancel own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users create own free subscription" ON public.subscriptions;

CREATE POLICY "Users create own free subscription" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'active'
    AND plan_id = (SELECT id FROM public.plans WHERE code = 'free' AND is_active = true LIMIT 1)
  );

-- Keep subscription writes admin/service-role only. Cancellation and upgrades must
-- go through trusted server-side functions; a client-side UPDATE is not allowed.
REVOKE UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;
REVOKE INSERT ON public.subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.user_has_plan_feature(_user_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limits jsonb;
  v_value jsonb;
  v_allowed boolean := false;
BEGIN
  IF _user_id IS NULL OR _feature_key IS NULL THEN
    RETURN false;
  END IF;

  IF _feature_key NOT IN (
    'ai_writer', 'ai_drawing', 'ai_insights', 'analytics', 'tender',
    'finance', 'procurement', 'team', 'export_excel', 'priority_support'
  ) THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  SELECT p.limits INTO v_limits
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = _user_id
    AND s.status IN ('active', 'trialing')
    AND (s.renewal_date IS NULL OR s.renewal_date > now())
    AND p.is_active = true
  LIMIT 1;

  IF v_limits IS NULL THEN
    SELECT p.limits INTO v_limits
    FROM public.plans p
    WHERE p.code = 'free' AND p.is_active = true
    LIMIT 1;
  END IF;

  v_value := COALESCE(v_limits, '{}'::jsonb) -> _feature_key;
  IF jsonb_typeof(v_value) = 'boolean' THEN
    v_allowed := v_value = 'true'::jsonb;
  ELSIF jsonb_typeof(v_value) = 'number' THEN
    BEGIN
      v_allowed := (v_value #>> '{}')::numeric <> 0;
    EXCEPTION WHEN others THEN
      v_allowed := false;
    END;
  END IF;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_plan_feature(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) TO service_role;
