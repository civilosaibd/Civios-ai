-- Pin the execution search path for trigger/helper functions flagged by Supabase's
-- function_search_path_mutable security advisor. No function logic or privileges change.
ALTER FUNCTION public.viz_guard_update()
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.try_uuid(text)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.profiles_protect_referral_fields()
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.withdrawals_guard_update()
  SET search_path = pg_catalog, public, pg_temp;
