-- Affiliate engagement analytics. These are product-recorded actions, not proof of
-- an external social post or a human visitor. One link click is counted per browser
-- session and referral code; share actions are counted when an in-app share control is used.
CREATE TABLE IF NOT EXISTS public.referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('share_action', 'link_click')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_events_referrer_type_time_idx
  ON public.referral_events (referrer_id, event_type, created_at DESC);
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_events TO service_role;

CREATE OR REPLACE FUNCTION public.track_referral_event(
  _referral_code text,
  _event_type text,
  _event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  owner_id uuid;
BEGIN
  IF _event_type NOT IN ('share_action', 'link_click') OR _event_id IS NULL THEN
    RETURN false;
  END IF;
  IF coalesce(length(trim(_referral_code)), 0) < 4 OR length(trim(_referral_code)) > 32 THEN
    RETURN false;
  END IF;

  SELECT id INTO owner_id
  FROM public.profiles
  WHERE upper(referral_code) = upper(trim(_referral_code))
  LIMIT 1;
  IF owner_id IS NULL THEN RETURN false; END IF;

  -- Share actions must be performed by the account that owns the referral code.
  IF _event_type = 'share_action' AND auth.uid() IS DISTINCT FROM owner_id THEN
    RETURN false;
  END IF;

  INSERT INTO public.referral_events (event_id, referrer_id, event_type)
  VALUES (_event_id, owner_id, _event_type)
  ON CONFLICT (event_id) DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.track_referral_event(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_referral_event(text, text, uuid) TO anon, authenticated;
