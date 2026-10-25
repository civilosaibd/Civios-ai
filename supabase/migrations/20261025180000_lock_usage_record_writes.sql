-- Prevent client-side tampering with plan usage counters.
-- The frontend currently reads usage_records but does not need direct write access.
-- Trusted server-side functions using service_role remain able to maintain counters.
-- This is intentionally additive and does not delete or rewrite existing usage data.

DROP POLICY IF EXISTS "Users insert own usage" ON public.usage_records;
DROP POLICY IF EXISTS "Users update own usage" ON public.usage_records;

REVOKE ALL PRIVILEGES ON TABLE public.usage_records FROM anon, authenticated;
GRANT SELECT ON TABLE public.usage_records TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.usage_records TO service_role;

-- Keep RLS enabled and preserve existing owner/admin SELECT policies.
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
