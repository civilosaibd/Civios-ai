-- Phase 10: secure billing administration and atomic audit trail.
-- Does not change prices, subscriptions, payment statuses, or historical records.
CREATE TABLE IF NOT EXISTS public.admin_billing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('payment_verified','payment_rejected')),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'BDT',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_billing_audit_created_at
  ON public.admin_billing_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_billing_audit_payment_id
  ON public.admin_billing_audit(payment_id);

ALTER TABLE public.admin_billing_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_billing_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_billing_audit TO service_role;

-- Permission-aware payment RPCs preserve the existing yearly-only and affiliate rules.
CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $
DECLARE
  pay public.payments%ROWTYPE;
  sub_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_admin_permission('billing','manage')
  ) THEN
    RAISE EXCEPTION 'Billing: Manage permission required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF pay.status <> 'pending' THEN RAISE EXCEPTION 'Payment is already %', pay.status; END IF;
  IF pay.plan_id IS NULL THEN RAISE EXCEPTION 'Payment has no plan'; END IF;
  IF pay.billing_cycle <> 'yearly' THEN
    RAISE EXCEPTION 'Legacy monthly payment: monthly billing was removed. Reject it and ask the user to resubmit a yearly payment.';
  END IF;
  INSERT INTO public.subscriptions (user_id,plan_id,status,billing_cycle,start_date,renewal_date,cancelled_at,payment_provider)
  VALUES (pay.user_id,pay.plan_id,'active','yearly',now(),now()+interval '1 year',NULL,'manual')
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id=EXCLUDED.plan_id,status='active',billing_cycle='yearly',
        start_date=EXCLUDED.start_date,renewal_date=EXCLUDED.renewal_date,cancelled_at=NULL,payment_provider='manual'
  RETURNING id INTO sub_id;
  UPDATE public.payments SET status='verified',verified_at=now(),subscription_id=sub_id WHERE id=pay.id;
  PERFORM public.record_referral_commission(pay.id);
  RETURN sub_id;
END;
$;

CREATE OR REPLACE FUNCTION public.reject_payment(_payment_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_admin_permission('billing','manage')
  ) THEN
    RAISE EXCEPTION 'Billing: Manage permission required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.payments SET status='failed',admin_note=_note
   WHERE id=_payment_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or not pending'; END IF;
END;
$;

CREATE OR REPLACE FUNCTION public.admin_process_payment(
  _payment_id uuid,
  _decision text,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  pay public.payments%ROWTYPE;
  granted_subscription uuid;
  clean_note text := left(trim(coalesce(_note, '')), 500);
BEGIN
  IF actor IS NULL OR NOT (
    public.has_role(actor, 'admin'::public.app_role)
    OR public.has_admin_permission('billing','manage')
  ) THEN
    RAISE EXCEPTION 'Billing: Manage permission required' USING ERRCODE = '42501';
  END IF;
  IF _decision IS NULL OR _decision NOT IN ('verify','reject') THEN
    RAISE EXCEPTION 'Decision must be verify or reject' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF pay.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002';
  END IF;
  IF pay.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending payments can be reviewed' USING ERRCODE = '23514';
  END IF;

  IF _decision = 'verify' THEN
    SELECT public.approve_payment(_payment_id) INTO granted_subscription;
    INSERT INTO public.admin_billing_audit(
      actor_user_id,payment_id,target_user_id,action,previous_status,new_status,amount,currency,note
    ) VALUES (
      actor,pay.id,pay.user_id,'payment_verified',pay.status,'verified',pay.amount,pay.currency,NULL
    );
    RETURN jsonb_build_object('success',true,'decision','verify','subscription_id',granted_subscription);
  END IF;

  PERFORM public.reject_payment(
    _payment_id,
    coalesce(nullif(clean_note,''),'Payment could not be verified. Please contact support.')
  );
  INSERT INTO public.admin_billing_audit(
    actor_user_id,payment_id,target_user_id,action,previous_status,new_status,amount,currency,note
  ) VALUES (
    actor,pay.id,pay.user_id,'payment_rejected',pay.status,'failed',pay.amount,pay.currency,
    coalesce(nullif(clean_note,''),'Payment could not be verified. Please contact support.')
  );
  RETURN jsonb_build_object('success',true,'decision','reject');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_payment(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_payment(uuid,text,text) TO authenticated, service_role;
