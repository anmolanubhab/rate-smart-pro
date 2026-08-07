-- Product Storage Management, Phase 1, step 5: GRN put-away bin selection.
-- SURGICAL CHANGE ONLY: same qty/stock arithmetic as the existing
-- grn_item_apply_hold_stock() (see 20260729140000_warehouse_tag_existing_flows.sql),
-- with bin_id resolved (NEW.bin_id -> product's default_bin_id, if it
-- belongs to the GRN's warehouse -> warehouse's unassigned bin) and threaded
-- into both inventory_movements inserts, exactly like warehouse_id already is.
-- See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md section 7.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE, safe to re-run.
-- Reversible: ALTER TABLE goods_receipt_items DROP COLUMN bin_id; restore
-- the prior function body from 20260729140000_warehouse_tag_existing_flows.sql.

ALTER TABLE public.goods_receipt_items ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES public.warehouse_bins(id);

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
BEGIN
  SELECT status, business_id, warehouse_id INTO v_grn_status, v_biz, v_warehouse_id
  FROM public.goods_receipts WHERE id = NEW.goods_receipt_id;
  IF v_grn_status <> 'received' THEN RETURN NEW; END IF;

  v_received := COALESCE(NEW.received_qty, 0);
  v_accepted := COALESCE(NEW.stock_accepted_qty, NEW.accepted_qty, 0);
  v_damaged := GREATEST(v_received - v_accepted, 0);

  IF NEW.product_id IS NOT NULL AND v_received > 0 THEN
    -- Resolve put-away bin: explicit line selection -> product's default
    -- bin (only if it's actually in this GRN's warehouse) -> that
    -- warehouse's unassigned bin.
    v_bin_id := NEW.bin_id;
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
