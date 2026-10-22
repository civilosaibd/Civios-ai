-- Site Photos: private user-owned uploads and metadata.
CREATE TABLE IF NOT EXISTS public.site_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name text,
  activity text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  storage_path text NOT NULL UNIQUE,
  taken_on date NOT NULL DEFAULT CURRENT_DATE,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.site_photos TO authenticated;
GRANT ALL ON public.site_photos TO service_role;

CREATE POLICY "Users view own site photos"
  ON public.site_photos FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users add own site photos"
  ON public.site_photos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own site photos"
  ON public.site_photos FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('site-photos', 'site-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'];

CREATE POLICY "Users upload own site photo objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own site photo objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own site photo objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
