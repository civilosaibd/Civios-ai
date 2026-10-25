-- Harden public SECURITY DEFINER helper RPCs against caller-selected identity probing.
-- These functions remain available to RLS policies, but signed-in callers can only
-- query authorization for their own auth.uid(). Service-role backend calls that do
-- not carry an end-user JWT retain their server-side behavior.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN auth.users au ON au.id = ur.user_id
      WHERE ur.user_id = _user_id
        AND ur.role = _role
        AND (
          _role <> 'admin'::public.app_role
          OR lower(trim(au.email)) IN ('zobaerio24@gmail.com', 'zobaerhasan431@gmail.com')
        )
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.get_project_role(_project_id uuid, _user_id uuid)
RETURNS public.project_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid()
      THEN NULL::public.project_role
    ELSE (
      SELECT pm.role
      FROM public.project_members AS pm
      WHERE pm.project_id = _project_id
        AND pm.user_id = _user_id
        AND pm.status = 'accepted'
      UNION ALL
      SELECT 'admin'::public.project_role
      FROM public.projects AS p
      WHERE p.id = _project_id AND p.user_id = _user_id
      LIMIT 1
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.get_project_role(_project_id, _user_id) IS NOT NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.viz_role(_viz uuid, _user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user IS DISTINCT FROM auth.uid() THEN NULL::text
    ELSE (
      SELECT CASE
        WHEN v.user_id = _user THEN 'owner'
        WHEN v.project_id IS NOT NULL THEN public.get_project_role(v.project_id, _user)::text
        ELSE NULL::text
      END
      FROM public.construction_visualizations AS v
      WHERE v.id = _viz
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.viz_can_read(_viz uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user IS DISTINCT FROM auth.uid() THEN false
    ELSE public.viz_role(_viz, _user) IS NOT NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.viz_can_write(_viz uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user IS DISTINCT FROM auth.uid() THEN false
    ELSE coalesce(public.viz_role(_viz, _user) IN ('owner', 'admin', 'engineer'), false)
  END
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_project_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_role(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.viz_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viz_role(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.viz_can_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viz_can_read(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.viz_can_write(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viz_can_write(uuid, uuid) TO authenticated, service_role;
