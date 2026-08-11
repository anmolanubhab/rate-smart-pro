-- The Barcodes screen was a static mock (never wired to Supabase). Wiring it
-- to the real products.barcode column requires a uniqueness guarantee —
-- otherwise two products could silently share a scan code. Partial index so
-- products without a barcode yet (the common case) aren't affected.
CREATE UNIQUE INDEX products_barcode_unique_per_business
  ON public.products (business_id, barcode)
  WHERE barcode IS NOT NULL;
