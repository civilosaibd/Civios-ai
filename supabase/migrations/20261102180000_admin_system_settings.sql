-- Narrow, audited controls for admin-managed visualization upload limits.
-- Affiliate commission rates are intentionally exposed read-only in this phase.
CREATE TABLE IF NOT EXISTS public.admin_system_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  setting_group text NOT NULL CHECK (setting_group = 'visualization_upload_limits'),
  old_values jsonb NOT NULL,
  new_values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_system_settings_audit_created_idx
  ON public.admin_system_settings_audit (created_at DESC);
ALTER TABLE public.admin_system_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_system_settings_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_system_settings_audit TO service_role;

CREATE OR REPLACE FUNCTION public.admin_read_system_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  max_file_mb integer;
  max_files integer;
  first_rate numeric;
  next_rate numeric;
  can_manage boolean;
BEGIN
  IF caller_id IS NULL OR NOT (
    public.has_role(caller_id, 'admin'::public.app_role)
    OR public.has_admin_permission('settings','view')
  ) THEN
    RAISE EXCEPTION 'Settings: View permission required' USING ERRCODE = '42501';
  END IF;
  can_manage := public.has_role(caller_id, 'admin'::public.app_role) OR public.is_super_admin() OR public.has_admin_permission('settings','manage');
  SELECT coalesce((value #>> '{}')::integer, 25) INTO max_file_mb
    FROM public.app_settings WHERE key = 'viz.max_file_mb';
  SELECT coalesce((value #>> '{}')::integer, 10) INTO max_files
    FROM public.app_settings WHERE key = 'viz.max_files';
  SELECT coalesce((value #>> '{}')::numeric, 0.30) INTO first_rate
    FROM public.app_settings WHERE key = 'affiliate.first_payment_commission_rate';
  SELECT coalesce((value #>> '{}')::numeric, 0.10) INTO next_rate
    FROM public.app_settings WHERE key = 'affiliate.commission_rate';
  RETURN jsonb_build_object(
    'visualization', jsonb_build_object(
      'max_file_mb', coalesce(max_file_mb,25),
      'max_files', coalesce(max_files,10)
    ),
    'affiliate', jsonb_build_object(
      'first_payment_rate', coalesce(first_rate,0.30),
      'subsequent_payment_rate', coalesce(next_rate,0.10),
      'editable', false
    ),
    'can_manage', can_manage
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_visualization_limits(_max_file_mb integer, _max_files integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  old_values jsonb;
  new_values jsonb;
BEGIN
  IF caller_id IS NULL OR NOT (
    public.has_role(caller_id, 'admin'::public.app_role)
    OR public.is_super_admin()
    OR public.has_admin_permission('settings','manage')
  ) THEN
    RAISE EXCEPTION 'Settings: Manage permission required' USING ERRCODE = '42501';
  END IF;
  IF _max_file_mb IS NULL OR _max_file_mb < 1 OR _max_file_mb > 50
     OR _max_files IS NULL OR _max_files < 1 OR _max_files > 20 THEN
    RAISE EXCEPTION 'Limits out of range: file size must be 1–50 MB and file count 1–20' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'max_file_mb', coalesce((SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key='viz.max_file_mb'),25),
    'max_files', coalesce((SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key='viz.max_files'),10)
  ) INTO old_values;
  new_values := jsonb_build_object('max_file_mb',_max_file_mb,'max_files',_max_files);

  INSERT INTO public.app_settings(key,value,updated_at,updated_by)
  VALUES
    ('viz.max_file_mb', to_jsonb(_max_file_mb), now(), caller_id),
    ('viz.max_files', to_jsonb(_max_files), now(), caller_id)
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=caller_id;

  INSERT INTO public.admin_system_settings_audit(admin_user_id,setting_group,old_values,new_values)
  VALUES (caller_id,'visualization_upload_limits',old_values,new_values);
  RETURN new_values;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_read_system_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_visualization_limits(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_read_system_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_visualization_limits(integer,integer) TO authenticated, service_role;
