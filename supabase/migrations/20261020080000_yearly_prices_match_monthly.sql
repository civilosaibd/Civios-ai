-- Keep yearly plan prices numerically equal to the existing monthly prices.
-- This is intentional product pricing, not a 12x annualized amount.
UPDATE public.plans
SET price_yearly = price_monthly,
    updated_at = now()
WHERE code IN ('starter', 'professional', 'business')
  AND price_yearly IS DISTINCT FROM price_monthly;
