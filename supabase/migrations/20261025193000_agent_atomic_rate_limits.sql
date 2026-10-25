-- Atomic rolling-window limits for AI Agent requests.
-- The per-user lock row serializes concurrent requests across Edge Function instances.

CREATE TABLE IF NOT EXISTS public.agent_rate_limit_locks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  touched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS agent_rate_limit_events_user_created_idx
  ON public.agent_rate_limit_events (user_id, created_at DESC);

ALTER TABLE public.agent_rate_limit_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rate_limit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.agent_rate_limit_locks FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.agent_rate_limit_events FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.agent_rate_limit_locks TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.agent_rate_limit_events TO service_role;

CREATE OR REPLACE FUNCTION public.consume_agent_rate_limit(_user_id uuid)
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

  -- The upsert obtains a row-level lock held until this RPC transaction ends.
  INSERT INTO public.agent_rate_limit_locks (user_id, touched_at)
  VALUES (_user_id, v_now)
  ON CONFLICT (user_id) DO UPDATE SET touched_at = EXCLUDED.touched_at;

  DELETE FROM public.agent_rate_limit_events
  WHERE user_id = _user_id
    AND created_at < v_now - interval '24 hours';

  SELECT count(*)::integer INTO v_minute
  FROM public.agent_rate_limit_events
  WHERE user_id = _user_id
    AND created_at >= v_now - interval '1 minute';

  SELECT count(*)::integer INTO v_day
  FROM public.agent_rate_limit_events
  WHERE user_id = _user_id
    AND created_at >= v_now - interval '24 hours';

  IF v_minute >= 5 THEN
    RETURN QUERY SELECT false, 'minute'::text, v_minute, v_day;
    RETURN;
  END IF;
  IF v_day >= 40 THEN
    RETURN QUERY SELECT false, 'day'::text, v_minute, v_day;
    RETURN;
  END IF;

  INSERT INTO public.agent_rate_limit_events (user_id, created_at)
  VALUES (_user_id, v_now);

  RETURN QUERY SELECT true, NULL::text, v_minute + 1, v_day + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_agent_rate_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_agent_rate_limit(uuid) TO service_role;
