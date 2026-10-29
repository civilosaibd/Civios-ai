-- Atomically enforce AI credits plus feature-specific monthly generation quotas.
-- Replaces the earlier one-argument function; the second argument is optional
-- for existing callers and is restricted to known usage counter columns.
DROP FUNCTION IF EXISTS public.consume_ai_credit(uuid);

CREATE OR REPLACE FUNCTION public.consume_ai_credit(
  _user_id uuid,
  _quota_key text DEFAULT NULL
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  used integer,
  quota integer,
  plan_code text,
  usage_period text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_period text;
  v_plan_code text;
  v_limits jsonb;
  v_ai_limit integer;
  v_ai_used integer;
  v_feature_key text;
  v_feature_limit integer;
  v_feature_used integer;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'User id is required'; END IF;
  IF _quota_key IS NOT NULL AND _quota_key NOT IN ('boq_generations', 'bbs_generations', 'drawings', 'reports') THEN
    RAISE EXCEPTION 'Unsupported quota key';
  END IF;

  v_period := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM');

  IF public.has_role(_user_id, 'admin'::public.app_role) THEN
    v_plan_code := 'admin';
    v_ai_limit := -1;
    v_feature_limit := -1;
  ELSE
    SELECT p.code, p.limits
      INTO v_plan_code, v_limits
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = _user_id
      AND s.status IN ('active', 'trialing')
      AND (s.renewal_date IS NULL OR s.renewal_date > v_now)
      AND p.is_active = true
    LIMIT 1;

    IF v_plan_code IS NULL THEN
      SELECT p.code, p.limits
        INTO v_plan_code, v_limits
      FROM public.plans p
      WHERE p.code = 'free' AND p.is_active = true
      LIMIT 1;
    END IF;

    IF v_plan_code IS NULL OR v_limits IS NULL THEN
      RAISE EXCEPTION 'Active Free plan is not configured';
    END IF;

    v_ai_limit := COALESCE(NULLIF(v_limits ->> 'ai_credits', '')::integer, 0);
    v_feature_key := CASE _quota_key
      WHEN 'boq_generations' THEN 'boq'
      WHEN 'bbs_generations' THEN 'bbs'
      WHEN 'drawings' THEN 'drawings'
      WHEN 'reports' THEN 'reports'
      ELSE NULL
    END;
    IF v_feature_key IS NOT NULL THEN
      v_feature_limit := COALESCE(NULLIF(v_limits ->> v_feature_key, '')::integer, 0);
    END IF;
  END IF;

  INSERT INTO public.usage_records (user_id, period, ai_credits)
  VALUES (_user_id, v_period, 0)
  ON CONFLICT (user_id, period) DO NOTHING;

  SELECT ur.ai_credits, ur.boq_generations, ur.bbs_generations, ur.drawings, ur.reports
    INTO v_ai_used, v_feature_used, v_feature_used, v_feature_used, v_feature_used
  FROM public.usage_records ur
  WHERE ur.user_id = _user_id AND ur.period = v_period
  FOR UPDATE;

  IF v_ai_limit <> -1 AND v_ai_used >= v_ai_limit THEN
    RETURN QUERY SELECT false, 'ai_credits'::text, v_ai_used, v_ai_limit, v_plan_code, v_period;
    RETURN;
  END IF;

  IF _quota_key IS NOT NULL THEN
    SELECT CASE _quota_key
      WHEN 'boq_generations' THEN ur.boq_generations
      WHEN 'bbs_generations' THEN ur.bbs_generations
      WHEN 'drawings' THEN ur.drawings
      WHEN 'reports' THEN ur.reports
      ELSE 0
    END INTO v_feature_used
    FROM public.usage_records ur
    WHERE ur.user_id = _user_id AND ur.period = v_period;

    IF v_feature_limit <> -1 AND v_feature_used >= v_feature_limit THEN
      RETURN QUERY SELECT false, _quota_key, v_feature_used, v_feature_limit, v_plan_code, v_period;
      RETURN;
    END IF;
  END IF;

  UPDATE public.usage_records
  SET ai_credits = ai_credits + 1,
      boq_generations = boq_generations + CASE WHEN _quota_key = 'boq_generations' THEN 1 ELSE 0 END,
      bbs_generations = bbs_generations + CASE WHEN _quota_key = 'bbs_generations' THEN 1 ELSE 0 END,
      drawings = drawings + CASE WHEN _quota_key = 'drawings' THEN 1 ELSE 0 END,
      reports = reports + CASE WHEN _quota_key = 'reports' THEN 1 ELSE 0 END,
      updated_at = v_now
  WHERE user_id = _user_id AND period = v_period;

  RETURN QUERY SELECT true, COALESCE(_quota_key, 'ai_credits'), v_ai_used + 1, v_ai_limit, v_plan_code, v_period;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, text) TO service_role;
