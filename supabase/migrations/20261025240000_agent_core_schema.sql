-- Provision the production schema required by the CivilOS AI Agent.
-- These tables previously existed only in drizzle/migrations and were absent
-- from the connected production Supabase project. All mutations remain
-- server-role-only; authenticated users receive only explicitly scoped reads.

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL CHECK (agent_type IN ('admin','user')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objective text NOT NULL,
  interpreted_intent text,
  status text NOT NULL DEFAULT 'received',
  risk_level text NOT NULL DEFAULT 'LOW',
  approval_required boolean NOT NULL DEFAULT false,
  result text,
  error text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('admin','user')),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  tool text,
  target text,
  risk_level text,
  input_summary jsonb,
  result_summary jsonb,
  status text NOT NULL DEFAULT 'ok',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool text NOT NULL,
  tool_input jsonb NOT NULL,
  risk_level text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_feature_settings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('admin','user')),
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_type, key)
);

CREATE TABLE IF NOT EXISTS public.agent_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('health_check','failed_tasks_report')),
  frequency text NOT NULL CHECK (frequency IN ('hourly','daily','weekly')),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_status text,
  last_result jsonb,
  fail_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_cron_key (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  key text NOT NULL DEFAULT encode(gen_random_bytes(32),'hex')
);
INSERT INTO public.agent_cron_key (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS agent_tasks_user_created_idx
  ON public.agent_tasks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_status_created_idx
  ON public.agent_tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_steps_task_created_idx
  ON public.agent_steps (task_id, created_at);
CREATE INDEX IF NOT EXISTS agent_steps_actor_created_idx
  ON public.agent_steps (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_approvals_status_created_idx
  ON public.agent_approvals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_approvals_task_idx
  ON public.agent_approvals (task_id);
CREATE INDEX IF NOT EXISTS agent_automations_due_idx
  ON public.agent_automations (enabled, next_run_at);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_cron_key ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.agent_tasks FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.agent_steps FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.agent_approvals FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.user_feature_settings FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.agent_memory FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.agent_automations FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.agent_cron_key FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.agent_tasks TO authenticated;
GRANT SELECT ON TABLE public.agent_steps TO authenticated;
GRANT SELECT ON TABLE public.agent_approvals TO authenticated;
GRANT SELECT ON TABLE public.user_feature_settings TO authenticated;
GRANT SELECT, DELETE ON TABLE public.agent_memory TO authenticated;
GRANT SELECT ON TABLE public.agent_automations TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.agent_tasks TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.agent_steps TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.agent_approvals TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.user_feature_settings TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.agent_memory TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.agent_automations TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.agent_cron_key TO service_role;

DROP POLICY IF EXISTS "Own agent tasks" ON public.agent_tasks;
CREATE POLICY "Own agent tasks" ON public.agent_tasks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (agent_type = 'admin' AND public.has_role(auth.uid(),'admin')));

DROP POLICY IF EXISTS "Own agent steps" ON public.agent_steps;
CREATE POLICY "Own agent steps" ON public.agent_steps
  FOR SELECT TO authenticated
  USING (auth.uid() = actor_user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins see approvals" ON public.agent_approvals;
CREATE POLICY "Admins see approvals" ON public.agent_approvals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Own feature settings" ON public.user_feature_settings;
CREATE POLICY "Own feature settings" ON public.user_feature_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own agent memory" ON public.agent_memory;
CREATE POLICY "Users read own agent memory" ON public.agent_memory
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own agent memory" ON public.agent_memory;
CREATE POLICY "Users delete own agent memory" ON public.agent_memory
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read automations" ON public.agent_automations;
CREATE POLICY "Admins read automations" ON public.agent_automations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
