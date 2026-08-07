-- Product Storage Management, Phase 1, step 2: system "unassigned" bin per
-- warehouse. Residual holder for stock that predates this feature and for
-- GRN/dispatch lines where nobody picked a bin — mirrors how the default
-- warehouse already absorbs residual stock today (get_warehouse_available_stock).
-- See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md section 6.
--
-- Idempotent: guarded by NOT EXISTS checks, safe to re-run.
-- Reversible: DROP TRIGGER trg_seed_unassigned_bin; the seeded rows can be
-- deleted manually (DELETE ... WHERE is_unassigned).

CREATE OR REPLACE FUNCTION public.seed_unassigned_bin_for_warehouse(_warehouse_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
  v_zone_id uuid;
  v_rack_id uuid;
  v_bin_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.warehouses WHERE id = _warehouse_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse not found: %', _warehouse_id;
  END IF;

  SELECT wb.id INTO v_bin_id
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE z.warehouse_id = _warehouse_id AND wb.is_unassigned = true
  LIMIT 1;

  IF v_bin_id IS NOT NULL THEN
    RETURN v_bin_id;
  END IF;

  INSERT INTO public.warehouse_zones (business_id, warehouse_id, code, name)
  VALUES (v_business_id, _warehouse_id, 'UNZ', 'Unassigned')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET code = EXCLUDED.code
  RETURNING id INTO v_zone_id;

  INSERT INTO public.warehouse_racks (business_id, zone_id, code, name)
  VALUES (v_business_id, v_zone_id, 'UN', 'Unassigned')
  ON CONFLICT (zone_id, code) DO UPDATE SET code = EXCLUDED.code
  RETURNING id INTO v_rack_id;

  INSERT INTO public.warehouse_bins (business_id, rack_id, bin_code, bin_type, is_unassigned)
  VALUES (v_business_id, v_rack_id, 'UNASSIGNED', 'RESERVED', true)
  ON CONFLICT (rack_id, shelf_code, bin_code) DO UPDATE SET bin_code = EXCLUDED.bin_code
  RETURNING id INTO v_bin_id;

  RETURN v_bin_id;
END;
$function$;

-- Backfill for every existing warehouse
DO $$
DECLARE
  v_warehouse record;
BEGIN
  FOR v_warehouse IN SELECT id FROM public.warehouses LOOP
    PERFORM public.seed_unassigned_bin_for_warehouse(v_warehouse.id);
  END LOOP;
END $$;

-- Auto-seed for every new warehouse going forward
CREATE OR REPLACE FUNCTION public.seed_unassigned_bin_on_warehouse_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_unassigned_bin_for_warehouse(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_unassigned_bin ON public.warehouses;
CREATE TRIGGER trg_seed_unassigned_bin
AFTER INSERT ON public.warehouses
FOR EACH ROW EXECUTE FUNCTION public.seed_unassigned_bin_on_warehouse_insert();
