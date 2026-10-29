-- Add indexes for foreign-key columns flagged by Supabase's performance advisor.
-- These indexes support joins and parent-row updates/deletes; no data or policy changes.
CREATE INDEX IF NOT EXISTS idx_agent_approvals_decided_by
  ON public.agent_approvals (decided_by);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_requested_by
  ON public.agent_approvals (requested_by);
CREATE INDEX IF NOT EXISTS idx_agent_automations_owner_id
  ON public.agent_automations (owner_id);
-- Some migration-test fixtures predate the optional created_by column.
-- Create this index only when the column exists; production has it as an FK.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_resources'
      AND column_name = 'created_by'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_knowledge_resources_created_by
      ON public.knowledge_resources (created_by);
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_notifications_project_id
  ON public.notifications (project_id);
CREATE INDEX IF NOT EXISTS idx_payments_plan_id
  ON public.payments (plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id
  ON public.payments (subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON public.payments (user_id);
CREATE INDEX IF NOT EXISTS idx_project_activity_project_id
  ON public.project_activity (project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id
  ON public.project_documents (project_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON public.projects (user_id);
CREATE INDEX IF NOT EXISTS idx_site_logs_project_id
  ON public.site_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id
  ON public.subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_visualization_files_derived_from
  ON public.visualization_files (derived_from);
CREATE INDEX IF NOT EXISTS idx_visualization_files_user_id
  ON public.visualization_files (user_id);
CREATE INDEX IF NOT EXISTS idx_visualization_jobs_user_id
  ON public.visualization_jobs (user_id);
