-- Wires real per-line batch/serial tracking into the two highest-value flows
-- that were missing it (per 20260730200000's note): Dispatch (sales) and
-- Purchase GRN (receiving). Until now, no order/dispatch/invoice/purchase
-- line referenced a specific batch or serial, so product_batches/
-- product_serials were maintained by hand on the standalone Batches/Serials
-- screens and the Print Engine's Batch/Serial column had no correct
-- per-line value to print.
--
-- products.tracking_type flags which products go through the picker at all.
-- A dispatch or GRN line can be covered by more than one batch (partial
-- quantities) or many serials, so both sides use junction tables rather than
-- a single FK column on the item row.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tracking_type text NOT NULL DEFAULT 'none';
DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_tracking_type_check CHECK (tracking_type IN ('none', 'batch', 'serial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- Dispatch (sales) side ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_item_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  dispatch_item_id uuid NOT NULL REFERENCES public.dispatch_items(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.product_batches(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dib_dispatch_item ON public.dispatch_item_batches(dispatch_item_id);
CREATE INDEX IF NOT EXISTS idx_dib_batch ON public.dispatch_item_batches(batch_id);

ALTER TABLE public.dispatch_item_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispatch_item_batches_select ON public.dispatch_item_batches FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY dispatch_item_batches_insert ON public.dispatch_item_batches FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY dispatch_item_batches_update ON public.dispatch_item_batches FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY dispatch_item_batches_delete ON public.dispatch_item_batches FOR DELETE USING (public.is_business_member(business_id));

CREATE TABLE IF NOT EXISTS public.dispatch_item_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  dispatch_item_id uuid NOT NULL REFERENCES public.dispatch_items(id) ON DELETE CASCADE,
  serial_id uuid NOT NULL REFERENCES public.product_serials(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serial_id)
);
CREATE INDEX IF NOT EXISTS idx_dis_dispatch_item ON public.dispatch_item_serials(dispatch_item_id);

ALTER TABLE public.dispatch_item_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispatch_item_serials_select ON public.dispatch_item_serials FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY dispatch_item_serials_insert ON public.dispatch_item_serials FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY dispatch_item_serials_update ON public.dispatch_item_serials FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY dispatch_item_serials_delete ON public.dispatch_item_serials FOR DELETE USING (public.is_business_member(business_id));

-- ---- Purchase GRN (receiving) side ---------------------------------------
CREATE TABLE IF NOT EXISTS public.goods_receipt_item_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  goods_receipt_item_id uuid NOT NULL REFERENCES public.goods_receipt_items(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.product_batches(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grib_item ON public.goods_receipt_item_batches(goods_receipt_item_id);

ALTER TABLE public.goods_receipt_item_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY goods_receipt_item_batches_select ON public.goods_receipt_item_batches FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY goods_receipt_item_batches_insert ON public.goods_receipt_item_batches FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY goods_receipt_item_batches_update ON public.goods_receipt_item_batches FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY goods_receipt_item_batches_delete ON public.goods_receipt_item_batches FOR DELETE USING (public.is_business_member(business_id));

CREATE TABLE IF NOT EXISTS public.goods_receipt_item_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  goods_receipt_item_id uuid NOT NULL REFERENCES public.goods_receipt_items(id) ON DELETE CASCADE,
  serial_id uuid NOT NULL REFERENCES public.product_serials(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serial_id)
);
CREATE INDEX IF NOT EXISTS idx_gris_item ON public.goods_receipt_item_serials(goods_receipt_item_id);

ALTER TABLE public.goods_receipt_item_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY goods_receipt_item_serials_select ON public.goods_receipt_item_serials FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY goods_receipt_item_serials_insert ON public.goods_receipt_item_serials FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY goods_receipt_item_serials_update ON public.goods_receipt_item_serials FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY goods_receipt_item_serials_delete ON public.goods_receipt_item_serials FOR DELETE USING (public.is_business_member(business_id));

-- ---- Print Engine surface (Batch/Serial column, off by default) ---------
ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS show_batch_serial boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
