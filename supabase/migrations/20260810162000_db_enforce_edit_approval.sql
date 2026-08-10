-- P2 fix (RD-Pro workflow audit, 2026-08-10): the generic Approval Center
-- (approval_requests) is DB-enforced for delete/cancel/unlock/reopen via
-- apply_approval_action() + the trg_approval_gate trigger, but 'edit'
-- requests were an explicit carve-out: block_update_with_pending_approval()
-- returned early for action_type='edit', and approveRequest() (src/lib/
-- approvals.ts) applied the patch with a plain client-side `.update()`,
-- gated only by canApproveRequestFrom() in the browser. Any business user
-- with ordinary table UPDATE rights on the record (which most roles that
-- can request an edit already have) could edit it directly while an
-- edit-approval was still pending -- the approval added a request trail,
-- but nothing actually enforced waiting for it.
--
-- Fix: apply_approval_action() now supports action_type='edit' too, using
-- Postgres's standard jsonb_populate_record() merge idiom to apply an
-- arbitrary JSON patch onto only the real, non-identity columns of the
-- target table (never id/business_id/user_id/created_at, and never a
-- column name that isn't actually a column of that table -- both enforced
-- server-side, not just by the client's `delete patch.id` etc.). The
-- trigger's 'edit' carve-out is removed, so a pending edit request now
-- blocks direct UPDATEs the exact same way delete/cancel/unlock/reopen
-- already do, unless the caller goes through apply_approval_action().

CREATE OR REPLACE FUNCTION public.apply_approval_action(_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.approval_requests%ROWTYPE;
  v_table text;
  v_uid uuid := auth.uid();
  v_patch jsonb;
  v_cols text;
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;
  IF NOT public.has_business_role(r.business_id, ARRAY['owner','admin','manager']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to approve this request';
  END IF;
  IF r.action_type NOT IN ('delete','cancel','unlock','reopen','edit') THEN
    RAISE EXCEPTION 'apply_approval_action does not support action_type %', r.action_type;
  END IF;

  v_table := CASE r.module
    WHEN 'sales_invoice' THEN 'sales_invoices'
    WHEN 'dispatch' THEN 'dispatches'
    WHEN 'order' THEN 'orders'
    WHEN 'voucher' THEN 'vouchers'
    WHEN 'inventory_adjustment' THEN 'inventory_adjustments'
    WHEN 'party' THEN 'parties'
    WHEN 'product' THEN 'products'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unsupported approval module: %', r.module;
  END IF;

  PERFORM set_config('rdpro.approval_bypass', _request_id::text, true);

  IF r.action_type = 'delete' THEN
    EXECUTE format(
      'UPDATE public.%I SET is_deleted = true, deleted_at = now(), deleted_by = %L, delete_reason = %L WHERE id = %L',
      v_table, v_uid, r.reason, r.record_id
    );
  ELSIF r.action_type = 'cancel' THEN
    EXECUTE format(
      'UPDATE public.%I SET status = ''cancelled'', cancelled_at = now(), cancelled_by = %L, cancelled_reason = %L WHERE id = %L',
      v_table, v_uid, r.reason, r.record_id
    );
  ELSIF r.action_type = 'unlock' THEN
    EXECUTE format(
      'UPDATE public.%I SET is_locked = false, locked_at = NULL, locked_by = NULL WHERE id = %L',
      v_table, r.record_id
    );
  ELSIF r.action_type = 'reopen' THEN
    EXECUTE format(
      'UPDATE public.%I SET status = ''active'', cancelled_at = NULL, cancelled_by = NULL, cancelled_reason = NULL WHERE id = %L',
      v_table, r.record_id
    );
  ELSIF r.action_type = 'edit' THEN
    v_patch := COALESCE(r.after_snapshot, r.request_data, '{}'::jsonb);

    -- Only columns that are (a) present in the patch and (b) real columns
    -- of this specific table are ever touched -- and identity/audit
    -- columns are hard-excluded here too, not just trusted from the
    -- client's own `delete patch.id` etc.
    SELECT string_agg(quote_ident(k), ', ') INTO v_cols
    FROM jsonb_object_keys(v_patch) AS k
    WHERE k NOT IN ('id', 'business_id', 'user_id', 'created_at')
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table AND column_name = k
      );

    IF v_cols IS NOT NULL THEN
      -- jsonb_populate_record(t, patch) merges: keys present in patch
      -- override the row's current values (correctly cast to each
      -- column's real type by Postgres itself); keys absent from patch
      -- keep the row's existing value -- the standard safe idiom for
      -- "apply a partial jsonb patch to a row" without hand-rolled casts.
      EXECUTE format(
        'UPDATE public.%I AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(t, %L::jsonb)) WHERE t.id = %L',
        v_table, v_cols, v_cols, v_patch::text, r.record_id
      );
    END IF;
  END IF;

  UPDATE public.approval_requests
     SET status = 'approved', approved_by = v_uid, approved_at = now(), applied_at = now(), apply_error = NULL
   WHERE id = _request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_update_with_pending_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module text;
  v_pending_id uuid;
  v_action_type text;
  v_bypass text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_module := CASE TG_TABLE_NAME
    WHEN 'sales_invoices' THEN 'sales_invoice'
    WHEN 'dispatches' THEN 'dispatch'
    WHEN 'orders' THEN 'order'
    WHEN 'vouchers' THEN 'voucher'
    WHEN 'inventory_adjustments' THEN 'inventory_adjustment'
    WHEN 'parties' THEN 'party'
    WHEN 'products' THEN 'product'
    ELSE TG_TABLE_NAME
  END;

  SELECT id, action_type INTO v_pending_id, v_action_type FROM public.approval_requests
   WHERE module = v_module AND record_id = NEW.id AND status = 'pending'
   LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_bypass := current_setting('rdpro.approval_bypass', true);
  IF v_bypass IS NOT NULL AND v_bypass = v_pending_id::text THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This record has a pending approval request (%) -- direct changes are blocked until it is approved or rejected.', v_pending_id
    USING ERRCODE = '23503';
END;
$function$;

NOTIFY pgrst, 'reload schema';
