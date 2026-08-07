-- Product Storage Management, Phase 1, step 8: "one click -> location map"
-- product search. See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md section 7.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run.
-- Reversible: DROP FUNCTION public.find_product_locations.

CREATE OR REPLACE FUNCTION public.find_product_locations(_product_id uuid)
RETURNS TABLE(
  bin_id uuid, location_code text, scan_code text, bin_type text, bin_status text,
  warehouse_id uuid, warehouse_name text, zone_code text, rack_code text, shelf_code text, bin_code text,
  qty numeric, is_default boolean, priority integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.products WHERE id = _product_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    wb.id, wb.location_code, wb.scan_code, wb.bin_type, wb.status,
    w.id, w.warehouse_name, z.code, r.code, wb.shelf_code, wb.bin_code,
    public.get_bin_available_stock(_product_id, wb.id) AS qty,
    COALESCE(pl.is_default, false), COALESCE(pl.priority, 1)
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  JOIN public.warehouses w ON w.id = z.warehouse_id
  LEFT JOIN public.product_locations pl ON pl.bin_id = wb.id AND pl.product_id = _product_id
  WHERE wb.id IN (
    SELECT bin_id FROM public.product_locations WHERE product_id = _product_id
    UNION
    SELECT bin_id FROM public.inventory_movements WHERE product_id = _product_id AND bin_id IS NOT NULL
  )
  ORDER BY qty DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_product_locations(uuid) TO authenticated;
