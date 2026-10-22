-- ============================================================================
-- Phase 4a — project deadline alerts (7 / 3 / 1 day), Bengali text, no duplicates
--
-- REVIEW BEFORE APPLYING. Idempotent. Adds:
--   * notifications.dedupe_key + unique index  -> the same alert is never created twice
--   * generate_deadline_notifications(_user, _today)  (service role / cron only)
--   * generate_my_deadline_notifications()            (a signed-in user, own projects only)
--   * a daily pg_cron job IF pg_cron is available (otherwise the app calls the user function)
-- Recipients: project owner + accepted team members, who have not switched off
-- "deadline_alerts" and whose "deadline_days_before" window covers the alert.
-- Projects with status 'completed' or no end_date are skipped.
-- ============================================================================

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key
  ON public.notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_deadline_notifications(
  _user uuid DEFAULT NULL,
  _today date DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::date)
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH due AS (
    SELECT p.id AS project_id, p.name, p.end_date, (p.end_date - _today) AS days_left
      FROM public.projects p
     WHERE p.end_date IS NOT NULL
       AND coalesce(p.status, '') <> 'completed'
       AND (p.end_date - _today) IN (7, 3, 1)
  ), recipients AS (
    SELECT d.*, p.user_id AS uid FROM due d JOIN public.projects p ON p.id = d.project_id
    UNION
    SELECT d.*, m.user_id FROM due d
      JOIN public.project_members m ON m.project_id = d.project_id AND m.status = 'accepted'
  ), ins AS (
    INSERT INTO public.notifications (user_id, project_id, type, title, message, link, dedupe_key)
    SELECT r.uid, r.project_id, 'deadline_alert',
           'প্রজেক্ট ডেডলাইন: ' || r.name,
           CASE WHEN r.days_left = 1
                THEN '"' || r.name || '" প্রজেক্টের ডেডলাইন আগামীকাল (' || to_char(r.end_date, 'DD-MM-YYYY') || ')।'
                ELSE '"' || r.name || '" প্রজেক্টের ডেডলাইনের আর ' || r.days_left || ' দিন বাকি (শেষ তারিখ: ' || to_char(r.end_date, 'DD-MM-YYYY') || ')।'
           END,
           '/projects/' || r.project_id,
           'deadline:' || r.project_id || ':' || r.end_date || ':' || r.days_left
      FROM recipients r
      LEFT JOIN public.notification_settings s ON s.user_id = r.uid
     WHERE (_user IS NULL OR r.uid = _user)
       AND coalesce(s.deadline_alerts, true)
       AND r.days_left <= coalesce(s.deadline_days_before, 7)
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_my_deadline_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN public.generate_deadline_notifications(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.generate_deadline_notifications(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_deadline_notifications(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.generate_my_deadline_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_my_deadline_notifications() TO authenticated, service_role;

-- Daily at 08:30 Asia/Dhaka (02:30 UTC) — only if pg_cron can be enabled; never fails the migration.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available (%). The app triggers alerts per user instead.', SQLERRM;
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.schedule('civilos-deadline-alerts', '30 2 * * *', 'SELECT public.generate_deadline_notifications()');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'could not schedule deadline alerts (%).', SQLERRM;
    END;
  END IF;
END $$;
