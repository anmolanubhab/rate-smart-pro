-- Fix (RD-Pro workflow audit, remaining "Missing" item): deletePurchaseOrder()
-- already has DB-level enforcement (trg_prevent_purchase_order_delete_with_active_documents,
-- confirmed live) blocking delete once a GRN or active invoice exists.
-- cancelPurchaseOrder()'s equivalent GRN check (src/lib/purchaseOrders.ts:369-377)
-- had no DB-side counterpart -- a direct UPDATE setting status='cancelled'
-- could bypass it. Adds a matching BEFORE UPDATE trigger, same GRN check as
-- the existing delete trigger, scoped only to the transition into 'cancelled'.

CREATE OR REPLACE FUNCTION public.prevent_purchase_order_cancel_with_grn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_grn_number text;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT grn_number INTO v_grn_number
  FROM public.goods_receipts
  WHERE purchase_order_id = OLD.id
  LIMIT 1;

  IF v_grn_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Purchase Order is linked to Goods Receipt %. Cancel/remove it first.', v_grn_number;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_purchase_order_cancel_with_grn ON public.purchase_orders;
CREATE TRIGGER trg_prevent_purchase_order_cancel_with_grn
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_purchase_order_cancel_with_grn();

NOTIFY pgrst, 'reload schema';
