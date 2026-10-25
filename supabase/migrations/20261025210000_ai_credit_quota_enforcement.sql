-- Server-authoritative monthly AI credit quota.
-- Each accepted AI request reserves one credit atomically against the caller's
-- current active plan. The browser cannot execute this function or write counters.

CREATE OR REPLACE FUNCTION public.consume_ai_credit(_user_id uuid)
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
  v_limit integer;
  v_used integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  v_period := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM');

  -- Administrators must be able to operate the system even without a paid
  -- subscription. Their usage is still recorded for visibility, with no cap.
  IF public.has_role(_user_id, 'admin'::public.app_role) THEN
    v_plan_code := 'admin';
    v_limit := -1;
  ELSE
    SELECT p.code, COALESCE(NULLIF(p.limits ->> 'ai_credits', '')::integer, 0)
      INTO v_plan_code, v_limit
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = _user_id
      AND s.status IN ('active', 'trialing')
      AND (s.renewal_date IS NULL OR s.renewal_date > v_now)
      AND p.is_active = true
    LIMIT 1;

    IF v_plan_code IS NULL THEN
      SELECT p.code, COALESCE(NULLIF(p.limits ->> 'ai_credits', '')::integer, 0)
        INTO v_plan_code, v_limit
      FROM public.plans p
      WHERE p.code = 'free' AND p.is_active = true
      LIMIT 1;
    END IF;

    IF v_plan_code IS NULL OR v_limit IS NULL THEN
      RAISE EXCEPTION 'Active Free plan with ai_credits limit is not configured';
    END IF;
  END IF;

  -- Create the monthly row, then lock it. Concurrent requests for this user
  -- serialize here before checking/incrementing the quota.
  INSERT INTO public.usage_records (user_id, period, ai_credits)
  VALUES (_user_id, v_period, 0)
  ON CONFLICT (user_id, period) DO NOTHING;

  SELECT ur.ai_credits INTO v_used
  FROM public.usage_records ur
  WHERE ur.user_id = _user_id AND ur.period = v_period
  FOR UPDATE;

  IF v_limit <> -1 AND v_used >= v_limit THEN
    RETURN QUERY SELECT false, 'quota'::text, v_used, v_limit, v_plan_code, v_period;
    RETURN;
  END IF;

  UPDATE public.usage_records
  SET ai_credits = ai_credits + 1, updated_at = v_now
  WHERE user_id = _user_id AND usage_records.period = v_period;

  RETURN QUERY SELECT true, NULL::text, v_used + 1, v_limit, v_plan_code, v_period;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid) TO service_role;
