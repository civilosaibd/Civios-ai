-- Service-role-only audit trail for administrator AI quota-usage inspections.
CREATE TABLE IF NOT EXISTS public.admin_ai_usage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  period text,
  action text NOT NULL CHECK (action IN ('list_ai_usage', 'inspect_ai_usage')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_ai_usage_audit_created_idx ON public.admin_ai_usage_audit (created_at DESC);
ALTER TABLE public.admin_ai_usage_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_ai_usage_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_ai_usage_audit TO service_role;
