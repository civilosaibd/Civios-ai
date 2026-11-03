-- Atomic affiliate withdrawal updates and audit records.
-- The service-role-only RPC is invoked exclusively by the authenticated Edge Function.
CREATE OR REPLACE FUNCTION public.admin_update_affiliate_withdrawal(
  _actor_user_id uuid,
  _withdrawal_id uuid,
  _status text,
  _admin_note text DEFAULT NULL,
  _transaction_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  current_row public.withdrawals%ROWTYPE;
  updated_row public.withdrawals%ROWTYPE;
  action_time timestamptz := clock_timestamp();
  clean_reference text := nullif(left(trim(coalesce(_transaction_reference, '')), 200), '');
  clean_note text := nullif(left(trim(coalesce(_admin_note, '')), 1000), '');
BEGIN
  IF _actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin actor is required' USING ERRCODE = '22023';
  END IF;
  IF _status IS NULL OR _status NOT IN ('approved', 'rejected', 'paid') THEN
    RAISE EXCEPTION 'Unsupported withdrawal status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_row
  FROM public.withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF current_row.id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    (current_row.status = 'pending' AND _status IN ('approved', 'rejected'))
    OR (current_row.status = 'approved' AND _status IN ('paid', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'Invalid withdrawal transition: % -> %', current_row.status, _status
      USING ERRCODE = '22023';
  END IF;
  IF _status = 'paid' AND clean_reference IS NULL THEN
    RAISE EXCEPTION 'A payment transaction reference is required before marking paid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.withdrawals
  SET status = _status,
      admin_note = clean_note,
      reviewed_by = _actor_user_id,
      reviewed_at = action_time,
      approved_at = CASE WHEN _status = 'approved' THEN action_time ELSE approved_at END,
      paid_at = CASE WHEN _status = 'paid' THEN action_time ELSE paid_at END,
      transaction_reference = CASE WHEN _status = 'paid' THEN clean_reference ELSE transaction_reference END
  WHERE id = _withdrawal_id
  RETURNING * INTO updated_row;

  INSERT INTO public.admin_action_audit (
    admin_user_id, action, target_type, target_id, details
  ) VALUES (
    _actor_user_id,
    'affiliate_withdrawal_' || _status,
    'withdrawal',
    _withdrawal_id::text,
    jsonb_build_object(
      'user_id', updated_row.user_id,
      'amount', updated_row.amount,
      'method', updated_row.method,
      'transaction_reference', updated_row.transaction_reference
    )
  );

  RETURN jsonb_build_object(
    'id', updated_row.id,
    'user_id', updated_row.user_id,
    'amount', updated_row.amount,
    'method', updated_row.method,
    'status', updated_row.status,
    'requested_at', updated_row.requested_at,
    'approved_at', updated_row.approved_at,
    'paid_at', updated_row.paid_at,
    'admin_note', updated_row.admin_note,
    'transaction_reference', updated_row.transaction_reference
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_affiliate_withdrawal(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_affiliate_withdrawal(uuid, uuid, text, text, text)
  TO service_role;
