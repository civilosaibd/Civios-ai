-- Keep profile ownership checks semantically identical while allowing PostgreSQL
-- to evaluate auth.uid() once per statement rather than once per row.
ALTER POLICY "Profiles are viewable by owner"
  ON public.profiles
  USING ((select auth.uid()) = id);

ALTER POLICY "Users can insert own profile"
  ON public.profiles
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "Users can update own profile"
  ON public.profiles
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
