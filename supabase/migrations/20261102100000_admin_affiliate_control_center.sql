-- Phase 1: secure affiliate administration audit and payout references.
-- Additive only: existing withdrawal and commission records are preserved.
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS transaction_reference text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.admin_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_action_audit_created_idx
  ON public.admin_action_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_audit_admin_idx
  ON public.admin_action_audit (admin_user_id, created_at DESC);
ALTER TABLE public.admin_action_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_action_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_action_audit TO service_role;
