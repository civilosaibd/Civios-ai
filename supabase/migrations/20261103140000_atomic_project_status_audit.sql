-- Atomic privileged project status updates: the mutation and audit event commit together.
CREATE OR REPLACE FUNCTION public.admin_update_project_status(
  _project_id uuid,
  _status text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  current_row public.projects%ROWTYPE;
  changed_row public.projects%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT (
    public.has_role(actor, 'admin'::public.app_role)
    OR public.has_admin_permission('projects','manage')
  ) THEN
    RAISE EXCEPTION 'Projects: Manage permission required' USING ERRCODE = '42501';
  END IF;
  IF _status IS NULL OR _status NOT IN ('planning','in_progress','on_hold','completed','cancelled') THEN
    RAISE EXCEPTION 'Unsupported project status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_row
    FROM public.projects
   WHERE id = _project_id
   FOR UPDATE;
  IF current_row.id IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.projects
     SET status = _status, updated_at = now()
   WHERE id = _project_id
   RETURNING * INTO changed_row;

  -- Any audit failure aborts this transaction and rolls the project update back.
  INSERT INTO public.admin_project_access_audit(
    admin_user_id, project_id, action, details
  ) VALUES (
    actor, _project_id, 'update_project_status',
    jsonb_build_object(
      'previous_status', current_row.status,
      'new_status', changed_row.status
    )
  );

  RETURN jsonb_build_object(
    'id', changed_row.id,
    'user_id', changed_row.user_id,
    'name', changed_row.name,
    'status', changed_row.status,
    'updated_at', changed_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_project_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_project_status(uuid,text) TO authenticated;
