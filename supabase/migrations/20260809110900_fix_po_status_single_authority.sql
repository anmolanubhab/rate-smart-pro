-- P0 remediation (5/6): single authoritative function for PO pending
-- quantity / status, based on ACCEPTED quantity (not billed).
--
-- Verified root cause (forensic audit, 2026-08-09): two AFTER INSERT
-- triggers fire on goods_receipt_items and both write purchase_orders
-- .status, from different bases:
--   - trg_gri_recalc -> trg_recalc_po_from_grn_items() ->
--     recalc_po_quantities() -- writes total_qty/received_qty/pending_qty
--     (= total - RECEIVED/BILLED qty) and status, based on billed qty.
--   - trg_grn_item_apply_hold_stock -> grn_item_apply_hold_stock() -- at
--     the end of the (otherwise correct) stock-posting function,
--     independently recomputes and overwrites purchase_orders.status
--     from ACCEPTED qty, fires second (alphabetical trigger-name
--     ordering) and wins -- leaving pending_qty (billed-based) and status
--     (accepted-based) able to directly contradict each other whenever
--     billed and accepted diverge (e.g. pending_qty=0 while
--     status='partially_received').
--
-- Fix: consolidate into the ONE function that already owns pending_qty
-- (recalc_po_quantities), rebasing both pending_qty and status on
-- ACCEPTED qty (the physically-correct basis -- a PO isn't truly
-- fulfilled until goods are accepted, not merely billed), and remove the
-- now-redundant/conflicting status write from grn_item_apply_hold_stock().
-- Its stock-posting, movement-logging, and QC-status logic is otherwise
-- untouched. received_qty (billed) is still reported, unchanged in
-- meaning, alongside a new accepted_qty column for transparency.

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS accepted_qty numeric;

CREATE OR REPLACE FUNCTION public.recalc_po_quantities(_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_received numeric;
  v_accepted numeric;
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

  SELECT COALESCE(SUM(gri.accepted_qty), 0) INTO v_accepted
  FROM public.goods_receipt_items gri
  JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
  WHERE gr.purchase_order_id = _po_id
    AND gr.status = 'received';

  v_pending := GREATEST(v_total - v_accepted, 0);

  SELECT status INTO v_status FROM public.purchase_orders WHERE id = _po_id;
  IF v_status IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.purchase_orders
  SET total_qty = v_total,
      received_qty = v_received,
      accepted_qty = v_accepted,
      pending_qty = v_pending,
      status = CASE
        WHEN v_status IN ('approved','ordered','partially_received','received') THEN
          CASE
            WHEN v_total > 0 AND v_accepted >= v_total THEN 'received'::purchase_order_status
            WHEN v_accepted > 0 THEN 'partially_received'::purchase_order_status
            ELSE 'approved'::purchase_order_status
          END
        ELSE v_status
      END,
      updated_at = now()
  WHERE id = _po_id;
END;
$function$;

-- Remove the now-redundant/conflicting PO-status write; stock posting,
-- movement logging, and QC-status logic below it are unchanged.
-- trg_gri_recalc already fires on the same AFTER INSERT event and is now
-- the sole writer of purchase_orders.status/pending_qty.
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
BEGIN
  SELECT status, business_id
    INTO v_grn_status, v_biz
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

  RETURN NEW;
END;
$function$;
