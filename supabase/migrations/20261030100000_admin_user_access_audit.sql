-- Admin access audit trail for privileged user-data inspection.
CREATE TABLE IF NOT EXISTS public.admin_user_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('view_user_details')),
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_user_access_audit_admin_time_idx
  ON public.admin_user_access_audit (admin_user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS admin_user_access_audit_target_time_idx
  ON public.admin_user_access_audit (target_user_id, accessed_at DESC);
ALTER TABLE public.admin_user_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_user_access_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_user_access_audit TO service_role;
