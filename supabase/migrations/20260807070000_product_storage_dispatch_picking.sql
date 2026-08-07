-- Product Storage Management, Phase 1, step 6: dispatch/picking bin selection.
-- SURGICAL CHANGE ONLY: same qty/stock arithmetic as the existing
-- dispatch_items_stock_sync() (see 20260729140000_warehouse_tag_existing_flows.sql,
-- which itself notes this trigger was already fixed for a double-deduction
-- bug — deduct_stock_on_dispatch() is validation-only, untouched here).
-- bin_id is resolved the same way as GRN put-away and threaded into all
-- three inventory_movements inserts, alongside warehouse_id.
-- See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md section 7.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE, safe to re-run.
-- Reversible: ALTER TABLE dispatch_items DROP COLUMN bin_id; restore the
-- prior function body from 20260729140000_warehouse_tag_existing_flows.sql.

ALTER TABLE public.dispatch_items ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES public.warehouse_bins(id);

CREATE OR REPLACE FUNCTION public.resolve_dispatch_bin(_product_id uuid, _warehouse_id uuid, _requested_bin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bin_id uuid;
  v_bin_warehouse_id uuid;
BEGIN
  IF _requested_bin_id IS NOT NULL THEN
    RETURN _requested_bin_id;
  END IF;

  SELECT p.default_bin_id, z.warehouse_id
    INTO v_bin_id, v_bin_warehouse_id
  FROM public.products p
  LEFT JOIN public.warehouse_bins wb ON wb.id = p.default_bin_id
  LEFT JOIN public.warehouse_racks r ON r.id = wb.rack_id
  LEFT JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE p.id = _product_id;

  IF v_bin_id IS NULL OR v_bin_warehouse_id IS DISTINCT FROM _warehouse_id THEN
    v_bin_id := public.seed_unassigned_bin_for_warehouse(_warehouse_id);
  END IF;

  RETURN v_bin_id;
END;
$function$;

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
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = NEW.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_bin_id := public.resolve_dispatch_bin(v_product_id, v_warehouse_id, NEW.bin_id);
      v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - v_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'dispatch', -v_qty, v_warehouse_id, v_bin_id, v_before, v_after, NEW.dispatch_id, 'dispatch', NULL);
      IF NEW.bin_id IS DISTINCT FROM v_bin_id THEN
        UPDATE public.dispatch_items SET bin_id = v_bin_id WHERE id = NEW.id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = OLD.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = OLD.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before + v_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'return', v_qty, v_warehouse_id, OLD.bin_id, v_before, v_after, OLD.dispatch_id, 'dispatch_reversal', 'Dispatch reversed');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND (OLD.dispatched_qty <> NEW.dispatched_qty OR COALESCE(OLD.stock_dispatched_qty,-1) <> COALESCE(NEW.stock_dispatched_qty,-1)) THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = NEW.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
      v_old_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
      v_delta := v_qty - v_old_qty;
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - v_delta;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'dispatch', -v_delta, v_warehouse_id, COALESCE(NEW.bin_id, OLD.bin_id), v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
    END IF;
  END IF;
  RETURN NULL;
END $function$;
