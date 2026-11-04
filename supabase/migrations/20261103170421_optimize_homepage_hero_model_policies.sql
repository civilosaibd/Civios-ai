-- Tighten homepage hero model policy shape and index its creator FK.
DROP POLICY IF EXISTS "Admins manage homepage hero models" ON public.homepage_hero_models;

DROP POLICY IF EXISTS "Admins insert homepage hero models" ON public.homepage_hero_models;
CREATE POLICY "Admins insert homepage hero models"
  ON public.homepage_hero_models FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin')));

DROP POLICY IF EXISTS "Admins update homepage hero models" ON public.homepage_hero_models;
CREATE POLICY "Admins update homepage hero models"
  ON public.homepage_hero_models FOR UPDATE TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin')))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin')));

DROP POLICY IF EXISTS "Admins delete homepage hero models" ON public.homepage_hero_models;
CREATE POLICY "Admins delete homepage hero models"
  ON public.homepage_hero_models FOR DELETE TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin')));

DROP POLICY IF EXISTS "Public can read active homepage hero model" ON public.homepage_hero_models;
CREATE POLICY "Public can read active homepage hero model"
  ON public.homepage_hero_models FOR SELECT TO anon, authenticated
  USING (is_active = true OR (SELECT public.has_role((SELECT auth.uid()), 'admin')));

CREATE INDEX IF NOT EXISTS homepage_hero_models_created_by_idx
  ON public.homepage_hero_models (created_by);
