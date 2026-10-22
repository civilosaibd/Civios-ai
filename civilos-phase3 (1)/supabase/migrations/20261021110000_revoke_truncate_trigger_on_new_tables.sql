-- Supabase's default privileges give anon/authenticated TRUNCATE, REFERENCES and TRIGGER on new tables.
-- RLS does not apply to TRUNCATE, so remove those from the tables added in Phase 3 / 3D. Idempotent.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.referral_commissions, public.app_settings, public.construction_visualizations, public.visualization_files, public.detected_elements, public.construction_stages, public.visualization_exports, public.visualization_jobs FROM anon, authenticated;
