-- Phase 9: complete server-side workflows on the existing Super Admin RBAC foundation.
-- The first sub-admin feature is the Users workspace; additional feature guards are
-- rolled out module-by-module before other permissions are exposed.
CREATE TABLE IF NOT EXISTS public.admin_account_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('suspend_account','reactivate_account')),
  result text NOT NULL CHECK (result IN ('requested','succeeded','failed')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_account_status_audit_created_idx
  ON public.admin_account_status_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_account_status_audit_target_idx
  ON public.admin_account_status_audit(target_user_id,created_at DESC);
ALTER TABLE public.admin_account_status_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_account_status_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_account_status_audit TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_subadmin_permissions(_membership_id uuid, _actions text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  target public.admin_memberships%ROWTYPE;
  old_actions text[];
  new_actions text[];
  permission_item text;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.admin_memberships WHERE id = _membership_id FOR UPDATE;
  IF target.id IS NULL OR target.role <> 'sub_admin' THEN
    RAISE EXCEPTION 'Sub-admin membership not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT coalesce(array_agg(action ORDER BY action), ARRAY[]::text[])
    INTO old_actions FROM public.admin_feature_permissions
    WHERE membership_id = _membership_id AND feature_key = 'users';
  SELECT coalesce(array_agg(DISTINCT action ORDER BY action), ARRAY[]::text[])
    INTO new_actions FROM unnest(coalesce(_actions, ARRAY[]::text[])) AS action
    WHERE action IN ('view','manage');
  IF 'manage' = ANY(new_actions) AND NOT ('view' = ANY(new_actions)) THEN
    new_actions := array_append(new_actions,'view');
  END IF;
  IF cardinality(coalesce(_actions, ARRAY[]::text[])) <> cardinality((
       SELECT array_agg(DISTINCT a) FROM unnest(coalesce(_actions, ARRAY[]::text[])) AS a
       WHERE a IN ('view','manage')
     ))
     AND cardinality(coalesce(_actions, ARRAY[]::text[])) <> 0 THEN
    RAISE EXCEPTION 'Only users.view and users.manage are currently supported' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.admin_feature_permissions
    WHERE membership_id = _membership_id AND feature_key = 'users';
  INSERT INTO public.admin_feature_permissions(membership_id,feature_key,action,granted_by)
    SELECT _membership_id,'users',action,actor FROM unnest(new_actions) AS action;

  FOREACH permission_item IN ARRAY old_actions LOOP
    IF NOT (permission_item = ANY(new_actions)) THEN
      INSERT INTO public.admin_rbac_audit(actor_user_id,target_user_id,action,feature_key,permission_action,metadata)
      VALUES (actor,target.user_id,'permission_revoked','users',permission_item,jsonb_build_object('actions',to_jsonb(new_actions)));
    END IF;
  END LOOP;
  FOREACH permission_item IN ARRAY new_actions LOOP
    IF NOT (permission_item = ANY(old_actions)) THEN
      INSERT INTO public.admin_rbac_audit(actor_user_id,target_user_id,action,feature_key,permission_action,metadata)
      VALUES (actor,target.user_id,'permission_granted','users',permission_item,jsonb_build_object('previous_actions',to_jsonb(old_actions)));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('membership_id',_membership_id,'feature_key','users','actions',to_jsonb(new_actions));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_subadmin_status(_membership_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  target public.admin_memberships%ROWTYPE;
  audit_action text;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin access required' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'Invalid sub-admin status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO target FROM public.admin_memberships WHERE id = _membership_id FOR UPDATE;
  IF target.id IS NULL OR target.role <> 'sub_admin' THEN
    RAISE EXCEPTION 'Sub-admin membership not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.admin_memberships SET status = _status, updated_at = now() WHERE id = _membership_id;
  audit_action := CASE WHEN _status = 'suspended' THEN 'sub_admin_suspended' ELSE 'sub_admin_activated' END;
  INSERT INTO public.admin_rbac_audit(actor_user_id,target_user_id,action,metadata)
  VALUES (actor,target.user_id,audit_action,jsonb_build_object('previous_status',target.status,'new_status',_status));
  RETURN jsonb_build_object('membership_id',_membership_id,'status',_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_subadmin(_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  target public.admin_memberships%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.admin_memberships WHERE id = _membership_id FOR UPDATE;
  IF target.id IS NULL OR target.role <> 'sub_admin' THEN
    RAISE EXCEPTION 'Sub-admin membership not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.admin_rbac_audit(actor_user_id,target_user_id,action,metadata)
  VALUES (actor,target.user_id,'sub_admin_removed',jsonb_build_object('previous_status',target.status));
  DELETE FROM public.admin_memberships WHERE id = _membership_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_accept_invitation(_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_email text := lower(trim(auth.jwt() ->> 'email'));
  invitation public.admin_invitations%ROWTYPE;
  membership_id uuid;
BEGIN
  IF caller IS NULL OR caller_email IS NULL OR length(caller_email) = 0 THEN
    RAISE EXCEPTION 'Sign in with the invited email address first' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO invitation FROM public.admin_invitations
    WHERE token_hash = _token_hash FOR UPDATE;
  IF invitation.id IS NULL OR invitation.status <> 'pending' OR invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation is invalid, revoked, or expired' USING ERRCODE = '22023';
  END IF;
  IF lower(trim(invitation.invited_email)) <> caller_email THEN
    RAISE EXCEPTION 'This invitation belongs to another email address' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(caller,'admin'::public.app_role) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Legacy full-admin accounts cannot accept sub-admin invitations' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.admin_memberships(user_id,role,status,assigned_by)
    VALUES (caller,'sub_admin','active',invitation.invited_by)
    ON CONFLICT (user_id) DO UPDATE
      SET role = CASE WHEN public.admin_memberships.role = 'super_admin' THEN 'super_admin' ELSE 'sub_admin' END,
          status = CASE WHEN public.admin_memberships.role = 'super_admin' THEN public.admin_memberships.status ELSE 'active' END,
          assigned_by = CASE WHEN public.admin_memberships.role = 'super_admin' THEN public.admin_memberships.assigned_by ELSE EXCLUDED.assigned_by END,
          updated_at = now()
    RETURNING id INTO membership_id;
  UPDATE public.admin_invitations SET status = 'accepted', accepted_user_id = caller, accepted_at = now()
    WHERE id = invitation.id;
  INSERT INTO public.admin_rbac_audit(actor_user_id,target_user_id,action,metadata)
    VALUES (caller,caller,'sub_admin_activated',jsonb_build_object('invitation_id',invitation.id,'invited_by',invitation.invited_by));
  RETURN jsonb_build_object('membership_id',membership_id,'status','active');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_subadmin_permissions(uuid,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subadmin_status(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_subadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_permissions(uuid,text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_status(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_subadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_accept_invitation(text) TO authenticated, service_role;
