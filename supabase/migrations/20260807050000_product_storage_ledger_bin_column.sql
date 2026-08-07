-- Product Storage Management, Phase 1, step 4: bin_id on the ledger.
-- inventory_movements.bin_id turns the existing ledger into the bin-level
-- history too -- no separate stock_bin_history table. get_bin_available_stock
-- mirrors get_warehouse_available_stock's residual-holder pattern one level
-- deeper: a warehouse's is_unassigned bin absorbs whatever isn't explicitly
-- tracked at another bin in that warehouse.
-- See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md sections 1, 4.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout, safe to re-run.
-- Reversible: DROP VIEW/FUNCTION; ALTER TABLE inventory_movements DROP COLUMN.

ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES public.warehouse_bins(id);
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS movement_reason text;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_bin ON public.inventory_movements(product_id, bin_id);

CREATE OR REPLACE FUNCTION public.get_bin_available_stock(_product_id uuid, _bin_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_unassigned boolean;
  v_warehouse_id uuid;
  v_warehouse_stock numeric;
  v_elsewhere numeric;
BEGIN
  SELECT wb.is_unassigned, z.warehouse_id
    INTO v_is_unassigned, v_warehouse_id
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE wb.id = _bin_id;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Bin not found: %', _bin_id;
  END IF;

  IF v_is_unassigned THEN
    v_warehouse_stock := public.get_warehouse_available_stock(_product_id, v_warehouse_id);

    SELECT COALESCE(SUM(im.qty), 0) INTO v_elsewhere
    FROM public.inventory_movements im
    JOIN public.warehouse_bins wb ON wb.id = im.bin_id
    JOIN public.warehouse_racks r ON r.id = wb.rack_id
    JOIN public.warehouse_zones z ON z.id = r.zone_id
    WHERE im.product_id = _product_id
      AND z.warehouse_id = v_warehouse_id
      AND im.bin_id <> _bin_id;

    RETURN COALESCE(v_warehouse_stock, 0) - v_elsewhere;
  ELSE
    SELECT COALESCE(SUM(im.qty), 0) INTO v_elsewhere
    FROM public.inventory_movements im
    WHERE im.product_id = _product_id AND im.bin_id = _bin_id;

    RETURN v_elsewhere;
  END IF;
END;
$function$;

-- Bin-wise Stock Report: read-only, computed from the ledger, no storage.
-- security_invoker: migrations run as the postgres superuser, which bypasses
-- RLS. Without this, the view would run with the *owner's* (postgres')
-- privileges and leak every business's bins to every querying user. With
-- it, the view runs with the querying user's privileges, so the RLS
-- policies on warehouse_bins/product_locations/products underneath still
-- apply per business.
CREATE OR REPLACE VIEW public.v_bin_stock_balance
WITH (security_invoker = true) AS
SELECT
  wb.business_id,
  wb.id AS bin_id,
  wb.location_code,
  wb.bin_type,
  wb.status AS bin_status,
  z.warehouse_id,
  p.id AS product_id,
  p.part_number,
  COALESCE(p.name, p.product_name, p.item_name) AS product_name,
  public.get_bin_available_stock(p.id, wb.id) AS qty
FROM public.warehouse_bins wb
JOIN public.warehouse_racks r ON r.id = wb.rack_id
JOIN public.warehouse_zones z ON z.id = r.zone_id
JOIN public.product_locations pl ON pl.bin_id = wb.id
JOIN public.products p ON p.id = pl.product_id
WHERE wb.is_unassigned = false;

GRANT SELECT ON public.v_bin_stock_balance TO authenticated;
