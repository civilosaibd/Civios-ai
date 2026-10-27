-- Pin a safe search_path for SECURITY DEFINER functions exposed to signed-in users.
-- This does not change function bodies, grants, or authorization logic.
ALTER FUNCTION public.accept_project_invitation(text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.approve_payment(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.cancel_my_subscription() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.cancel_viz_job(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.claim_referral(text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.decline_project_invitation(text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.generate_my_deadline_notifications() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_project_role(uuid, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_project_member(uuid, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.my_affiliate_stats() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.reject_payment(uuid, text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.request_withdrawal(numeric, text, text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.review_commission(uuid, boolean, text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.viz_can_read(uuid, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.viz_can_write(uuid, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.viz_role(uuid, uuid) SET search_path = pg_catalog, public, pg_temp;
