-- GRN physical verification (Issue #37 spec): separate "shortage" (physical
-- count discrepancy discovered at receiving) from "damaged", so a GRN line
-- can record accepted + short + damaged qty reconciling to the vendor-billed
-- /received qty. GRN qty itself is never rewritten to the accepted qty.
--
-- NOTE: goods_receipt_items.short_qty (existing) means ordered_qty -
-- received_qty (a PO-fulfillment gap vs the original PO) and is untouched.
-- The new shortage_qty column below is a different concept entirely:
-- physical-count shortage within what was actually received/billed.

ALTER TABLE public.goods_receipt_items
  ADD COLUMN shortage_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN stock_shortage_qty numeric,
  ADD COLUMN stock_received_qty numeric;

ALTER TABLE public.goods_receipt_items
  ADD CONSTRAINT goods_receipt_items_shortage_damaged_within_received_check
  CHECK (damaged_qty + shortage_qty <= received_qty);

COMMENT ON COLUMN public.goods_receipt_items.shortage_qty IS
  'Physical-verification shortage (part of received/billed qty found physically missing). Distinct from short_qty, which is the ordered-vs-received PO gap.';
COMMENT ON COLUMN public.goods_receipt_items.stock_received_qty IS
  'Unit-converted received_qty (mirrors stock_accepted_qty), used by recalc_po_quantities() so PO Pending compares stock units consistently.';

-- Fix: PO Pending must be driven by the vendor-billed/received qty, not the
-- post-QC accepted qty. Previously accepted_qty fed the PO header's
-- received_qty, so any damaged/short GRN silently inflated PO Pending --
-- wrong per the locked Issue #37 spec (PO commercial receipt = GRN qty,
-- unaffected by physical discrepancies discovered afterward).
CREATE OR REPLACE FUNCTION public.recalc_po_quantities(_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_received numeric;
  v_pending numeric;
  v_status purchase_order_status;
BEGIN
  IF _po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(COALESCE(stock_qty, qty)), 0) INTO v_total
  FROM public.purchase_order_items
  WHERE purchase_order_id = _po_id;

  SELECT COALESCE(SUM(COALESCE(gri.stock_received_qty, gri.received_qty)), 0) INTO v_received
  FROM public.goods_receipt_items gri
  JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
  WHERE gr.purchase_order_id = _po_id
    AND gr.status = 'received';

  v_pending := GREATEST(v_total - v_received, 0);

  SELECT status INTO v_status FROM public.purchase_orders WHERE id = _po_id;
  IF v_status IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.purchase_orders
  SET total_qty = v_total,
      received_qty = v_received,
      pending_qty = v_pending,
      status = CASE
        WHEN v_status IN ('approved','ordered','partially_received','received') THEN
          CASE
            WHEN v_total > 0 AND v_received >= v_total THEN 'received'::purchase_order_status
            WHEN v_received > 0 THEN 'partially_received'::purchase_order_status
            ELSE 'approved'::purchase_order_status
          END
        ELSE v_status
      END,
      updated_at = now()
  WHERE id = _po_id;
END;
$function$;

-- Split the single combined "hold" inventory_movements row into two
-- (damaged / short_supply), tagged via the existing movement_reason column,
-- so the +70/-3/-1=66 audit trail is traceable per Issue #37 spec. Balance
-- math on products.stock / products.stock_on_hold is unchanged.
CREATE OR REPLACE FUNCTION public.grn_item_apply_hold_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grn_status text;
  v_received numeric;
  v_accepted numeric;
  v_damaged numeric;
  v_shortage numeric;
  v_biz uuid;
  v_stock_after numeric;
  v_po_id uuid;
  v_total_ordered numeric;
  v_total_accepted numeric;
BEGIN
  SELECT status, business_id, purchase_order_id
    INTO v_grn_status, v_biz, v_po_id
    FROM public.goods_receipts WHERE id = NEW.goods_receipt_id;
  IF v_grn_status <> 'received' THEN RETURN NEW; END IF;

  v_received := COALESCE(NEW.received_qty, 0);
  v_accepted := COALESCE(NEW.stock_accepted_qty, NEW.accepted_qty, 0);
  v_damaged := COALESCE(NEW.damaged_qty, 0);
  v_shortage := COALESCE(NEW.shortage_qty, 0);

  IF NEW.product_id IS NOT NULL AND v_received > 0 THEN
    UPDATE public.products
       SET stock_on_hold = stock_on_hold + v_received - v_accepted,
           stock = stock + v_accepted
     WHERE id = NEW.product_id
    RETURNING stock INTO v_stock_after;

    IF v_accepted > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn', NULL, v_accepted, v_stock_after - v_accepted, v_stock_after, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — accepted qty moved to available stock');
    END IF;
    IF v_damaged > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn_hold', 'damaged', v_damaged, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — damaged qty held pending debit note');
    END IF;
    IF v_shortage > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn_hold', 'short_supply', v_shortage, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — physical shortage held pending debit note');
    END IF;
    -- Fallback for rows where received > accepted but neither bucket was
    -- populated (older client versions / edge case) -- preserves the prior
    -- single-row behavior so the hold total is never silently unlogged.
    IF v_received - v_accepted > 0 AND v_damaged = 0 AND v_shortage = 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn_hold', NULL, v_received - v_accepted, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — qty held pending QC/debit note');
    END IF;
  END IF;

  UPDATE public.goods_receipt_items
     SET qc_status = CASE
           WHEN (v_damaged + v_shortage) <= 0 THEN 'passed'
           WHEN v_accepted <= 0 THEN 'failed'
           ELSE 'partially_passed'
         END,
         qc_reviewed_at = now()
   WHERE id = NEW.id;

  IF v_po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(poi.qty), 0) INTO v_total_ordered
      FROM public.purchase_order_items poi WHERE poi.purchase_order_id = v_po_id;

    SELECT COALESCE(SUM(gi.accepted_qty), 0) INTO v_total_accepted
      FROM public.goods_receipt_items gi
      JOIN public.goods_receipts g ON g.id = gi.goods_receipt_id
     WHERE g.purchase_order_id = v_po_id AND g.status = 'received';

    UPDATE public.purchase_orders
       SET status = CASE
         WHEN v_total_accepted >= v_total_ordered AND v_total_ordered > 0 THEN 'received'
         WHEN v_total_accepted > 0 THEN 'partially_received'
         ELSE status
       END
     WHERE id = v_po_id;
  END IF;

  RETURN NEW;
END;
$function$;
