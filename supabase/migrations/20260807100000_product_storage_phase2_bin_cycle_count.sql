-- Product Storage Management, Phase 2, step 1: bin-level physical
-- verification / cycle count. Mirrors Phase 1's surgical-diff discipline:
-- bin_id is nullable and additive, existing warehouse-level stock takes
-- keep working exactly as before.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout, safe to re-run.
-- Reversible: ALTER TABLE stock_take_items DROP COLUMN bin_id; DROP
-- FUNCTION stock_take_load_bin_products; restore post_stock_take from
-- this migration's "before" state (see inline comment).

ALTER TABLE public.stock_take_items ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES public.warehouse_bins(id);
CREATE INDEX IF NOT EXISTS idx_stock_take_items_bin ON public.stock_take_items(bin_id);

-- Bulk-load every product currently tracked at a specific bin (via
-- product_locations or the ledger, same traversal as merge_bin) onto a
-- draft sheet, with system_qty computed at bin granularity.
CREATE OR REPLACE FUNCTION public.stock_take_load_bin_products(_sheet_id uuid, _bin_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sheet record;
  v_bin_business_id uuid;
  v_inserted integer;
BEGIN
  SELECT * INTO v_sheet FROM public.stock_take_sheets WHERE id = _sheet_id;
  IF v_sheet.id IS NULL THEN
    RAISE EXCEPTION 'Stock take sheet not found';
  END IF;
  IF NOT public.is_business_member(v_sheet.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_sheet.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft sheets can have lines added';
  END IF;

  SELECT business_id INTO v_bin_business_id FROM public.warehouse_bins WHERE id = _bin_id;
  IF v_bin_business_id IS NULL OR v_bin_business_id <> v_sheet.business_id THEN
    RAISE EXCEPTION 'Bin not found for this business';
  END IF;

  INSERT INTO public.stock_take_items (sheet_id, product_id, bin_id, system_qty)
  SELECT _sheet_id, p.id, _bin_id, public.get_bin_available_stock(p.id, _bin_id)
  FROM public.products p
  WHERE p.id IN (
    SELECT DISTINCT product_id FROM public.product_locations WHERE bin_id = _bin_id
    UNION
    SELECT DISTINCT product_id FROM public.inventory_movements WHERE bin_id = _bin_id
  )
  AND p.is_deleted IS NOT TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_take_items sti
    WHERE sti.sheet_id = _sheet_id AND sti.product_id = p.id AND sti.bin_id IS NOT DISTINCT FROM _bin_id
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

-- post_stock_take: same variance/posting logic as before, bin_id threaded
-- into the inventory_movements insert alongside warehouse_id (null for
-- warehouse-level lines, exactly as today).
CREATE OR REPLACE FUNCTION public.post_stock_take(_sheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sheet record;
  v_item record;
  v_delta numeric;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT * INTO v_sheet FROM public.stock_take_sheets WHERE id = _sheet_id FOR UPDATE;
  IF v_sheet.id IS NULL THEN
    RAISE EXCEPTION 'Stock take sheet not found';
  END IF;
  IF NOT public.is_business_member(v_sheet.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_sheet.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft sheets can be posted (current status: %)', v_sheet.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_take_items WHERE sheet_id = _sheet_id) THEN
    RAISE EXCEPTION 'Sheet has no line items';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_take_items
    WHERE sheet_id = _sheet_id AND counted_qty IS NOT NULL AND counted_qty <> system_qty
  LOOP
    v_delta := v_item.counted_qty - v_item.system_qty;

    SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = v_item.product_id;
    v_after := v_before + v_delta;

    UPDATE public.products SET stock = v_after WHERE id = v_item.product_id;

    INSERT INTO public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id,
       stock_before, stock_after, reference_id, reference_type, notes)
    VALUES
      (auth.uid(), v_sheet.business_id, v_item.product_id, 'stock_take', v_delta, v_sheet.warehouse_id, v_item.bin_id,
       v_before, v_after, _sheet_id, 'stock_take', 'Stock take ' || COALESCE(v_sheet.sheet_no, _sheet_id::text) || ' variance');
  END LOOP;

  UPDATE public.stock_take_sheets
    SET status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_at = now()
    WHERE id = _sheet_id;
END;
$function$;
