-- Read-only/admin action audit trail for subscription and payment administration.
CREATE TABLE IF NOT EXISTS public.admin_billing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('view_billing', 'approve_payment', 'reject_payment')),
  result text NOT NULL CHECK (result IN ('succeeded', 'failed')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_billing_audit_created_idx ON public.admin_billing_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_billing_audit_target_idx ON public.admin_billing_audit (target_user_id, created_at DESC);
ALTER TABLE public.admin_billing_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_billing_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_billing_audit TO service_role;
