-- ============================================================================
-- 3D Construction Visualization (Phase A)
--
-- REVIEW BEFORE APPLYING. Additive only: creates NEW tables / bucket / functions.
-- It does not alter any existing table. Idempotent.
--
-- Access model (re-uses the existing project roles):
--   * owner (visualizations.user_id)                       -> full control
--   * project admin / engineer (get_project_role)          -> read + write
--   * project viewer                                       -> read only
--   * a visualization with no project is private to its owner
-- Heavy processing runs in the `viz-analyze` edge function using the service role;
-- clients can READ jobs but never write them.
-- ============================================================================

-- ---- admin-configurable settings (max upload size etc.) -----------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read viz settings" ON public.app_settings;
CREATE POLICY "Read viz settings" ON public.app_settings FOR SELECT TO authenticated USING (key LIKE 'viz.%');
DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
CREATE POLICY "Admins manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.app_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

INSERT INTO public.app_settings (key, value) VALUES
  ('viz.max_file_mb', '25'::jsonb),
  ('viz.max_files', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---- tables --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.construction_visualizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','analyzing','needs_review','verified','generated','failed')),
  building_type text,
  floor_count int CHECK (floor_count IS NULL OR floor_count BETWEEN 1 AND 40),
  approx_area_sqft numeric CHECK (approx_area_sqft IS NULL OR approx_area_sqft > 0),
  location text,
  unit_system text NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric','imperial')),
  source_type text CHECK (source_type IS NULL OR source_type IN ('plan','render','dxf','mixed','manual')),
  analysis jsonb,            -- raw, normalised AI/CAD analysis (untrusted until verified)
  model jsonb,               -- user-verified BuildingModel used to generate the 3D scene
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visualization_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visualization_id uuid NOT NULL REFERENCES public.construction_visualizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url text NOT NULL,                 -- storage path inside bucket visualization-files
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image','pdf','dxf','dwg')),
  file_size bigint NOT NULL CHECK (file_size >= 0),
  width int, height int,                  -- pixels (images / rasterised PDF pages)
  role text NOT NULL DEFAULT 'source' CHECK (role IN ('source','derived')),
  derived_from uuid REFERENCES public.visualization_files(id) ON DELETE CASCADE,
  processing_status text NOT NULL DEFAULT 'uploaded'
    CHECK (processing_status IN ('uploaded','processing','processed','failed','unsupported')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.detected_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visualization_id uuid NOT NULL REFERENCES public.construction_visualizations(id) ON DELETE CASCADE,
  element_type text NOT NULL,
  floor int,
  geometry_data jsonb NOT NULL,
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  source text NOT NULL CHECK (source IN ('dxf','vision','user','inferred')),
  user_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Phase B (construction simulation) / export history — created now so the schema is stable
CREATE TABLE IF NOT EXISTS public.construction_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visualization_id uuid NOT NULL REFERENCES public.construction_visualizations(id) ON DELETE CASCADE,
  stage_number int NOT NULL CHECK (stage_number BETWEEN 1 AND 20),
  stage_name text NOT NULL,
  stage_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  render_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  UNIQUE (visualization_id, stage_number)
);

CREATE TABLE IF NOT EXISTS public.visualization_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visualization_id uuid NOT NULL REFERENCES public.construction_visualizations(id) ON DELETE CASCADE,
  export_type text NOT NULL,
  file_url text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Real backend job state (the UI shows exactly this — no simulated progress)
CREATE TABLE IF NOT EXISTS public.visualization_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visualization_id uuid NOT NULL REFERENCES public.construction_visualizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'analyze' CHECK (kind IN ('analyze')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{key,label,status,detail,at}]
  error text,
  attempt int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- ---- indexes -------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_viz_user ON public.construction_visualizations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_viz_project ON public.construction_visualizations (project_id);
CREATE INDEX IF NOT EXISTS idx_viz_files_viz ON public.visualization_files (visualization_id);
CREATE INDEX IF NOT EXISTS idx_viz_elements_viz ON public.detected_elements (visualization_id);
CREATE INDEX IF NOT EXISTS idx_viz_stages_viz ON public.construction_stages (visualization_id);
CREATE INDEX IF NOT EXISTS idx_viz_exports_viz ON public.visualization_exports (visualization_id);
CREATE INDEX IF NOT EXISTS idx_viz_jobs_viz ON public.visualization_jobs (visualization_id, created_at DESC);

DROP TRIGGER IF EXISTS viz_set_updated_at ON public.construction_visualizations;
CREATE TRIGGER viz_set_updated_at BEFORE UPDATE ON public.construction_visualizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS viz_jobs_set_updated_at ON public.visualization_jobs;
CREATE TRIGGER viz_jobs_set_updated_at BEFORE UPDATE ON public.visualization_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- access helpers -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_uuid(_t text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN RETURN _t::uuid; EXCEPTION WHEN others THEN RETURN NULL; END $$;

-- 'owner' | 'admin' | 'engineer' | 'viewer' | NULL
CREATE OR REPLACE FUNCTION public.viz_role(_viz uuid, _user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN v.user_id = _user THEN 'owner'
    WHEN v.project_id IS NOT NULL THEN public.get_project_role(v.project_id, _user)::text
    ELSE NULL END
  FROM public.construction_visualizations v WHERE v.id = _viz
$$;

CREATE OR REPLACE FUNCTION public.viz_can_write(_viz uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.viz_role(_viz, _user) IN ('owner', 'admin', 'engineer'), false)
$$;

CREATE OR REPLACE FUNCTION public.viz_can_read(_viz uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.viz_role(_viz, _user) IS NOT NULL
$$;

-- ---- RLS ------------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.construction_visualizations, public.visualization_files,
  public.detected_elements, public.construction_stages, public.visualization_exports TO authenticated;
GRANT SELECT ON public.visualization_jobs TO authenticated;
GRANT ALL ON public.construction_visualizations, public.visualization_files, public.detected_elements,
  public.construction_stages, public.visualization_exports, public.visualization_jobs TO service_role;
REVOKE ALL ON public.construction_visualizations, public.visualization_files, public.detected_elements,
  public.construction_stages, public.visualization_exports, public.visualization_jobs FROM anon;

ALTER TABLE public.construction_visualizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visualization_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_elements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_stages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visualization_exports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visualization_jobs         ENABLE ROW LEVEL SECURITY;
-- Supabase grants new public tables to `authenticated` by default, so revoke explicitly: jobs are server-written only.
REVOKE INSERT, UPDATE, DELETE ON public.visualization_jobs FROM authenticated;

DROP POLICY IF EXISTS viz_select ON public.construction_visualizations;
CREATE POLICY viz_select ON public.construction_visualizations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.get_project_role(project_id, auth.uid()) IS NOT NULL));
DROP POLICY IF EXISTS viz_insert ON public.construction_visualizations;
CREATE POLICY viz_insert ON public.construction_visualizations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND (project_id IS NULL OR public.get_project_role(project_id, auth.uid()) IN ('admin', 'engineer')));
DROP POLICY IF EXISTS viz_update ON public.construction_visualizations;
CREATE POLICY viz_update ON public.construction_visualizations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.get_project_role(project_id, auth.uid()) IN ('admin', 'engineer')))
  WITH CHECK (user_id = auth.uid() OR (project_id IS NOT NULL AND public.get_project_role(project_id, auth.uid()) IN ('admin', 'engineer')));
DROP POLICY IF EXISTS viz_delete ON public.construction_visualizations;
CREATE POLICY viz_delete ON public.construction_visualizations FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.get_project_role(project_id, auth.uid()) = 'admin'));

-- ownership / project can only be changed by the owner; ownership can never move
CREATE OR REPLACE FUNCTION public.viz_guard_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.user_id IS DISTINCT FROM old.user_id THEN RAISE EXCEPTION 'Owner cannot be changed'; END IF;
  IF new.project_id IS DISTINCT FROM old.project_id AND current_user IN ('authenticated', 'anon') THEN
    IF old.user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the owner can move a visualization to another project'; END IF;
    IF new.project_id IS NOT NULL AND public.get_project_role(new.project_id, auth.uid()) NOT IN ('admin', 'engineer') THEN
      RAISE EXCEPTION 'You need Engineer or Admin access on the target project';
    END IF;
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS viz_guard_update ON public.construction_visualizations;
CREATE TRIGGER viz_guard_update BEFORE UPDATE ON public.construction_visualizations
  FOR EACH ROW EXECUTE FUNCTION public.viz_guard_update();

-- child tables: read if you can read the parent, write if you can write the parent
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['visualization_files','detected_elements','construction_stages','visualization_exports'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.viz_can_read(visualization_id, auth.uid()))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.viz_can_write(visualization_id, auth.uid())) WITH CHECK (public.viz_can_write(visualization_id, auth.uid()))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.viz_can_write(visualization_id, auth.uid()))', t || '_delete', t);
  END LOOP;
END $$;
CREATE POLICY visualization_files_insert ON public.visualization_files FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.viz_can_write(visualization_id, auth.uid()));
CREATE POLICY detected_elements_insert ON public.detected_elements FOR INSERT TO authenticated
  WITH CHECK (public.viz_can_write(visualization_id, auth.uid()));
CREATE POLICY construction_stages_insert ON public.construction_stages FOR INSERT TO authenticated
  WITH CHECK (public.viz_can_write(visualization_id, auth.uid()));
CREATE POLICY visualization_exports_insert ON public.visualization_exports FOR INSERT TO authenticated
  WITH CHECK (public.viz_can_write(visualization_id, auth.uid()));

DROP POLICY IF EXISTS visualization_jobs_select ON public.visualization_jobs;
CREATE POLICY visualization_jobs_select ON public.visualization_jobs FOR SELECT TO authenticated
  USING (public.viz_can_read(visualization_id, auth.uid()));
-- (no INSERT/UPDATE/DELETE policy for clients: jobs are written only by the edge function)

-- user-initiated cancellation of a running job (the function checks this between steps)
CREATE OR REPLACE FUNCTION public.cancel_viz_job(_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.visualization_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.visualization_jobs WHERE id = _job;
  IF j.id IS NULL OR auth.uid() IS NULL OR NOT public.viz_can_write(j.visualization_id, auth.uid()) THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  UPDATE public.visualization_jobs SET status = 'cancelled', finished_at = now()
   WHERE id = _job AND status IN ('queued', 'running');
END $$;
REVOKE ALL ON FUNCTION public.cancel_viz_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_viz_job(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.viz_role(uuid, uuid), public.viz_can_write(uuid, uuid), public.viz_can_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viz_role(uuid, uuid), public.viz_can_write(uuid, uuid), public.viz_can_read(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_uuid(text) TO authenticated, service_role, anon;

-- ---- storage: private bucket, path = <visualization_id>/<file> -----------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('visualization-files', 'visualization-files', false, 52428800) -- hard cap 50 MB; the admin setting is the soft limit
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;

DROP POLICY IF EXISTS "viz files read" ON storage.objects;
CREATE POLICY "viz files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'visualization-files' AND public.viz_can_read(public.try_uuid((storage.foldername(name))[1]), auth.uid()));
DROP POLICY IF EXISTS "viz files upload" ON storage.objects;
CREATE POLICY "viz files upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visualization-files' AND public.viz_can_write(public.try_uuid((storage.foldername(name))[1]), auth.uid()));
DROP POLICY IF EXISTS "viz files delete" ON storage.objects;
CREATE POLICY "viz files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'visualization-files' AND public.viz_can_write(public.try_uuid((storage.foldername(name))[1]), auth.uid()));
