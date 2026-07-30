-- Real backing data for Batch Tracking and Serial Number pages (previously
-- mock screens), plus a weight field on products. Unblocks the Weight
-- print column deferred in Print Engine Phase 3 (Batch/Serial columns
-- stay deferred — no current order/dispatch/invoice flow lets a user pick
-- a specific batch or serial per line, so there is no correct per-line
-- value to print yet).

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_kg numeric;

CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  batch_number text NOT NULL,
  mfg_date date,
  expiry_date date,
  qty numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_batches_business ON public.product_batches(business_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_batches_unique ON public.product_batches(business_id, product_id, batch_number);

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_batches_select ON public.product_batches FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY product_batches_insert ON public.product_batches FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY product_batches_update ON public.product_batches FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY product_batches_delete ON public.product_batches FOR DELETE USING (public.is_business_member(business_id));

CREATE TABLE IF NOT EXISTS public.product_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  serial_number text NOT NULL,
  status text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'sold', 'returned', 'damaged')),
  received_at date NOT NULL DEFAULT current_date,
  sold_at date,
  invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_serials_business ON public.product_serials(business_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_serials_unique ON public.product_serials(business_id, serial_number);

ALTER TABLE public.product_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_serials_select ON public.product_serials FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY product_serials_insert ON public.product_serials FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY product_serials_update ON public.product_serials FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY product_serials_delete ON public.product_serials FOR DELETE USING (public.is_business_member(business_id));

ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS show_weight boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
