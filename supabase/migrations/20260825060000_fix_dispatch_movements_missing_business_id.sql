-- Fix: dispatch stock-movement triggers never populated inventory_movements.
-- business_id, so any business_id-scoped query (get_stock_summary, the new
-- drill-down Stock Summary, get_stock_movement_register, ...) silently
-- excluded a product's original `dispatch` outward movement while still
-- counting its later `dispatch_cancel`/`return` reversal (which a DIFFERENT
-- function, reverse_sales_invoice_stock, already inserted business_id on
-- correctly). Net effect on a dispatched-then-cancelled product: a phantom
-- extra per-warehouse row in Stock Summary and an incorrect negative
-- closing balance -- reported live: N9323050 showing a duplicate row and a
-- -16 closing that shouldn't exist.
--
-- Root cause, confirmed via pg_get_functiondef + live data:
--   dispatch_items_stock_sync()  -- INSERT/DELETE/UPDATE on dispatch_items
--   dispatch_cancel_reversal()   -- dispatch status -> 'cancelled'
-- both already resolve a business_id local variable (used for sales_config/
-- stock_negative_allowed lookups) but never included it in the
-- `INSERT INTO inventory_movements(...)` column list, leaving that column
-- NULL on every row they wrote. reverse_sales_invoice_stock() (a related,
-- newer function) already does this correctly -- these two didn't get the
-- same fix.
--
-- This migration (a) adds business_id to both inserts, (b) backfills every
-- existing NULL business_id row via product_id -> products.business_id,
-- the only always-correct source since inventory_movements.product_id is
-- never null and every product belongs to exactly one business.

CREATE OR REPLACE FUNCTION public.dispatch_items_stock_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id uuid;
  v_user_id uuid;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_qty numeric;
  v_old_qty numeric;
  v_warehouse_id uuid;
  v_business_id uuid;
  v_bin_id uuid;
  v_reduce_point text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = NEW.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_bin_id := public.resolve_dispatch_bin(v_product_id, v_warehouse_id, NEW.bin_id);
      IF NEW.bin_id IS DISTINCT FROM v_bin_id THEN
        UPDATE public.dispatch_items SET bin_id = v_bin_id WHERE id = NEW.id;
      END IF;

      SELECT stock_reduction_point INTO v_reduce_point FROM public.sales_config WHERE business_id = v_business_id;
      IF v_reduce_point IS DISTINCT FROM 'invoice' THEN
        v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
        SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
        v_after := v_before - v_qty;
        IF NOT public.stock_negative_allowed(v_business_id) AND v_after < 0 THEN
          RAISE EXCEPTION 'Insufficient stock for product % (available %, requested %)', v_product_id, v_before, v_qty;
        END IF;
        UPDATE public.products SET stock = v_after WHERE id = v_product_id;
        INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
        VALUES (v_user_id, v_business_id, v_product_id, 'dispatch', -v_qty, v_warehouse_id, v_bin_id, v_before, v_after, NEW.dispatch_id, 'dispatch', NULL);
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = OLD.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = OLD.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));

      SELECT stock_reduction_point INTO v_reduce_point FROM public.sales_config WHERE business_id = v_business_id;
      IF v_reduce_point IS DISTINCT FROM 'invoice' THEN
        v_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
        SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
        v_after := v_before + v_qty;
        UPDATE public.products SET stock = v_after WHERE id = v_product_id;
        INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
        VALUES (v_user_id, v_business_id, v_product_id, 'return', v_qty, v_warehouse_id, OLD.bin_id, v_before, v_after, OLD.dispatch_id, 'dispatch_reversal', 'Dispatch reversed');
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND (OLD.dispatched_qty <> NEW.dispatched_qty OR COALESCE(OLD.stock_dispatched_qty,-1) <> COALESCE(NEW.stock_dispatched_qty,-1)) THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = NEW.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));

      SELECT stock_reduction_point INTO v_reduce_point FROM public.sales_config WHERE business_id = v_business_id;
      IF v_reduce_point IS DISTINCT FROM 'invoice' THEN
        v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
        v_old_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
        v_delta := v_qty - v_old_qty;
        SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
        v_after := v_before - v_delta;
        IF NOT public.stock_negative_allowed(v_business_id) AND v_after < 0 THEN
          RAISE EXCEPTION 'Insufficient stock for product % (available %, requested %)', v_product_id, v_before, v_delta;
        END IF;
        UPDATE public.products SET stock = v_after WHERE id = v_product_id;
        INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
        VALUES (v_user_id, v_business_id, v_product_id, 'dispatch', -v_delta, v_warehouse_id, COALESCE(NEW.bin_id, OLD.bin_id), v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.dispatch_cancel_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_product_id uuid;
  v_user_id uuid;
  v_reduce_point text;
  v_qty numeric;
  v_before numeric;
  v_after numeric;
BEGIN
  IF NOT (OLD.status IN ('draft', 'confirmed') AND NEW.status = 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT stock_reduction_point INTO v_reduce_point
  FROM public.sales_config WHERE business_id = NEW.business_id;
  IF v_reduce_point IS NOT DISTINCT FROM 'invoice' THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT * FROM public.dispatch_items WHERE dispatch_id = NEW.id
  LOOP
    SELECT product_id, user_id INTO v_product_id, v_user_id
    FROM public.order_items WHERE id = r.order_item_id;
    IF v_product_id IS NULL THEN CONTINUE; END IF;

    v_qty := COALESCE(r.stock_dispatched_qty, r.dispatched_qty, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = v_product_id;
    v_after := v_before + v_qty;
    UPDATE public.products SET stock = v_after WHERE id = v_product_id;

    INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
    VALUES (v_user_id, NEW.business_id, v_product_id, 'return', v_qty, NEW.warehouse_id, r.bin_id, v_before, v_after, NEW.id, 'dispatch_reversal', 'Dispatch cancelled');
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Backfill every existing NULL business_id row (product_id is never null on
-- this table, and every product belongs to exactly one business, so this is
-- an unambiguous, safe repair).
UPDATE public.inventory_movements im
SET business_id = p.business_id
FROM public.products p
WHERE im.product_id = p.id
  AND im.business_id IS NULL;
