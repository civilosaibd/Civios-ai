-- Phase 11: admin AI/product usage visibility. Existing counters only; no synthetic token/cost data.
CREATE TABLE IF NOT EXISTS public.admin_ai_usage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  period text NOT NULL,
  search_term text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_ai_usage_audit_created_at
  ON public.admin_ai_usage_audit(created_at DESC);
ALTER TABLE public.admin_ai_usage_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_ai_usage_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_ai_usage_audit TO service_role;

CREATE OR REPLACE FUNCTION public.admin_ai_usage_summary(_period text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  selected_period text := coalesce(_period, to_char(now(),'YYYY-MM'));
  result jsonb;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor,'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF selected_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Period must use YYYY-MM format' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_build_object(
    'period', selected_period,
    'accounts', count(DISTINCT user_id),
    'ai_credits', coalesce(sum(ai_credits),0),
    'projects', coalesce(sum(projects),0),
    'boq_generations', coalesce(sum(boq_generations),0),
    'bbs_generations', coalesce(sum(bbs_generations),0),
    'drawings', coalesce(sum(drawings),0),
    'reports', coalesce(sum(reports),0),
    'storage_mb', coalesce(sum(storage_mb),0)
  ) INTO result
  FROM public.usage_records WHERE period = selected_period;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_ai_usage_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_summary(text) TO authenticated, service_role;
