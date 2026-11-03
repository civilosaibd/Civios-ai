-- Affiliate engagement analytics. These are product-recorded actions, not proof of
-- an external social post or a verified unique human visitor. Link clicks are
-- deduplicated by a browser-session event ID; in-app share controls record actions.
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
