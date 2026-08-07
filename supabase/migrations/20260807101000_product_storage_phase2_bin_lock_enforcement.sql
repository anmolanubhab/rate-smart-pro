-- Product Storage Management, Phase 2, step 2: actually enforce `is_locked`.
--
-- The Phase 1 design doc (docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md, section
-- 9) said is_locked would be "enforced at the RPC layer... reject a locked
-- bin as a target" -- that check was never actually added to
-- grn_item_apply_hold_stock() or the dispatch bin resolver. Closing that gap
-- now: an EXPLICITLY chosen bin (a user picked it on the GRN/dispatch line)
-- that is locked is rejected with a clear error. Auto-resolved bins
-- (product default / warehouse unassigned) are NOT checked here -- a locked
-- default bin shouldn't silently break normal receiving/dispatch for a
-- product; only a user's explicit choice to put stock into a bin that's
-- mid-audit gets stopped.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run.
-- Reversible: restore both function bodies from
-- 20260807060000_product_storage_grn_putaway.sql /
-- 20260807070000_product_storage_dispatch_picking.sql.

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
  v_biz uuid;
  v_warehouse_id uuid;
  v_stock_after numeric;
  v_bin_id uuid;
  v_default_bin_warehouse_id uuid;
  v_bin_locked boolean;
BEGIN
  SELECT status, business_id, warehouse_id INTO v_grn_status, v_biz, v_warehouse_id
  FROM public.goods_receipts WHERE id = NEW.goods_receipt_id;
  IF v_grn_status <> 'received' THEN RETURN NEW; END IF;

  v_received := COALESCE(NEW.received_qty, 0);
  v_accepted := COALESCE(NEW.stock_accepted_qty, NEW.accepted_qty, 0);
  v_damaged := GREATEST(v_received - v_accepted, 0);

  IF NEW.product_id IS NOT NULL AND v_received > 0 THEN
    v_bin_id := NEW.bin_id;

    IF v_bin_id IS NOT NULL THEN
      SELECT is_locked INTO v_bin_locked FROM public.warehouse_bins WHERE id = v_bin_id;
      IF v_bin_locked THEN
        RAISE EXCEPTION 'Bin is locked (physical count in progress) and cannot receive stock right now';
      END IF;
    END IF;

    IF v_bin_id IS NULL THEN
      SELECT p.default_bin_id, z.warehouse_id
        INTO v_bin_id, v_default_bin_warehouse_id
      FROM public.products p
      LEFT JOIN public.warehouse_bins wb ON wb.id = p.default_bin_id
      LEFT JOIN public.warehouse_racks r ON r.id = wb.rack_id
      LEFT JOIN public.warehouse_zones z ON z.id = r.zone_id
      WHERE p.id = NEW.product_id;

      IF v_bin_id IS NULL OR v_default_bin_warehouse_id IS DISTINCT FROM v_warehouse_id THEN
        v_bin_id := public.seed_unassigned_bin_for_warehouse(v_warehouse_id);
      END IF;
    END IF;

    UPDATE public.products
       SET stock_on_hold = stock_on_hold + v_received - v_accepted,
           stock = stock + v_accepted
     WHERE id = NEW.product_id
    RETURNING stock INTO v_stock_after;

    IF v_accepted > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn', v_accepted, v_warehouse_id, v_bin_id, v_stock_after - v_accepted, v_stock_after, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — accepted qty moved to available stock');
    END IF;
    IF v_received - v_accepted > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn_hold', v_received - v_accepted, v_warehouse_id, v_bin_id, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — qty held pending QC/debit note');
    END IF;
  END IF;

  UPDATE public.goods_receipt_items
     SET qc_status = CASE
           WHEN v_damaged <= 0 THEN 'passed'
           WHEN v_accepted <= 0 THEN 'failed'
           ELSE 'partially_passed'
         END,
         qc_reviewed_at = now(),
         bin_id = COALESCE(v_bin_id, bin_id)
   WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

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
  v_bin_locked boolean;
BEGIN
  IF _requested_bin_id IS NOT NULL THEN
    SELECT is_locked INTO v_bin_locked FROM public.warehouse_bins WHERE id = _requested_bin_id;
    IF v_bin_locked THEN
      RAISE EXCEPTION 'Bin is locked (physical count in progress) and cannot be picked from right now';
    END IF;
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
