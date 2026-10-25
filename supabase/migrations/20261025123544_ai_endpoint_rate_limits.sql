-- Per-user, per-endpoint rolling limits for expensive AI operations.
-- A composite lock row serializes concurrent calls for the same user and endpoint.

CREATE TABLE IF NOT EXISTS public.ai_endpoint_rate_limit_locks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (endpoint IN ('ai-analyze', 'ai-chat', 'ai-structured', 'defect-detect', 'viz-analyze')),
  touched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS public.ai_endpoint_rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (endpoint IN ('ai-analyze', 'ai-chat', 'ai-structured', 'defect-detect', 'viz-analyze')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS ai_endpoint_rate_limit_events_user_endpoint_created_idx
  ON public.ai_endpoint_rate_limit_events (user_id, endpoint, created_at DESC);

ALTER TABLE public.ai_endpoint_rate_limit_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_endpoint_rate_limit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.ai_endpoint_rate_limit_locks FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.ai_endpoint_rate_limit_events FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.ai_endpoint_rate_limit_locks TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.ai_endpoint_rate_limit_events TO service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_endpoint_rate_limit(_user_id uuid, _endpoint text)
RETURNS TABLE (allowed boolean, reason text, minute_count integer, day_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_minute integer;
  v_day integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;
  IF _endpoint IS NULL OR _endpoint NOT IN ('ai-analyze', 'ai-chat', 'ai-structured', 'defect-detect', 'viz-analyze') THEN
    RAISE EXCEPTION 'Unsupported AI endpoint';
  END IF;

  INSERT INTO public.ai_endpoint_rate_limit_locks (user_id, endpoint, touched_at)
  VALUES (_user_id, _endpoint, v_now)
  ON CONFLICT (user_id, endpoint) DO UPDATE SET touched_at = EXCLUDED.touched_at;

  DELETE FROM public.ai_endpoint_rate_limit_events
  WHERE user_id = _user_id AND endpoint = _endpoint
    AND created_at < v_now - interval '24 hours';

  SELECT count(*)::integer INTO v_minute
  FROM public.ai_endpoint_rate_limit_events
  WHERE user_id = _user_id AND endpoint = _endpoint
    AND created_at >= v_now - interval '1 minute';

  SELECT count(*)::integer INTO v_day
  FROM public.ai_endpoint_rate_limit_events
  WHERE user_id = _user_id AND endpoint = _endpoint
    AND created_at >= v_now - interval '24 hours';

  IF v_minute >= 10 THEN
    RETURN QUERY SELECT false, 'minute'::text, v_minute, v_day;
    RETURN;
  END IF;
  IF v_day >= 100 THEN
    RETURN QUERY SELECT false, 'day'::text, v_minute, v_day;
    RETURN;
  END IF;

  INSERT INTO public.ai_endpoint_rate_limit_events (user_id, endpoint, created_at)
  VALUES (_user_id, _endpoint, v_now);
  RETURN QUERY SELECT true, NULL::text, v_minute + 1, v_day + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_endpoint_rate_limit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_endpoint_rate_limit(uuid, text) TO service_role;
