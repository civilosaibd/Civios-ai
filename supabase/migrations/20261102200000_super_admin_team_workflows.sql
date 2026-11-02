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
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(_actions, ARRAY[]::text[])) AS requested(action)
    WHERE action NOT IN ('view','manage')
  ) THEN
    RAISE EXCEPTION 'Only users.view and users.manage permissions are currently supported' USING ERRCODE = '22023';
  END IF;
  IF cardinality(coalesce(_actions, ARRAY[]::text[])) <>
     cardinality(ARRAY(SELECT DISTINCT action FROM unnest(coalesce(_actions, ARRAY[]::text[])) AS requested(action))) THEN
    RAISE EXCEPTION 'Duplicate permission actions are not allowed' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(action ORDER BY action), ARRAY[]::text[])
    INTO new_actions FROM unnest(coalesce(_actions, ARRAY[]::text[])) AS requested(action);
  IF 'manage' = ANY(new_actions) AND NOT ('view' = ANY(new_actions)) THEN
    new_actions := array_append(new_actions,'view');
  END IF;

  DELETE FROM public.admin_feature_permissions
    WHERE membership_id = _membership_id AND feature_key = 'users';
  INSERT INTO public.admin_feature_permissions(membership_id,feature_key,action,granted_by)
    SELECT _membership_id,'users',permission_action,actor FROM unnest(new_actions) AS permissions(permission_action);

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
  IF _status IS NULL OR _status NOT IN ('active','suspended') THEN
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
  caller_email text;
  caller_email_confirmed_at timestamptz;
  invitation public.admin_invitations%ROWTYPE;
  membership_id uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Sign in with the invited email address first' USING ERRCODE = '42501';
  END IF;
  SELECT lower(trim(email)), email_confirmed_at
    INTO caller_email, caller_email_confirmed_at
    FROM auth.users WHERE id = caller;
  IF caller_email IS NULL OR length(caller_email) = 0 OR caller_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'A verified email address is required to accept an admin invitation' USING ERRCODE = '42501';
  END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64} FROM public.admin_invitations
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


CREATE OR REPLACE FUNCTION public.admin_create_invitation(_email text, _token_hash text, _expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $
DECLARE
  actor uuid := auth.uid();
  normalized_email text := lower(trim(_email));
  invitation public.admin_invitations%ROWTYPE;
  existing_user uuid;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin access required' USING ERRCODE = '42501';
  END IF;
  IF normalized_email IS NULL OR length(normalized_email) NOT BETWEEN 5 AND 320
     OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+(uuid,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subadmin_status(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_subadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_accept_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_invitation(text,text,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_permissions(uuid,text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_status(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_subadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_accept_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_invitation(text,text,timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_invitation(uuid) TO authenticated, service_role;
 THEN
    RAISE EXCEPTION 'Invitation token is invalid' USING ERRCODE = '22023';
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
 THEN
    RAISE EXCEPTION 'Invalid invitation email address' USING ERRCODE = '22023';
  END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}(uuid,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subadmin_status(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_subadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_permissions(uuid,text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_status(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_subadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_accept_invitation(text) TO authenticated, service_role;
 THEN
    RAISE EXCEPTION 'Invitation token is invalid' USING ERRCODE = '22023';
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
 THEN
    RAISE EXCEPTION 'Invalid invitation token hash' USING ERRCODE = '22023';
  END IF;
  IF _expires_at IS NULL OR _expires_at <= now() OR _expires_at > now() + interval '8 days' THEN
    RAISE EXCEPTION 'Invitation expiry must be within the next eight days' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO existing_user FROM auth.users WHERE lower(trim(email)) = normalized_email LIMIT 1;
  IF existing_user IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = existing_user AND role = 'admin'::public.app_role)
       AND NOT EXISTS (SELECT 1 FROM public.admin_memberships WHERE user_id = existing_user AND role = 'super_admin') THEN
      RAISE EXCEPTION 'Legacy full-admin accounts cannot be converted into sub-admin invitations' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admin_memberships WHERE user_id = existing_user AND role = 'super_admin') THEN
      RAISE EXCEPTION 'This account is already a Super Admin' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admin_memberships WHERE user_id = existing_user AND status = 'active') THEN
      RAISE EXCEPTION 'This account already has active admin access' USING ERRCODE = '23505';
    END IF;
  END IF;

  WITH revoked AS (
    UPDATE public.admin_invitations SET status = 'revoked'
      WHERE lower(invited_email) = normalized_email AND status = 'pending'
      RETURNING id,invited_email
  )
  INSERT INTO public.admin_rbac_audit(actor_user_id,action,metadata)
    SELECT actor,'invite_revoked',jsonb_build_object('invitation_id',id,'invited_email',invited_email,'reason','replaced_by_new_invitation')
    FROM revoked;
  INSERT INTO public.admin_invitations(invited_email,invited_by,role,status,token_hash,expires_at)
    VALUES (normalized_email,actor,'sub_admin','pending',_token_hash,_expires_at)
    RETURNING * INTO invitation;
  INSERT INTO public.admin_rbac_audit(actor_user_id,action,metadata)
    VALUES (actor,'invite_created',jsonb_build_object('invitation_id',invitation.id,'invited_email',normalized_email));
  RETURN jsonb_build_object('id',invitation.id,'invited_email',invitation.invited_email,'expires_at',invitation.expires_at,'status',invitation.status);
END;
$;

CREATE OR REPLACE FUNCTION public.admin_revoke_invitation(_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $
DECLARE
  actor uuid := auth.uid();
  invitation public.admin_invitations%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.admin_invitations SET status = 'revoked'
    WHERE id = _invitation_id AND status = 'pending'
    RETURNING * INTO invitation;
  IF invitation.id IS NULL THEN
    RAISE EXCEPTION 'Pending invitation not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.admin_rbac_audit(actor_user_id,action,metadata)
    VALUES (actor,'invite_revoked',jsonb_build_object('invitation_id',invitation.id,'invited_email',invitation.invited_email));
  RETURN true;
END;
$;

REVOKE ALL ON FUNCTION public.admin_set_subadmin_permissions(uuid,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subadmin_status(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_subadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_permissions(uuid,text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_subadmin_status(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_subadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_accept_invitation(text) TO authenticated, service_role;
 THEN
    RAISE EXCEPTION 'Invitation token is invalid' USING ERRCODE = '22023';
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
