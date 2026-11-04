-- Atomic affiliate withdrawal review: mutation and mandatory audit share one transaction.
CREATE OR REPLACE FUNCTION public.admin_update_affiliate_withdrawal(
  _withdrawal_id uuid,
  _status text,
  _admin_note text DEFAULT NULL,
  _transaction_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_row public.withdrawals%ROWTYPE;
  changed_row public.withdrawals%ROWTYPE;
  clean_note text := nullif(left(trim(coalesce(_admin_note, '')), 1000), '');
  clean_reference text := nullif(left(trim(coalesce(_transaction_reference, '')), 200), '');
  allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_admin_permission('affiliate','manage')
  ) THEN
    RAISE EXCEPTION 'Affiliate: Manage permission required' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('approved','rejected','paid') THEN
    RAISE EXCEPTION 'Unsupported withdrawal status' USING ERRCODE = '22023';
  END IF;
  IF _status = 'paid' AND clean_reference IS NULL THEN
    RAISE EXCEPTION 'A payment transaction reference is required before marking paid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_row FROM public.withdrawals
   WHERE id = _withdrawal_id FOR UPDATE;
  IF current_row.id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'P0002';
  END IF;
  allowed := (_status IN ('approved','rejected') AND current_row.status = 'pending')
          OR (_status IN ('paid','rejected') AND current_row.status = 'approved');
  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid withdrawal transition: % -> %', current_row.status, _status
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.withdrawals
     SET status = _status,
         admin_note = clean_note,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         approved_at = CASE WHEN _status = 'approved' THEN now() ELSE approved_at END,
         paid_at = CASE WHEN _status = 'paid' THEN now() ELSE paid_at END,
         transaction_reference = CASE WHEN _status = 'paid' THEN clean_reference ELSE transaction_reference END
   WHERE id = _withdrawal_id
   RETURNING * INTO changed_row;

  -- If this insert fails, PostgreSQL rolls back the withdrawal update too.
  INSERT INTO public.admin_action_audit(
    admin_user_id, action, target_type, target_id, details
  ) VALUES (
    auth.uid(), 'affiliate_withdrawal_' || _status, 'withdrawal', _withdrawal_id::text,
    jsonb_build_object(
      'user_id', changed_row.user_id,
      'amount', changed_row.amount,
      'method', changed_row.method,
      'previous_status', current_row.status,
      'new_status', changed_row.status,
      'transaction_reference', changed_row.transaction_reference
    )
  );

  RETURN jsonb_build_object(
    'id', changed_row.id, 'user_id', changed_row.user_id, 'amount', changed_row.amount,
    'method', changed_row.method, 'status', changed_row.status,
    'requested_at', changed_row.requested_at, 'approved_at', changed_row.approved_at,
    'paid_at', changed_row.paid_at, 'admin_note', changed_row.admin_note,
    'transaction_reference', changed_row.transaction_reference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_affiliate_withdrawal(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_affiliate_withdrawal(uuid,text,text,text) TO authenticated;
