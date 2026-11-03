-- Project management privileged-access audit. Additive; no project data is modified.
CREATE TABLE IF NOT EXISTS public.admin_project_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('view_project_details','update_project_status')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_project_access_audit_project_time_idx
  ON public.admin_project_access_audit (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_project_access_audit_admin_time_idx
  ON public.admin_project_access_audit (admin_user_id, created_at DESC);
ALTER TABLE public.admin_project_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_project_access_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_project_access_audit TO service_role;
