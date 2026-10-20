-- ============================================================================
-- Phase 1 — close self-service money / referral holes
--
-- REVIEW BEFORE APPLYING. Idempotent (safe to re-run). Touches only:
--   subscriptions, payments, withdrawals, profiles (+ new SECURITY DEFINER fns).
-- It does NOT change any plan price, and it does not delete data.
--
-- Fixes
--  1. Users could INSERT a subscription for ANY plan, or UPDATE their own
--     subscription to any plan_id with status 'active'  -> free paid plans.
--  2. Users could submit a payment with an arbitrary `amount` (client-trusted).
--  3. Users could INSERT withdrawals with status 'paid', any amount, no balance.
--  4. Users could rewrite profiles.referral_code / referred_by.
--  5. Payment approval / cancellation ran as client-side multi-step writes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SUBSCRIPTIONS — users may only hold the Free plan by themselves
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users create own free subscription" ON public.subscriptions;
CREATE POLICY "Users create own free subscription" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'active'
    AND plan_id = (SELECT id FROM public.plans WHERE code = 'free' LIMIT 1)
  );

-- Self-service UPDATE is removed completely (it allowed plan_id changes).
-- Cancelling goes through cancel_my_subscription(); upgrades through approve_payment().
DROP POLICY IF EXISTS "Users cancel own subscription" ON public.subscriptions;
REVOKE UPDATE ON public.subscriptions FROM anon;

CREATE OR REPLACE FUNCTION public.cancel_my_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.subscriptions
     SET status = 'cancelled', cancelled_at = now()
   WHERE user_id = auth.uid() AND status = 'active';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. PAYMENTS — amount is computed server-side from `plans`, never from the client
--    (deliberately NOT security definer: current_user must be the calling role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payments_enforce_server_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p public.plans%ROWTYPE;
BEGIN
  IF new.plan_id IS NULL THEN RAISE EXCEPTION 'plan_id is required'; END IF;
  SELECT * INTO p FROM public.plans WHERE id = new.plan_id AND is_active = true;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Unknown or inactive plan'; END IF;

  new.amount := CASE WHEN new.billing_cycle = 'yearly' THEN p.price_yearly ELSE p.price_monthly END;
  new.currency := coalesce(p.currency, 'BDT');
  -- a client can never create an already-verified payment
  IF current_user IN ('authenticated', 'anon') THEN
    new.status := 'pending';
    new.verified_at := NULL;
    new.subscription_id := NULL;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS payments_enforce_server_amount ON public.payments;
CREATE TRIGGER payments_enforce_server_amount
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_enforce_server_amount();

-- ---------------------------------------------------------------------------
-- 3. Admin payment verification as ONE atomic server-side function
--    (Phase 3 will extend approve_payment to create the referral commission.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  sub_id uuid;
  renewal timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF pay.status <> 'pending' THEN RAISE EXCEPTION 'Payment is already %', pay.status; END IF;
  IF pay.plan_id IS NULL THEN RAISE EXCEPTION 'Payment has no plan'; END IF;

  renewal := CASE WHEN pay.billing_cycle = 'yearly' THEN now() + interval '1 year'
                  ELSE now() + interval '1 month' END;

  INSERT INTO public.subscriptions (user_id, plan_id, status, billing_cycle, start_date, renewal_date, cancelled_at, payment_provider)
  VALUES (pay.user_id, pay.plan_id, 'active', pay.billing_cycle, now(), renewal, NULL, 'manual')
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, status = 'active', billing_cycle = EXCLUDED.billing_cycle,
        start_date = EXCLUDED.start_date, renewal_date = EXCLUDED.renewal_date,
        cancelled_at = NULL, payment_provider = 'manual'
  RETURNING id INTO sub_id;

  UPDATE public.payments
     SET status = 'verified', verified_at = now(), subscription_id = sub_id
   WHERE id = pay.id;

  RETURN sub_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payment(_payment_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.payments SET status = 'failed', admin_note = _note
   WHERE id = _payment_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or not pending'; END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. WITHDRAWALS — requests only through request_withdrawal()
-- ---------------------------------------------------------------------------
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS approved_at timestamptz;

DROP POLICY IF EXISTS "Users request withdrawals" ON public.withdrawals;
REVOKE INSERT ON public.withdrawals FROM authenticated, anon;

-- Available balance = commission on converted/approved referrals
--                     minus every withdrawal that is not rejected.
-- (Phase 3 will normalise referral statuses; this is the conservative reading.)
CREATE OR REPLACE FUNCTION public.available_commission_balance(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT sum(commission_amount) FROM public.referrals
                    WHERE referrer_id = _user_id AND status IN ('converted', 'approved')), 0)
       - coalesce((SELECT sum(amount) FROM public.withdrawals
                    WHERE user_id = _user_id AND status IN ('pending', 'approved', 'paid')), 0)
$$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric, _method text, _account_number text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  m text := lower(trim(coalesce(_method, '')));
  acct text := trim(coalesce(_account_number, ''));
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _amount IS NULL OR _amount < 500 THEN RAISE EXCEPTION 'Minimum withdrawal is BDT 500'; END IF;
  IF m NOT IN ('bkash', 'nagad', 'bank', 'bank transfer') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF length(acct) < 5 OR length(acct) > 64 THEN RAISE EXCEPTION 'Invalid account number'; END IF;

  -- serialise concurrent requests from the same user (no double-spend)
  PERFORM pg_advisory_xact_lock(hashtext('withdraw:' || uid::text));

  IF _amount > public.available_commission_balance(uid) THEN
    RAISE EXCEPTION 'Amount exceeds available balance';
  END IF;

  INSERT INTO public.withdrawals (user_id, amount, method, account_number, status)
  VALUES (uid, _amount, trim(_method), acct, 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Withdrawal rows: immutable money fields + strict status machine + server timestamps.
CREATE OR REPLACE FUNCTION public.withdrawals_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.user_id IS DISTINCT FROM old.user_id
     OR new.amount IS DISTINCT FROM old.amount
     OR new.method IS DISTINCT FROM old.method
     OR new.account_number IS DISTINCT FROM old.account_number
     OR new.requested_at IS DISTINCT FROM old.requested_at THEN
    RAISE EXCEPTION 'Withdrawal money fields are immutable';
  END IF;

  IF new.status IS DISTINCT FROM old.status THEN
    IF NOT (
      (old.status = 'pending'  AND new.status IN ('approved', 'rejected')) OR
      (old.status = 'approved' AND new.status IN ('paid', 'rejected'))
    ) THEN
      RAISE EXCEPTION 'Invalid withdrawal status change: % -> %', old.status, new.status;
    END IF;
    IF new.status = 'approved' THEN new.approved_at := now(); END IF;
    IF new.status = 'paid'     THEN new.paid_at := now(); END IF;
  ELSE
    new.approved_at := old.approved_at;
    new.paid_at := old.paid_at;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS withdrawals_guard_update ON public.withdrawals;
CREATE TRIGGER withdrawals_guard_update
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.withdrawals_guard_update();

-- ---------------------------------------------------------------------------
-- 5. PROFILES — referral attribution can't be edited from the client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_protect_referral_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only client roles are restricted. Server paths (handle_new_user, service_role,
  -- SECURITY DEFINER functions owned by postgres) run as a different current_user.
  IF current_user IN ('authenticated', 'anon') THEN
    IF tg_op = 'UPDATE' THEN
      new.referral_code := old.referral_code;
      new.referred_by   := old.referred_by;
    ELSE
      new.referred_by   := NULL;
      new.referral_code := 'CIVIL-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_referral_fields ON public.profiles;
CREATE TRIGGER profiles_protect_referral_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_referral_fields();

-- ---------------------------------------------------------------------------
-- Function privileges: never callable by anon; trigger fns not callable at all
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cancel_my_subscription()                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_payment(uuid)                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_payment(uuid, text)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.available_commission_balance(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payments_enforce_server_amount()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdrawals_guard_update()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_protect_referral_fields()              FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_my_subscription()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_payment(uuid)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_payment(uuid, text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.available_commission_balance(uuid)           TO service_role;
