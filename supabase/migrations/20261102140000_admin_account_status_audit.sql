-- Dedicated audit trail for administrative account suspension/reactivation.
CREATE TABLE IF NOT EXISTS public.admin_account_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('suspend_account', 'reactivate_account')),
  result text NOT NULL CHECK (result IN ('requested', 'succeeded', 'failed')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_account_status_audit_created_idx
  ON public.admin_account_status_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_account_status_audit_target_idx
  ON public.admin_account_status_audit (target_user_id, created_at DESC);
ALTER TABLE public.admin_account_status_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_account_status_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_account_status_audit TO service_role;
