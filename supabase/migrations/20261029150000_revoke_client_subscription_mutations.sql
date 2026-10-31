-- Defense in depth: the prior server-entitlements migration re-granted UPDATE
-- to authenticated clients after revoking it. Subscription upgrades/cancellations
-- must only be performed by trusted server-side code.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.subscriptions
FROM anon, authenticated;

-- Preserve the intended client capabilities: read own subscription and create
-- an eligible Free subscription, subject to the table's RLS policies.
GRANT SELECT, INSERT ON TABLE public.subscriptions TO authenticated;
REVOKE INSERT ON TABLE public.subscriptions FROM anon;

-- Ensure clients cannot bypass server-owned subscription state through column grants.
REVOKE ALL (status, plan_id, billing_cycle, renewal_date, cancelled_at, payment_provider)
ON TABLE public.subscriptions
FROM anon, authenticated;

-- The INSERT policy remains responsible for restricting self-service creation
-- to the active Free plan. Server/service-role workflows retain their privileges.
