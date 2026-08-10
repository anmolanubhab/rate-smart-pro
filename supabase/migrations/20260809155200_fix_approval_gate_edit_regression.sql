-- P1 remediation (3d/4): fix a regression introduced by P0 Fix 6.
--
-- block_update_with_pending_approval() blocks ANY direct UPDATE to a
-- record with a pending approval_requests row, with exactly two
-- bypasses: nested-trigger depth, or apply_approval_action()'s bypass
-- GUC. apply_approval_action() only covers action_type IN
-- ('delete','cancel','unlock','reopen') -- 'edit' was deliberately left
-- going through the original approveRequest() JS path, which still does
-- a raw .update(patch). That raw update is a direct top-level client
-- call satisfying neither bypass condition, so the trigger now blocks it
-- outright: before Fix 6, 'edit' approvals were insecure-but-functional;
-- after Fix 6, they are broken (approving an edit-type request now
-- fails). No live data was affected -- the one existing approval_requests
-- row is action_type='delete', already applied -- but this needs
-- correcting before it's hit in practice.
--
-- Fix: when the pending request's action_type is 'edit', let the update
-- through instead of raising -- restores exact pre-Fix-6 behavior for
-- 'edit' specifically (still not DB-enforced, exactly as already
-- documented as a known, flagged gap), while keeping delete/cancel/
-- unlock/reopen enforcement fully intact. A generic, safely-validated
-- dynamic column-patch applier for 'edit' is real future work, not
-- something to retrofit here under time pressure.

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

  -- 'edit' approvals are not applied via apply_approval_action() yet
  -- (see migration comment) -- don't block them, matches the documented,
  -- pre-existing gap rather than breaking the feature outright.
  IF v_action_type = 'edit' THEN
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
