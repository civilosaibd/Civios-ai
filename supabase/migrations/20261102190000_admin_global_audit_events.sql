-- Unified, read-only audit timeline across independently shipped admin modules.
-- Dynamic table checks let this migration work before all phase migrations are deployed.
CREATE OR REPLACE FUNCTION public.admin_global_audit_events(
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _action text DEFAULT NULL,
  _source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  queries text[] := ARRAY[]::text[];
  sources text[] := ARRAY[]::text[];
  union_sql text;
  count_sql text;
  rows_sql text;
  total_count bigint := 0;
  event_rows jsonb := '[]'::jsonb;
  safe_limit integer := least(greatest(coalesce(_limit,50),1),200);
  safe_offset integer := least(greatest(coalesce(_offset,0),0),50000);
BEGIN
  IF caller_id IS NULL OR NOT public.has_role(caller_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF _action IS NOT NULL AND length(_action) > 100 THEN
    RAISE EXCEPTION 'Invalid action filter' USING ERRCODE = '22023';
  END IF;
  IF _source IS NOT NULL AND _source NOT IN ('users','affiliate','projects','billing','ai_usage','reports','settings','team') THEN
    RAISE EXCEPTION 'Invalid audit source filter' USING ERRCODE = '22023';
  END IF;

  IF to_regclass('public.admin_user_access_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text AS id, admin_user_id::text AS admin_user_id,
        target_user_id::text AS target_id, action, 'logged'::text AS result,
        '{}'::jsonb AS details, accessed_at AS created_at, 'users'::text AS source
      FROM public.admin_user_access_audit
    $q$);
    sources := array_append(sources,'users');
  END IF;
  IF to_regclass('public.admin_action_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, admin_user_id::text, target_id::text, action,
        'logged'::text AS result,
        jsonb_build_object('target_type',target_type) || coalesce(details,'{}'::jsonb) AS details,
        created_at, 'affiliate'::text AS source
      FROM public.admin_action_audit
    $q$);
    sources := array_append(sources,'affiliate');
  END IF;
  IF to_regclass('public.admin_project_access_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, admin_user_id::text, project_id::text AS target_id, action,
        'logged'::text AS result, coalesce(details,'{}'::jsonb) AS details,
        created_at, 'projects'::text AS source
      FROM public.admin_project_access_audit
    $q$);
    sources := array_append(sources,'projects');
  END IF;
  IF to_regclass('public.admin_account_status_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, admin_user_id::text, target_user_id::text AS target_id, action,
        result, jsonb_build_object('reason',reason) AS details,
        created_at, 'users'::text AS source
      FROM public.admin_account_status_audit
    $q$);
    sources := array_append(sources,'users');
  END IF;
  IF to_regclass('public.admin_billing_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, admin_user_id::text,
        coalesce(payment_id::text,subscription_id::text,target_user_id::text) AS target_id,
        action, result,
        jsonb_build_object('target_user_id',target_user_id,'payment_id',payment_id,
          'subscription_id',subscription_id,'note',note) AS details,
        created_at, 'billing'::text AS source
      FROM public.admin_billing_audit
    $q$);
    sources := array_append(sources,'billing');
  END IF;
  IF to_regclass('public.admin_ai_usage_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, admin_user_id::text, target_user_id::text AS target_id, action,
        'logged'::text AS result, jsonb_build_object('period',period) AS details,
        created_at, 'ai_usage'::text AS source
      FROM public.admin_ai_usage_audit
    $q$);
    sources := array_append(sources,'ai_usage');
  END IF;
  IF to_regclass('public.admin_dashboard_access_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, admin_user_id::text, NULL::text AS target_id,
        'view_business_report'::text AS action, 'logged'::text AS result,
        jsonb_build_object('period_start',period_start,'period_end',period_end) AS details,
        created_at, 'reports'::text AS source
      FROM public.admin_dashboard_access_audit
    $q$);
    sources := array_append(sources,'reports');
  END IF;
  IF to_regclass('public.admin_rbac_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, actor_user_id::text AS admin_user_id, target_user_id::text AS target_id,
        action, 'logged'::text AS result,
        jsonb_build_object('feature_key',feature_key,'permission_action',permission_action,'metadata',metadata) AS details,
        created_at, 'team'::text AS source
      FROM public.admin_rbac_audit
    $q$);
    sources := array_append(sources,'team');
  END IF;
  IF to_regclass('public.admin_system_settings_audit') IS NOT NULL THEN
    queries := array_append(queries, $q$
      SELECT id::text, admin_user_id::text, NULL::text AS target_id,
        'update_system_settings'::text AS action, 'succeeded'::text AS result,
        jsonb_build_object('setting_group',setting_group,'old_values',old_values,'new_values',new_values) AS details,
        created_at, 'settings'::text AS source
      FROM public.admin_system_settings_audit
    $q$);
    sources := array_append(sources,'settings');
  END IF;

  IF cardinality(queries) = 0 THEN
    RETURN jsonb_build_object('events','[]'::jsonb,'total',0,'available_sources','[]'::jsonb);
  END IF;

  union_sql := array_to_string(queries, ' UNION ALL ');
  count_sql := format(
    'SELECT count(*) FROM (%s) AS events WHERE ($1 IS NULL OR action = $1) AND ($2 IS NULL OR source = $2)',
    union_sql
  );
  EXECUTE count_sql INTO total_count USING _action,_source;

  rows_sql := format(
    'SELECT coalesce(jsonb_agg(to_jsonb(page_rows)), ''[]''::jsonb) FROM (
       SELECT * FROM (%s) AS events
       WHERE ($1 IS NULL OR action = $1) AND ($2 IS NULL OR source = $2)
       ORDER BY created_at DESC LIMIT $3 OFFSET $4
     ) AS page_rows',
    union_sql
  );
  EXECUTE rows_sql INTO event_rows USING _action,_source,safe_limit,safe_offset;

  RETURN jsonb_build_object(
    'events',coalesce(event_rows,'[]'::jsonb),
    'total',total_count,
    'limit',safe_limit,
    'offset',safe_offset,
    'available_sources',to_jsonb(ARRAY(SELECT DISTINCT unnest(sources) ORDER BY 1))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_global_audit_events(integer,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_global_audit_events(integer,integer,text,text) TO authenticated, service_role;
