-- Product Storage Management, Phase 1, step 3: product <-> bin mapping.
-- See docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md section 4.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout, safe to re-run.
-- Reversible: DROP TABLE product_locations; ALTER TABLE products DROP COLUMN default_bin_id.

CREATE TABLE IF NOT EXISTS public.product_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  bin_id uuid NOT NULL REFERENCES public.warehouse_bins(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, bin_id)
);
CREATE INDEX IF NOT EXISTS idx_product_locations_business ON public.product_locations(business_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_product ON public.product_locations(product_id, priority);
CREATE INDEX IF NOT EXISTS idx_product_locations_bin ON public.product_locations(bin_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_locations_one_default_per_product
  ON public.product_locations (product_id) WHERE is_default;

ALTER TABLE public.product_locations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_locations TO authenticated;
GRANT ALL ON public.product_locations TO service_role;

DROP POLICY IF EXISTS pl_select ON public.product_locations;
DROP POLICY IF EXISTS pl_insert ON public.product_locations;
DROP POLICY IF EXISTS pl_update ON public.product_locations;
DROP POLICY IF EXISTS pl_delete ON public.product_locations;
CREATE POLICY pl_select ON public.product_locations FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY pl_insert ON public.product_locations FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY pl_update ON public.product_locations FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY pl_delete ON public.product_locations FOR DELETE TO authenticated USING (public.is_business_member(business_id));

DROP TRIGGER IF EXISTS trg_product_locations_touch ON public.product_locations;
CREATE TRIGGER trg_product_locations_touch BEFORE UPDATE ON public.product_locations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── products.default_bin_id ──
-- Default *warehouse* is deliberately not a separate column: it's derived
-- via default_bin_id -> rack -> zone -> warehouse, so the two can never
-- disagree.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_bin_id uuid REFERENCES public.warehouse_bins(id);
CREATE INDEX IF NOT EXISTS idx_products_default_bin ON public.products(default_bin_id);

-- Keep product_locations.is_default in sync when a product's default bin changes.
CREATE OR REPLACE FUNCTION public.sync_product_default_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.default_bin_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.default_bin_id IS NOT DISTINCT FROM NEW.default_bin_id THEN
    RETURN NEW;
  END IF;

  -- Clear the old default(s) *before* inserting the new one — the partial
  -- unique index (one is_default=true row per product) is checked
  -- immediately per statement, not deferred, so both rows being true at
  -- once even momentarily within this transaction would fail it.
  UPDATE public.product_locations
  SET is_default = false
  WHERE product_id = NEW.id AND bin_id <> NEW.default_bin_id AND is_default = true;

  INSERT INTO public.product_locations (business_id, product_id, bin_id, is_default)
  VALUES (NEW.business_id, NEW.id, NEW.default_bin_id, true)
  ON CONFLICT (product_id, bin_id) DO UPDATE SET is_default = true;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_product_default_location ON public.products;
CREATE TRIGGER trg_sync_product_default_location
AFTER INSERT OR UPDATE OF default_bin_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_default_location();
