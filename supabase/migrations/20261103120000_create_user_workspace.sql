-- Create the per-user cloud workspace table used by useCloudState,
-- BackupPage and ReportsPage. Keep the schema aligned with the existing
-- Drizzle baseline migration; do not expose workspace rows to anon users.

CREATE TABLE IF NOT EXISTS public.user_workspace (
  user_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_workspace_pkey PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_workspace ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workspace TO authenticated;
GRANT ALL ON public.user_workspace TO service_role;

-- Explicitly recreate the owner-only policies so the intended access rules
-- are clear and repeatable if this migration is adapted for a pre-existing table.
DROP POLICY IF EXISTS "Own workspace select" ON public.user_workspace;
DROP POLICY IF EXISTS "Own workspace insert" ON public.user_workspace;
DROP POLICY IF EXISTS "Own workspace update" ON public.user_workspace;
DROP POLICY IF EXISTS "Own workspace delete" ON public.user_workspace;

CREATE POLICY "Own workspace select"
  ON public.user_workspace
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Own workspace insert"
  ON public.user_workspace
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Own workspace update"
  ON public.user_workspace
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Own workspace delete"
  ON public.user_workspace
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE public.user_workspace IS
  'Per-user key/value workspace state. Authenticated users can access only rows whose user_id matches auth.uid().';
