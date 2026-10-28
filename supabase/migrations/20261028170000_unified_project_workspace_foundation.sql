-- Unified Project Workspace foundation: store module outputs as project-scoped artifacts.
-- Existing project/document/member tables remain the source of truth; this is additive.
CREATE TABLE IF NOT EXISTS public.project_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_type text NOT NULL CHECK (length(trim(artifact_type)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  description text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  file_name text,
  mime_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_artifacts_storage_or_data CHECK (
    storage_path IS NOT NULL OR data <> '{}'::jsonb OR artifact_type <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_created
  ON public.project_artifacts (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_type
  ON public.project_artifacts (project_id, artifact_type);

ALTER TABLE public.project_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view artifacts" ON public.project_artifacts;
CREATE POLICY "Project members can view artifacts"
  ON public.project_artifacts FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project editors can create artifacts" ON public.project_artifacts;
CREATE POLICY "Project editors can create artifacts"
  ON public.project_artifacts FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.get_project_role(project_id, auth.uid()) IN ('admin', 'engineer')
  );

DROP POLICY IF EXISTS "Project editors can update artifacts" ON public.project_artifacts;
CREATE POLICY "Project editors can update artifacts"
  ON public.project_artifacts FOR UPDATE TO authenticated
  USING (public.get_project_role(project_id, auth.uid()) IN ('admin', 'engineer'))
  WITH CHECK (
    public.get_project_role(project_id, auth.uid()) IN ('admin', 'engineer')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  );

DROP POLICY IF EXISTS "Project admins or artifact creators can delete artifacts" ON public.project_artifacts;
CREATE POLICY "Project admins or artifact creators can delete artifacts"
  ON public.project_artifacts FOR DELETE TO authenticated
  USING (
    public.get_project_role(project_id, auth.uid()) = 'admin'
    OR (created_by = auth.uid() AND public.get_project_role(project_id, auth.uid()) = 'engineer')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_artifacts TO authenticated;

-- Export jobs are metadata only; the ZIP itself must be created by a trusted
-- server-side worker/Edge Function and stored in a private Storage bucket.
CREATE TABLE IF NOT EXISTS public.project_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'expired')),
  storage_path text,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  CONSTRAINT project_exports_completed_has_file CHECK (status <> 'completed' OR storage_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_project_exports_project_created
  ON public.project_exports (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_exports_requester_created
  ON public.project_exports (requested_by, created_at DESC);

ALTER TABLE public.project_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view export jobs" ON public.project_exports;
CREATE POLICY "Project members can view export jobs"
  ON public.project_exports FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project editors can request exports" ON public.project_exports;
CREATE POLICY "Project editors can request exports"
  ON public.project_exports FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.get_project_role(project_id, auth.uid()) IN ('admin', 'engineer')
  );

GRANT SELECT, INSERT ON public.project_exports TO authenticated;

-- Intentionally no client UPDATE/DELETE policy for export jobs. A trusted
-- server-side worker must own state transitions and storage-path assignment.
