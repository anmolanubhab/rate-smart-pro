-- Product Storage Management, Phase 1, step 1: Zone -> Rack -> Bin hierarchy.
-- See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md for the full design.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout, safe to re-run.
-- Reversible: DROP TABLE warehouse_bins/warehouse_racks/warehouse_zones,
-- ALTER TABLE warehouses DROP COLUMN code.

-- ── warehouses.code: short code for location_code composition ──
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS code text;

WITH numbered AS (
  SELECT id, business_id, row_number() OVER (PARTITION BY business_id ORDER BY created_at ASC) AS rn
  FROM public.warehouses
  WHERE code IS NULL
)
UPDATE public.warehouses w
SET code = 'WH' || lpad(numbered.rn::text, 3, '0')
FROM numbered
WHERE w.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_business_code_key ON public.warehouses (business_id, code);

-- ── warehouse_zones ──
CREATE TABLE IF NOT EXISTS public.warehouse_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, code)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_zones_business ON public.warehouse_zones(business_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_zones_warehouse ON public.warehouse_zones(warehouse_id);

ALTER TABLE public.warehouse_zones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_zones TO authenticated;
GRANT ALL ON public.warehouse_zones TO service_role;

DROP POLICY IF EXISTS wz_select ON public.warehouse_zones;
DROP POLICY IF EXISTS wz_insert ON public.warehouse_zones;
DROP POLICY IF EXISTS wz_update ON public.warehouse_zones;
DROP POLICY IF EXISTS wz_delete ON public.warehouse_zones;
CREATE POLICY wz_select ON public.warehouse_zones FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wz_insert ON public.warehouse_zones FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY wz_update ON public.warehouse_zones FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wz_delete ON public.warehouse_zones FOR DELETE TO authenticated USING (public.is_business_member(business_id));

DROP TRIGGER IF EXISTS trg_warehouse_zones_touch ON public.warehouse_zones;
CREATE TRIGGER trg_warehouse_zones_touch BEFORE UPDATE ON public.warehouse_zones
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── warehouse_racks ──
CREATE TABLE IF NOT EXISTS public.warehouse_racks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.warehouse_zones(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'under_maintenance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone_id, code)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_racks_business ON public.warehouse_racks(business_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_racks_zone ON public.warehouse_racks(zone_id);

ALTER TABLE public.warehouse_racks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_racks TO authenticated;
GRANT ALL ON public.warehouse_racks TO service_role;

DROP POLICY IF EXISTS wr_select ON public.warehouse_racks;
DROP POLICY IF EXISTS wr_insert ON public.warehouse_racks;
DROP POLICY IF EXISTS wr_update ON public.warehouse_racks;
DROP POLICY IF EXISTS wr_delete ON public.warehouse_racks;
CREATE POLICY wr_select ON public.warehouse_racks FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wr_insert ON public.warehouse_racks FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY wr_update ON public.warehouse_racks FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wr_delete ON public.warehouse_racks FOR DELETE TO authenticated USING (public.is_business_member(business_id));

DROP TRIGGER IF EXISTS trg_warehouse_racks_touch ON public.warehouse_racks;
CREATE TRIGGER trg_warehouse_racks_touch BEFORE UPDATE ON public.warehouse_racks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── warehouse_bins ──
CREATE TABLE IF NOT EXISTS public.warehouse_bins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  rack_id uuid NOT NULL REFERENCES public.warehouse_racks(id) ON DELETE CASCADE,
  shelf_code text,
  bin_code text NOT NULL,
  location_code text,
  scan_code text,
  bin_type text NOT NULL DEFAULT 'NORMAL'
    CHECK (bin_type IN ('NORMAL', 'RETURN', 'DAMAGE', 'QC', 'RESERVED', 'STAGING', 'PACKING')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'under_maintenance')),
  capacity_qty numeric,
  capacity_weight numeric,
  capacity_volume numeric,
  is_locked boolean NOT NULL DEFAULT false,
  is_unassigned boolean NOT NULL DEFAULT false,
  merged_into_bin_id uuid REFERENCES public.warehouse_bins(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rack_id, shelf_code, bin_code)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_bins_business ON public.warehouse_bins(business_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_bins_rack ON public.warehouse_bins(rack_id);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_bins_business_location_code_key ON public.warehouse_bins (business_id, location_code);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_bins_business_scan_code_key ON public.warehouse_bins (business_id, scan_code);

ALTER TABLE public.warehouse_bins ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_bins TO authenticated;
GRANT ALL ON public.warehouse_bins TO service_role;

DROP POLICY IF EXISTS wb_select ON public.warehouse_bins;
DROP POLICY IF EXISTS wb_insert ON public.warehouse_bins;
DROP POLICY IF EXISTS wb_update ON public.warehouse_bins;
DROP POLICY IF EXISTS wb_delete ON public.warehouse_bins;
CREATE POLICY wb_select ON public.warehouse_bins FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wb_insert ON public.warehouse_bins FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY wb_update ON public.warehouse_bins FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wb_delete ON public.warehouse_bins FOR DELETE TO authenticated USING (public.is_business_member(business_id));

DROP TRIGGER IF EXISTS trg_warehouse_bins_touch ON public.warehouse_bins;
CREATE TRIGGER trg_warehouse_bins_touch BEFORE UPDATE ON public.warehouse_bins
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── location_code / scan_code composition ──
-- A stored generated column can't join across tables (warehouse -> zone ->
-- rack -> bin), so this is maintained by trigger instead. scan_code
-- defaults to location_code at creation but is never recomputed afterward
-- (deliberately independent — see docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md
-- section 3), so re-racking a bin later doesn't invalidate printed labels.
CREATE OR REPLACE FUNCTION public.set_bin_location_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warehouse_code text;
  v_zone_code text;
  v_rack_code text;
BEGIN
  SELECT w.code, z.code, r.code
    INTO v_warehouse_code, v_zone_code, v_rack_code
  FROM public.warehouse_racks r
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  JOIN public.warehouses w ON w.id = z.warehouse_id
  WHERE r.id = NEW.rack_id;

  IF v_warehouse_code IS NULL OR v_zone_code IS NULL OR v_rack_code IS NULL THEN
    RAISE EXCEPTION 'Cannot compute location_code: warehouse/zone/rack code missing for rack %', NEW.rack_id;
  END IF;

  NEW.location_code := v_warehouse_code || '-' || v_zone_code || '-' || v_rack_code
    || CASE WHEN NEW.shelf_code IS NOT NULL AND NEW.shelf_code <> '' THEN '-' || NEW.shelf_code ELSE '' END
    || '-' || NEW.bin_code;

  IF NEW.scan_code IS NULL THEN
    NEW.scan_code := NEW.location_code;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_bin_location_code ON public.warehouse_bins;
CREATE TRIGGER trg_set_bin_location_code
BEFORE INSERT OR UPDATE OF rack_id, shelf_code, bin_code ON public.warehouse_bins
FOR EACH ROW EXECUTE FUNCTION public.set_bin_location_code();
