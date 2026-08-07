-- Fix: PO status (ordered -> partially_received -> received) was not
-- reliably updated when a GRN got posted.
--
-- Root cause: the only place that recomputed purchase_orders.status was
-- grn_apply_stock(), fired AFTER INSERT/UPDATE OF status on the
-- goods_receipts *header* row. saveGRN() always writes the header row
-- (insert, or draft->received update) *before* looping to (re)insert
-- goods_receipt_items -- so at the moment that trigger ran, the GRN's own
-- item rows never existed yet. Its "total accepted" calculation therefore
-- only ever counted *other, previously-received* GRNs against the PO,
-- silently excluding the very GRN being posted. For the common case of a
-- single GRN fully receiving a PO, this meant the PO status never left its
-- pre-receipt value at all.
--
-- (The equivalent problem for products.stock was already fixed by routing
-- that update through grn_item_apply_hold_stock(), an AFTER INSERT trigger
-- on goods_receipt_items itself -- correctly timed, since it fires once the
-- item row exists. This migration gives purchase_orders.status the same
-- fix, and removes the now-dead/incorrect status block from
-- grn_apply_stock() so there's a single source of truth again.)

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

  -- accepted uses the stock-unit-converted qty where available (Layer C1
  -- unit conversion), matching the convention grn_apply_stock() already
  -- uses; no stock-unit conversion exists for received_qty specifically, so
  -- it's used as-is (same limitation the pre-existing frontend code had).
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

  -- Recompute the linked PO's status now that *this* item row (and any
  -- siblings already inserted earlier in the same saveGRN() loop) actually
  -- exist -- unlike grn_apply_stock()'s header-level attempt at this same
  -- calculation, which always ran too early to see them.
  IF v_po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(poi.qty), 0) INTO v_total_ordered
      FROM public.purchase_order_items poi WHERE poi.purchase_order_id = v_po_id;

    SELECT COALESCE(SUM(gi.accepted_qty), 0) INTO v_total_accepted
      FROM public.goods_receipt_items gi
      JOIN public.goods_receipts g ON g.id = gi.goods_receipt_id
     WHERE g.purchase_order_id = v_po_id AND g.status = 'received';

    UPDATE public.purchase_orders
       SET status = CASE
         WHEN v_total_accepted >= v_total_ordered AND v_total_ordered > 0 THEN 'received'::public.po_status
         WHEN v_total_accepted > 0 THEN 'partially_received'::public.po_status
         ELSE status
       END
     WHERE id = v_po_id;
  END IF;

  RETURN NEW;
END;
$$;

-- grn_apply_stock() ran this same PO-status recalculation, but at the
-- header-update instant -- before this GRN's items exist -- so it always
-- computed against stale/incomplete data (see comment above). Drop that
-- block; grn_item_apply_hold_stock() above is now the single, correctly
-- timed place this happens. Its dead (already no-op, for the same timing
-- reason) direct products.stock update is left untouched -- unrelated to
-- this fix and already superseded by grn_item_apply_hold_stock's two-tier
-- stock/stock_on_hold handling.
CREATE OR REPLACE FUNCTION public.grn_apply_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'received' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'received' THEN RETURN NEW; END IF;

  -- Increase stock for each accepted item (no-op in practice: this fires
  -- before goods_receipt_items are (re)inserted by saveGRN(), so it never
  -- matches any rows -- superseded by grn_item_apply_hold_stock(). Left
  -- in place rather than removed to keep this migration scoped to the PO
  -- status bug.)
  UPDATE public.products p
     SET stock = p.stock + gi.accepted_qty
    FROM public.goods_receipt_items gi
   WHERE gi.goods_receipt_id = NEW.id
     AND gi.product_id = p.id
     AND gi.accepted_qty > 0;

  RETURN NEW;
END $$;
