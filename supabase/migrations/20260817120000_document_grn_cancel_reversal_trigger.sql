-- Documentation-only migration (GST-audit stock-reversal investigation,
-- 2026-08-17): the live database already has a trigger
-- trg_grn_cancel_reversal / function grn_cancel_reversal() that atomically
-- reverses products.stock/stock_on_hold and logs a proper
-- inventory_movements row (reference_type='goods_receipt_reversal') the
-- instant a GRN's status flips 'received' -> 'cancelled'. It exists in
-- production but was never checked into this migrations directory --
-- confirmed via pg_trigger/pg_proc, same class of repo/live schema drift
-- already seen once before (warehouses.name vs warehouse_name).
--
-- This CREATE OR REPLACE is a no-op against the current production
-- database (the definition below is copied verbatim from what's already
-- live) -- it exists purely so the repo's migration history matches
-- reality and this trigger is no longer undocumented.
--
-- Companion fix: src/lib/goodsReceipts.ts cancelGRN() used to ALSO apply
-- this same stock/hold reversal itself, as a second, separate, unlogged
-- UPDATE. Since neither side knew about the other, every GRN cancellation
-- silently reversed stock TWICE (confirmed live: cancelling GRNs for
-- accepted qty 10/5/8 on a disposable audit business dropped stock by
-- 20/10/16 instead of 10/5/8). That redundant client-side block has been
-- removed -- this trigger is now the sole place stock/hold reversal happens
-- on GRN cancel.

CREATE OR REPLACE FUNCTION public.grn_cancel_reversal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_accepted numeric;
  v_received numeric;
  v_damaged numeric;
  v_shortage numeric;
  v_held numeric;
  v_stock_before numeric;
  v_stock_after numeric;
BEGIN
  IF NOT (OLD.status = 'received' AND NEW.status = 'cancelled') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT * FROM public.goods_receipt_items WHERE goods_receipt_id = NEW.id
  LOOP
    IF r.product_id IS NULL THEN CONTINUE; END IF;

    v_accepted := COALESCE(r.stock_accepted_qty, r.accepted_qty, 0);
    v_received := COALESCE(r.received_qty, 0);
    v_damaged := COALESCE(r.damaged_qty, 0);
    v_shortage := COALESCE(r.shortage_qty, 0);
    v_held := v_received - v_accepted;

    IF v_accepted > 0 THEN
      UPDATE public.products
         SET stock = stock - v_accepted
       WHERE id = r.product_id
      RETURNING stock INTO v_stock_after;
      v_stock_before := v_stock_after + v_accepted;

      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), NEW.business_id, r.product_id, 'return', NULL, -v_accepted, v_stock_before, v_stock_after, NEW.id, 'goods_receipt_reversal', 'GRN cancelled — accepted qty reversed out of available stock');
    END IF;

    IF v_held > 0 THEN
      UPDATE public.products SET stock_on_hold = GREATEST(0, stock_on_hold - v_held) WHERE id = r.product_id;
    END IF;

    IF v_damaged > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), NEW.business_id, r.product_id, 'return', 'damaged', -v_damaged, NEW.id, 'goods_receipt_reversal', 'GRN cancelled — damaged qty reversed out of hold');
    END IF;
    IF v_shortage > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), NEW.business_id, r.product_id, 'return', 'short_supply', -v_shortage, NEW.id, 'goods_receipt_reversal', 'GRN cancelled — shortage qty reversed out of hold');
    END IF;
    IF v_held > 0 AND v_damaged = 0 AND v_shortage = 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, movement_reason, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), NEW.business_id, r.product_id, 'return', NULL, -v_held, NEW.id, 'goods_receipt_reversal', 'GRN cancelled — held qty reversed out of hold');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_grn_cancel_reversal ON public.goods_receipts;
CREATE TRIGGER trg_grn_cancel_reversal
  AFTER UPDATE OF status ON public.goods_receipts
  FOR EACH ROW
  WHEN (OLD.status = 'received' AND NEW.status = 'cancelled')
  EXECUTE FUNCTION public.grn_cancel_reversal();
