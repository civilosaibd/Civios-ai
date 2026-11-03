-- Allow multiple homepage hero models to be active as an ordered slideshow.
-- Existing active model remains active; subsequent models can be enabled alongside it.
DROP INDEX IF EXISTS public.homepage_hero_models_one_active;

CREATE INDEX IF NOT EXISTS homepage_hero_models_active_order_idx
  ON public.homepage_hero_models (display_order, created_at DESC)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.activate_homepage_hero_model(_model_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT public.has_role((SELECT auth.uid()), 'admin')) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.homepage_hero_models
  SET is_active = true, updated_at = now()
  WHERE id = _model_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Homepage model not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_homepage_hero_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_homepage_hero_model(uuid) TO authenticated;
