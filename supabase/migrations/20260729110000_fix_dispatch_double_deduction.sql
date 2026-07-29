-- BUG FIX: dispatch_items had TWO independent triggers both deducting
-- products.stock on every dispatch (and both restoring on delete) —
-- classic leftover-from-migration debt: an older stock_movements-based
-- system (deduct_stock_on_dispatch / restore_stock_on_dispatch_delete)
-- was never retired when the newer inventory_movements-based system
-- (dispatch_items_stock_sync) was built alongside it.
--
-- Confirmed live: the only 2 currently-live dispatch_items rows (both for
-- product M1080540, qty 20 + 10) had been double-deducted — 30 units of
-- stock were wrongly removed. That correction is applied separately (not
-- in this migration) after being shown to and confirmed by the business
-- owner, since it changes real inventory data.
--
-- Fix: BEFORE-trigger becomes validation-only (pending-qty check,
-- negative-stock check, part_number autofill) — no stock mutation, no
-- write to the legacy stock_movements table. AFTER-trigger
-- (dispatch_items_stock_sync) remains the SOLE writer of products.stock
-- and public.inventory_movements (the canonical ledger every report
-- reads from), now also correctly honoring stock_dispatched_qty (unit
-- conversion) which it previously ignored. The now-fully-redundant
-- restore-on-delete trigger is dropped.
--
-- Rollback (if ever needed): re-run this migration's OLD bodies — the
-- pre-fix function definitions are preserved in this repo's git history
-- (see the commit introducing this file) — and re-create the dropped
-- trigger with:
--   CREATE TRIGGER trg_restore_stock_on_dispatch_delete AFTER DELETE ON
--   public.dispatch_items FOR EACH ROW EXECUTE FUNCTION restore_stock_on_dispatch_delete();

CREATE OR REPLACE FUNCTION public.deduct_stock_on_dispatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_current_stock NUMERIC;
    v_pending_qty NUMERIC;
    v_part_number TEXT;
    v_qty_to_deduct NUMERIC;
BEGIN
    SELECT user_id INTO v_user_id FROM public.dispatches WHERE id = NEW.dispatch_id;

    SELECT pending_qty, part_number INTO v_pending_qty, v_part_number FROM public.order_items WHERE id = NEW.order_item_id;

    IF NEW.part_number IS NULL OR NEW.part_number = '' THEN
        NEW.part_number := v_part_number;
    END IF;

    IF NEW.dispatched_qty > v_pending_qty THEN
        RAISE EXCEPTION 'Dispatch quantity (%) exceeds pending order quantity (%)', NEW.dispatched_qty, v_pending_qty;
    END IF;

    v_qty_to_deduct := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);

    SELECT stock INTO v_current_stock
    FROM public.products
    WHERE user_id = v_user_id AND LOWER(TRIM(part_number)) = LOWER(TRIM(NEW.part_number));

    IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Product with part number % not found for this user', NEW.part_number;
    END IF;

    IF v_current_stock < v_qty_to_deduct THEN
        RAISE EXCEPTION 'Insufficient stock for part number %. Available: %, Requested: %', NEW.part_number, v_current_stock, v_qty_to_deduct;
    END IF;

    -- Validation only from here on — actual stock mutation + ledger entry
    -- now happens exactly once, in dispatch_items_stock_sync() (AFTER trigger).
    RETURN NEW;
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - v_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'dispatch', -v_qty, v_before, v_after, NEW.dispatch_id, 'dispatch', NULL);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = OLD.order_item_id;
    IF v_product_id IS NOT NULL THEN
      v_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before + v_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'return', v_qty, v_before, v_after, OLD.dispatch_id, 'dispatch_reversal', 'Dispatch reversed');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND (OLD.dispatched_qty <> NEW.dispatched_qty OR COALESCE(OLD.stock_dispatched_qty,-1) <> COALESCE(NEW.stock_dispatched_qty,-1)) THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
      v_old_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
      v_delta := v_qty - v_old_qty;
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - v_delta;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'dispatch', -v_delta, v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
    END IF;
  END IF;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_dispatch_delete ON public.dispatch_items;
