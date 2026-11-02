-- Phase 1 follow-up: real, deduplicated affiliate traffic events.
-- Link visits and share-button actions are recorded separately; external share completion is not observable.
CREATE TABLE IF NOT EXISTS public.referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('link_click','share_action')),
  source text NOT NULL DEFAULT 'unknown' CHECK (length(source) BETWEEN 1 AND 32),
  session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id,event_type,session_id,source)
);
CREATE INDEX IF NOT EXISTS referral_events_referrer_created_idx
  ON public.referral_events(referrer_id,created_at DESC);
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.referral_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_referral_event(
  _referral_code text,
  _event_type text,
  _session_id uuid,
  _source text DEFAULT 'unknown'
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  referrer uuid;
  event_source text := left(trim(coalesce(_source,'unknown')),32);
  inserted_count integer;
BEGIN
  IF _event_type IS NULL OR _event_type NOT IN ('link_click','share_action') THEN
    RAISE EXCEPTION 'Unsupported referral event type' USING ERRCODE='22023';
  END IF;
  IF _session_id IS NULL THEN
    RAISE EXCEPTION 'A browser session identifier is required' USING ERRCODE='22023';
  END IF;
  IF _referral_code IS NULL OR length(trim(_referral_code)) NOT BETWEEN 4 AND 32
     OR trim(_referral_code) !~ '^[A-Za-z0-9-]+$' THEN
    RAISE EXCEPTION 'Invalid referral code' USING ERRCODE='22023';
  END IF;
  SELECT id INTO referrer FROM public.profiles
    WHERE upper(referral_code)=upper(trim(_referral_code)) LIMIT 1;
  IF referrer IS NULL THEN RETURN false; END IF;
  IF auth.uid()=referrer THEN RETURN false; END IF;
  IF _event_type='share_action' AND auth.uid() IS DISTINCT FROM referrer THEN
    RAISE EXCEPTION 'Only the referral owner can record a share action' USING ERRCODE='42501';
  END IF;
  IF event_source='' THEN event_source:='unknown'; END IF;
  INSERT INTO public.referral_events(referrer_id,event_type,source,session_id)
    VALUES(referrer,_event_type,event_source,_session_id)
    ON CONFLICT(referrer_id,event_type,session_id,source) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.record_referral_event(text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_referral_event(text,text,uuid,text) TO anon,authenticated;
