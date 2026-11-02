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
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
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
