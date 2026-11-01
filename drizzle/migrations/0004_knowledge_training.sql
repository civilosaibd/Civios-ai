CREATE TABLE public.knowledge_resources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, title text NOT NULL, title_bn text,
 summary text, summary_bn text, content text, content_bn text, category text NOT NULL DEFAULT 'general',
 resource_type text NOT NULL DEFAULT 'guide', tags text[], language text, source_name text, source_url text,
 is_published boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.knowledge_resources TO anon, authenticated;
GRANT ALL ON public.knowledge_resources TO service_role;
ALTER TABLE public.knowledge_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published resources are public" ON public.knowledge_resources FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE TABLE public.training_courses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, title text NOT NULL, title_bn text,
 description text, description_bn text, category text NOT NULL DEFAULT 'general', difficulty text NOT NULL DEFAULT 'beginner',
 duration_minutes integer NOT NULL DEFAULT 0, sort_order integer NOT NULL DEFAULT 0, is_published boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.training_courses TO authenticated;
GRANT ALL ON public.training_courses TO service_role;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published courses readable" ON public.training_courses FOR SELECT TO authenticated USING (is_published = true);

CREATE TABLE public.training_lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
 slug text NOT NULL, title text NOT NULL, title_bn text, content text, content_bn text,
 duration_minutes integer NOT NULL DEFAULT 0, sort_order integer NOT NULL DEFAULT 0, is_published boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (course_id, slug));
GRANT SELECT ON public.training_lessons TO authenticated;
GRANT ALL ON public.training_lessons TO service_role;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published lessons readable" ON public.training_lessons FOR SELECT TO authenticated USING (is_published = true);

CREATE TABLE public.training_progress (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, lesson_id uuid NOT NULL REFERENCES public.training_lessons(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
 progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
 completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, lesson_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_progress TO authenticated;
GRANT ALL ON public.training_progress TO service_role;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own progress select" ON public.training_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own progress insert" ON public.training_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own progress update" ON public.training_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own progress delete" ON public.training_progress FOR DELETE TO authenticated USING (auth.uid() = user_id);