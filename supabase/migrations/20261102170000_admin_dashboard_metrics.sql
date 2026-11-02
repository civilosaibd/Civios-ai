-- Central admin business metrics. Aggregates are computed in PostgreSQL to avoid
-- downloading entire payment, subscription, project, or usage tables to the browser.
CREATE TABLE IF NOT EXISTS public.admin_dashboard_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_dashboard_access_audit_created_idx
  ON public.admin_dashboard_access_audit (created_at DESC);
ALTER TABLE public.admin_dashboard_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_dashboard_access_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_dashboard_access_audit TO service_role;

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  result jsonb;
BEGIN
  IF caller_id IS NULL OR NOT public.has_role(caller_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to <= _from OR _to - _from > interval '366 days' THEN
    RAISE EXCEPTION 'Invalid reporting period (maximum 366 days)' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'period_start', _from,
    'period_end', _to,
    'users_new', (SELECT count(*) FROM public.profiles WHERE created_at >= _from AND created_at < _to),
    'users_total', (SELECT count(*) FROM public.profiles),
    'projects_new', (SELECT count(*) FROM public.projects WHERE created_at >= _from AND created_at < _to),
    'projects_total', (SELECT count(*) FROM public.projects),
    'subscriptions_new', (SELECT count(*) FROM public.subscriptions WHERE created_at >= _from AND created_at < _to),
    'subscriptions_active', (SELECT count(*) FROM public.subscriptions WHERE status IN ('active','trialing')),
    'payments_new', (SELECT count(*) FROM public.payments WHERE created_at >= _from AND created_at < _to),
    'payments_pending', (SELECT count(*) FROM public.payments WHERE status = 'pending'),
    'payments_verified', (SELECT count(*) FROM public.payments WHERE status = 'verified' AND verified_at >= _from AND verified_at < _to),
    'payments_failed', (SELECT count(*) FROM public.payments WHERE status = 'failed' AND updated_at >= _from AND updated_at < _to),
    'verified_payment_total_bdt', (SELECT coalesce(sum(amount),0) FROM public.payments WHERE status = 'verified' AND currency = 'BDT' AND verified_at >= _from AND verified_at < _to),
    'referrals_new', (SELECT count(*) FROM public.referrals WHERE created_at >= _from AND created_at < _to),
    'referrals_converted', (SELECT count(*) FROM public.referrals WHERE status = 'converted' AND created_at >= _from AND created_at < _to),
    'commissions_approved_bdt', (SELECT coalesce(sum(commission_amount),0) FROM public.referral_commissions WHERE status = 'approved' AND created_at >= _from AND created_at < _to),
    'withdrawals_pending', (SELECT count(*) FROM public.withdrawals WHERE status IN ('pending','approved')),
    'withdrawals_paid_bdt', (SELECT coalesce(sum(amount),0) FROM public.withdrawals WHERE status = 'paid' AND paid_at >= _from AND paid_at < _to),
    'ai_usage_records', (SELECT count(*) FROM public.usage_records WHERE period = to_char(_from AT TIME ZONE 'UTC', 'YYYY-MM'))
  ) INTO result;

  INSERT INTO public.admin_dashboard_access_audit(admin_user_id, period_start, period_end)
  VALUES (caller_id, _from, _to);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics(timestamptz, timestamptz) TO authenticated, service_role;
