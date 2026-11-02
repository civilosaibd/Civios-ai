-- Allow IndoCAD's dedicated AI floor-plan endpoint through the existing per-user limiter.
ALTER TABLE public.ai_endpoint_rate_limit_locks
  DROP CONSTRAINT IF EXISTS ai_endpoint_rate_limit_locks_endpoint_check;
ALTER TABLE public.ai_endpoint_rate_limit_locks
  ADD CONSTRAINT ai_endpoint_rate_limit_locks_endpoint_check
  CHECK (endpoint IN ('ai-analyze', 'ai-chat', 'ai-structured', 'ai-floorplan', 'defect-detect', 'viz-analyze'));

ALTER TABLE public.ai_endpoint_rate_limit_events
  DROP CONSTRAINT IF EXISTS ai_endpoint_rate_limit_events_endpoint_check;
ALTER TABLE public.ai_endpoint_rate_limit_events
  ADD CONSTRAINT ai_endpoint_rate_limit_events_endpoint_check
  CHECK (endpoint IN ('ai-analyze', 'ai-chat', 'ai-structured', 'ai-floorplan', 'defect-detect', 'viz-analyze'));

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
  IF _endpoint IS NULL OR _endpoint NOT IN ('ai-analyze', 'ai-chat', 'ai-structured', 'ai-floorplan', 'defect-detect', 'viz-analyze') THEN
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
