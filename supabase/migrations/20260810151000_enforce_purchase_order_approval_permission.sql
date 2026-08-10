-- P0 fix (RD-Pro workflow audit, 2026-08-10): Purchase Order approve/reject
-- was gated only in the UI (canGranular(role, "purchase.approve", ...) in
-- src/pages/purchase/PurchaseApprovals.tsx) -- the RLS policy
-- purchase_orders_writer_role_gate_upd only requires the caller's role be
-- one of owner/admin/manager/accountant/salesman, not the specific
-- "purchase.approve" permission. Any of those five roles could set
-- status='approved' directly via a Supabase call, bypassing the intended
-- approval control (e.g. a salesman, whose default template has
-- purchase.approve=false, per default_permissions_for_role('salesman')).
--
-- Fix: a BEFORE UPDATE trigger on purchase_orders that -- specifically on
-- the transition into 'approved' or 'rejected' -- checks the caller's real
-- effective permission (get_effective_permissions(), the same granular
-- 13-module x 10-action matrix the UI already reads, including any
-- business-specific permission_templates or per-user user_permissions
-- override) rather than just their coarse business_role. This mirrors the
-- enforcement style already proven correct in apply_approval_action() for
-- the generic Approval Center.

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_approval_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bu_id uuid;
  v_perms jsonb;
BEGIN
  -- Only the transition INTO approved/rejected is gated -- every other
  -- status change on this table (draft edits, ordered/received progression
  -- driven by recalc_po_quantities, cancel/close) is untouched.
  IF NEW.status NOT IN ('approved', 'rejected') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_bu_id
  FROM public.business_users
  WHERE business_id = NEW.business_id AND user_id = auth.uid() AND status = 'active';

  IF v_bu_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to approve or reject this Purchase Order';
  END IF;

  v_perms := public.get_effective_permissions(v_bu_id);
  IF COALESCE((v_perms -> 'purchase' ->> 'approve')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to approve or reject Purchase Orders';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_purchase_order_approval_permission ON public.purchase_orders;
CREATE TRIGGER trg_enforce_purchase_order_approval_permission
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_order_approval_permission();

NOTIFY pgrst, 'reload schema';
