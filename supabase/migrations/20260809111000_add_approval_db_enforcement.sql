-- P0 remediation (6/6): DB-level enforcement of pending approval requests.
--
-- Verified live state (forensic audit, 2026-08-09): approval_requests has
-- correct RLS on itself, but nothing in the database knows a decision is
-- pending on the record it gates -- src/lib/approvals.ts::approveRequest()
-- applies the change with a plain client-side .update() on the mapped
-- table (MODULE_TABLE: sales_invoice->sales_invoices, dispatch->dispatches,
-- order->orders, voucher->vouchers, inventory_adjustment->
-- inventory_adjustments, party->parties, product->products). Any user
-- whose role already satisfies that table's normal RLS can update the
-- same record directly and skip the workflow entirely.
--
-- Fix: a generic BEFORE UPDATE trigger on all 7 mapped tables blocks ANY
-- update to a record with a `pending` approval_requests row, with two
-- narrow, deliberate bypasses:
--   - pg_trigger_depth() > 1 -- the update is nested inside another
--     trigger's own cascade (e.g. sales_invoice_autopost()'s internal
--     voucher_id self-update on sales_invoices), not a direct top-level
--     client call. A direct client call reaches this trigger at depth 1;
--     a call nested inside another trigger reaches it at depth 2+.
--   - a transaction-local GUC (rdpro.approval_bypass = <request_id>) set
--     by apply_approval_action() immediately before it performs the
--     approved mutation itself, in the same statement/transaction.
--
-- apply_approval_action() covers action_type IN ('delete','cancel',
-- 'unlock','reopen') -- fixed, known column sets, ported 1:1 from the
-- exact logic in approveRequest(). 'edit' is NOT covered here (arbitrary
-- JSON patch, no column allow-list defined anywhere yet -- porting that
-- safely needs a design this audit doesn't evidence) -- the trigger still
-- blocks a *direct* bypass of a pending edit request, but applying the
-- edit itself continues through the existing unchanged JS path, which
-- means 'edit' approvals are a known, flagged gap in this pass, not
-- silently dropped.
--
-- Records with NO pending approval_requests row are completely
-- unaffected -- normal non-approval transactions are untouched.

CREATE OR REPLACE FUNCTION public.block_update_with_pending_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module text;
  v_pending_id uuid;
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

  SELECT id INTO v_pending_id FROM public.approval_requests
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

DROP TRIGGER IF EXISTS trg_approval_gate ON public.sales_invoices;
CREATE TRIGGER trg_approval_gate BEFORE UPDATE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_approval();

DROP TRIGGER IF EXISTS trg_approval_gate ON public.dispatches;
CREATE TRIGGER trg_approval_gate BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_approval();

DROP TRIGGER IF EXISTS trg_approval_gate ON public.orders;
CREATE TRIGGER trg_approval_gate BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_approval();

DROP TRIGGER IF EXISTS trg_approval_gate ON public.vouchers;
CREATE TRIGGER trg_approval_gate BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_approval();

DROP TRIGGER IF EXISTS trg_approval_gate ON public.inventory_adjustments;
CREATE TRIGGER trg_approval_gate BEFORE UPDATE ON public.inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_approval();

DROP TRIGGER IF EXISTS trg_approval_gate ON public.parties;
CREATE TRIGGER trg_approval_gate BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_approval();

DROP TRIGGER IF EXISTS trg_approval_gate ON public.products;
CREATE TRIGGER trg_approval_gate BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_approval();

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
  IF r.action_type NOT IN ('delete','cancel','unlock','reopen') THEN
    RAISE EXCEPTION 'apply_approval_action does not support action_type %; edit approvals apply through the application layer', r.action_type;
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
  END IF;

  UPDATE public.approval_requests
     SET status = 'approved', approved_by = v_uid, approved_at = now(), applied_at = now(), apply_error = NULL
   WHERE id = _request_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_approval_action(uuid) FROM PUBLIC, anon;
