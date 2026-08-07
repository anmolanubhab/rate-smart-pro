-- Fix: grn_item_apply_hold_stock() (added by the previous migration,
-- 20260807130000) cast the recomputed PO status to `public.po_status` --
-- copied from the pre-existing (and, as established there, dead/mistimed)
-- block in grn_apply_stock(). That type does not actually exist on this
-- database: purchase_orders.status is typed `purchase_order_status`, not
-- `po_status` (a drift between the repo's original migration file, which
-- declares `po_status`, and what's actually live -- never previously
-- surfaced because the cast lived only in the mistimed, effectively-dead
-- code path).
--
-- Result: every accepted GRN item insert hit "type public.po_status does
-- not exist", aborting that INSERT statement entirely -- so posting a GRN
-- appeared to succeed (the header row lands as 'received') while zero
-- goods_receipt_items rows, stock, or QC status actually landed.
--
-- Fix: drop the explicit (wrong) cast. The UPDATE's CASE expression
-- already has an ELSE branch of `status` (the actual purchase_order_status
-- column), so Postgres infers the correct enum type for the THEN branches
-- from that -- no hardcoded type name needed at all.

CREATE OR REPLACE FUNCTION public.grn_item_apply_hold_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_grn_status text;
  v_received numeric;
  v_accepted numeric;
  v_damaged numeric;
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
  v_damaged := GREATEST(v_received - v_accepted, 0);

  IF NEW.product_id IS NOT NULL AND v_received > 0 THEN
    UPDATE public.products
       SET stock_on_hold = stock_on_hold + v_received - v_accepted,
           stock = stock + v_accepted
     WHERE id = NEW.product_id
    RETURNING stock INTO v_stock_after;

    IF v_accepted > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn', v_accepted, v_stock_after - v_accepted, v_stock_after, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — accepted qty moved to available stock');
    END IF;
    IF v_received - v_accepted > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn_hold', v_received - v_accepted, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — qty held pending QC/debit note');
    END IF;
  END IF;

  UPDATE public.goods_receipt_items
     SET qc_status = CASE
           WHEN v_damaged <= 0 THEN 'passed'
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
$$;
