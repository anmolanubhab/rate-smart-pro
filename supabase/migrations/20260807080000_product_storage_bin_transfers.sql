-- Product Storage Management, Phase 1, step 7: bin-to-bin transfers, and
-- Bin Merge/Split as thin wrappers over the same ledger mechanism.
-- See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md sections 7 and 7a.
--
-- stock_transfers had `check (from_warehouse_id is null or to_warehouse_id
-- is null or from_warehouse_id <> to_warehouse_id)`, which blocks the most
-- common bin-transfer case: moving stock between two bins in the *same*
-- warehouse. Relaxed here; the "something must actually move" invariant
-- moves to a per-item check on stock_transfer_items instead (a header-level
-- CHECK can't see sibling rows).
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout, safe to re-run.
-- Reversible: DROP COLUMN from_bin_id/to_bin_id; restore
-- stock_transfers_diff_warehouse_check; restore dispatch_stock_transfer()/
-- receive_stock_transfer() from 20260729130000_stock_transfer_schema.sql;
-- DROP FUNCTION merge_bin/split_bin.

ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS from_bin_id uuid REFERENCES public.warehouse_bins(id),
  ADD COLUMN IF NOT EXISTS to_bin_id uuid REFERENCES public.warehouse_bins(id);

DO $$ BEGIN
  ALTER TABLE public.stock_transfer_items
    ADD CONSTRAINT stock_transfer_items_bin_distinct_check
    CHECK (from_bin_id IS NULL OR to_bin_id IS NULL OR from_bin_id IS DISTINCT FROM to_bin_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_diff_warehouse_check;

-- ── dispatch_stock_transfer: same workflow, bin-aware availability + ledger ──
CREATE OR REPLACE FUNCTION public.dispatch_stock_transfer(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer record;
  v_item record;
  v_available numeric;
  v_allow_negative boolean;
  v_stock numeric;
  v_same_warehouse boolean;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = _transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN
    RAISE EXCEPTION 'Stock transfer not found';
  END IF;
  IF NOT public.is_business_member(v_transfer.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_transfer.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft transfers can be dispatched (current status: %)', v_transfer.status;
  END IF;
  IF v_transfer.from_warehouse_id IS NULL OR v_transfer.to_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'From and To warehouse are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = _transfer_id) THEN
    RAISE EXCEPTION 'Transfer has no line items';
  END IF;

  v_same_warehouse := v_transfer.from_warehouse_id = v_transfer.to_warehouse_id;

  IF v_same_warehouse AND EXISTS (
    SELECT 1 FROM public.stock_transfer_items
    WHERE transfer_id = _transfer_id AND (from_bin_id IS NULL OR to_bin_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Same-warehouse transfers must specify both From Bin and To Bin on every line';
  END IF;

  SELECT COALESCE(allow_negative_stock, false) INTO v_allow_negative
  FROM public.accounting_settings WHERE business_id = v_transfer.business_id;

  FOR v_item IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = _transfer_id LOOP
    IF v_same_warehouse THEN
      v_available := public.get_bin_available_stock(v_item.product_id, v_item.from_bin_id);
    ELSE
      v_available := public.get_warehouse_available_stock(v_item.product_id, v_transfer.from_warehouse_id);
    END IF;
    IF NOT COALESCE(v_allow_negative, false) AND v_available < v_item.qty THEN
      RAISE EXCEPTION 'Insufficient stock at source for product %. Available: %, Requested: %',
        v_item.product_id, v_available, v_item.qty;
    END IF;

    SELECT COALESCE(stock, 0) INTO v_stock FROM public.products WHERE id = v_item.product_id;

    INSERT INTO public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id,
       stock_before, stock_after, reference_id, reference_type, notes)
    VALUES
      (auth.uid(), v_transfer.business_id, v_item.product_id, 'transfer_out', -v_item.qty,
       v_transfer.from_warehouse_id, v_item.from_bin_id, v_stock, v_stock, _transfer_id, 'stock_transfer',
       'Transfer ' || COALESCE(v_transfer.transfer_no, _transfer_id::text) || ' dispatched');
  END LOOP;

  UPDATE public.stock_transfers
    SET status = 'in_transit', dispatched_at = now(), updated_at = now()
    WHERE id = _transfer_id;
END;
$function$;

-- ── receive_stock_transfer: same workflow, bin-aware ledger ──
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer record;
  v_item record;
  v_stock numeric;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = _transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN
    RAISE EXCEPTION 'Stock transfer not found';
  END IF;
  IF NOT public.is_business_member(v_transfer.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_transfer.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Only in-transit transfers can be received (current status: %)', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = _transfer_id LOOP
    SELECT COALESCE(stock, 0) INTO v_stock FROM public.products WHERE id = v_item.product_id;

    INSERT INTO public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id,
       stock_before, stock_after, reference_id, reference_type, notes)
    VALUES
      (auth.uid(), v_transfer.business_id, v_item.product_id, 'transfer_in', v_item.qty,
       v_transfer.to_warehouse_id, v_item.to_bin_id, v_stock, v_stock, _transfer_id, 'stock_transfer',
       'Transfer ' || COALESCE(v_transfer.transfer_no, _transfer_id::text) || ' received');
  END LOOP;

  UPDATE public.stock_transfers
    SET status = 'received', received_at = now(), updated_at = now()
    WHERE id = _transfer_id;
END;
$function$;

-- ── Bin Merge: move every product's full balance out of a bin, retire it ──
CREATE OR REPLACE FUNCTION public.merge_bin(_from_bin_id uuid, _to_bin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from record;
  v_to record;
  v_item record;
  v_qty numeric;
  v_stock numeric;
BEGIN
  SELECT wb.business_id, wb.status, z.warehouse_id
    INTO v_from
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE wb.id = _from_bin_id;

  SELECT wb.business_id, z.warehouse_id
    INTO v_to
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE wb.id = _to_bin_id;

  IF v_from.business_id IS NULL OR v_to.business_id IS NULL THEN
    RAISE EXCEPTION 'Bin not found';
  END IF;
  IF NOT public.is_business_member(v_from.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_from.business_id <> v_to.business_id THEN
    RAISE EXCEPTION 'Bins belong to different businesses';
  END IF;
  IF v_from.warehouse_id <> v_to.warehouse_id THEN
    RAISE EXCEPTION 'Bin merge only moves stock within the same warehouse — use a Stock Transfer across warehouses';
  END IF;
  IF _from_bin_id = _to_bin_id THEN
    RAISE EXCEPTION 'Cannot merge a bin into itself';
  END IF;

  FOR v_item IN
    SELECT DISTINCT product_id FROM public.product_locations WHERE bin_id = _from_bin_id
    UNION
    SELECT DISTINCT product_id FROM public.inventory_movements WHERE bin_id = _from_bin_id
  LOOP
    v_qty := public.get_bin_available_stock(v_item.product_id, _from_bin_id);
    IF v_qty > 0 THEN
      SELECT COALESCE(stock, 0) INTO v_stock FROM public.products WHERE id = v_item.product_id;

      INSERT INTO public.inventory_movements
        (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES
        (auth.uid(), v_from.business_id, v_item.product_id, 'bin_merge_out', -v_qty, v_from.warehouse_id, _from_bin_id, v_stock, v_stock, _to_bin_id, 'bin_merge', 'Bin merge: moved to ' || _to_bin_id::text);

      INSERT INTO public.inventory_movements
        (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES
        (auth.uid(), v_from.business_id, v_item.product_id, 'bin_merge_in', v_qty, v_to.warehouse_id, _to_bin_id, v_stock, v_stock, _from_bin_id, 'bin_merge', 'Bin merge: received from ' || _from_bin_id::text);
    END IF;
  END LOOP;

  UPDATE public.warehouse_bins
    SET status = 'blocked', merged_into_bin_id = _to_bin_id
    WHERE id = _from_bin_id;
END;
$function$;

-- ── Bin Split: move a specific qty of one product to a new/other bin ──
CREATE OR REPLACE FUNCTION public.split_bin(_from_bin_id uuid, _to_bin_id uuid, _product_id uuid, _qty numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from record;
  v_to record;
  v_available numeric;
  v_stock numeric;
BEGIN
  IF _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;
  IF _from_bin_id = _to_bin_id THEN
    RAISE EXCEPTION 'Cannot split a bin into itself';
  END IF;

  SELECT wb.business_id, z.warehouse_id INTO v_from
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE wb.id = _from_bin_id;

  SELECT wb.business_id, z.warehouse_id INTO v_to
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE wb.id = _to_bin_id;

  IF v_from.business_id IS NULL OR v_to.business_id IS NULL THEN
    RAISE EXCEPTION 'Bin not found';
  END IF;
  IF NOT public.is_business_member(v_from.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_from.warehouse_id <> v_to.warehouse_id THEN
    RAISE EXCEPTION 'Bin split only moves stock within the same warehouse — use a Stock Transfer across warehouses';
  END IF;

  v_available := public.get_bin_available_stock(_product_id, _from_bin_id);
  IF v_available < _qty THEN
    RAISE EXCEPTION 'Insufficient stock at source bin. Available: %, Requested: %', v_available, _qty;
  END IF;

  SELECT COALESCE(stock, 0) INTO v_stock FROM public.products WHERE id = _product_id;

  INSERT INTO public.inventory_movements
    (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
  VALUES
    (auth.uid(), v_from.business_id, _product_id, 'bin_split_out', -_qty, v_from.warehouse_id, _from_bin_id, v_stock, v_stock, _to_bin_id, 'bin_split', 'Bin split: moved to ' || _to_bin_id::text);

  INSERT INTO public.inventory_movements
    (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
  VALUES
    (auth.uid(), v_from.business_id, _product_id, 'bin_split_in', _qty, v_to.warehouse_id, _to_bin_id, v_stock, v_stock, _from_bin_id, 'bin_split', 'Bin split: received from ' || _from_bin_id::text);
END;
$function$;
