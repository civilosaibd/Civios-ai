-- Admin-managed homepage architectural GLB assets.
-- Uploads are public-read for the homepage, but write access is admin-only.
CREATE TABLE IF NOT EXISTS public.homepage_hero_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text,
  file_path text NOT NULL UNIQUE,
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 52428800),
  is_active boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS homepage_hero_models_one_active
  ON public.homepage_hero_models (is_active) WHERE is_active = true;

ALTER TABLE public.homepage_hero_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read active homepage hero model" ON public.homepage_hero_models;
CREATE POLICY "Public can read active homepage hero model"
  ON public.homepage_hero_models FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage homepage hero models" ON public.homepage_hero_models;
CREATE POLICY "Admins manage homepage hero models"
  ON public.homepage_hero_models FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.homepage_hero_models FROM anon;
GRANT SELECT ON public.homepage_hero_models TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.homepage_hero_models TO authenticated;
GRANT ALL ON public.homepage_hero_models TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('homepage-hero-models', 'homepage-hero-models', true, 52428800, ARRAY['model/gltf-binary','application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['model/gltf-binary','application/octet-stream'];

DROP POLICY IF EXISTS "Public read homepage hero GLB" ON storage.objects;
CREATE POLICY "Public read homepage hero GLB"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'homepage-hero-models');

DROP POLICY IF EXISTS "Admins upload homepage hero GLB" ON storage.objects;
CREATE POLICY "Admins upload homepage hero GLB"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homepage-hero-models' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update homepage hero GLB" ON storage.objects;
CREATE POLICY "Admins update homepage hero GLB"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'homepage-hero-models' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'homepage-hero-models' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete homepage hero GLB" ON storage.objects;
CREATE POLICY "Admins delete homepage hero GLB"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'homepage-hero-models' AND public.has_role(auth.uid(), 'admin'));
