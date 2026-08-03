-- HSN Compliance Engine — Phase 1b
-- products had three unlinked HSN text columns (hsn, hsn_code, hsn_sac) and
-- three unlinked GST columns (gst_pct, gst_percent, gst_rate). This merges
-- them down to one canonical pair — hsn_code (now FK'd to hsn_master) and
-- gst_pct — and drops the rest. All app-layer reads of the dropped columns
-- were fixed in this same change (src/lib/salesInvoices.ts, BulkGstAssign.tsx);
-- confirmed via full grep of src/ before writing this migration that nothing
-- else reads hsn/hsn_sac/gst_percent/gst_rate off a products row.

-- =============================================================================
-- 1. Data merge: coalesce the legacy columns into the canonical ones.
--    (Verified beforehand: all existing product rows already agreed across
--    hsn/hsn_code/hsn_sac and across gst_pct/gst_percent — this is a no-op on
--    that data, but written as a real coalesce for correctness on any
--    divergent rows before the columns are dropped.)
-- =============================================================================
UPDATE public.products
SET
  hsn_code = COALESCE(NULLIF(hsn_code, ''), NULLIF(hsn, ''), NULLIF(hsn_sac, '')),
  gst_pct  = COALESCE(gst_pct, gst_percent, gst_rate)
WHERE hsn_code IS DISTINCT FROM COALESCE(NULLIF(hsn_code, ''), NULLIF(hsn, ''), NULLIF(hsn_sac, ''))
   OR gst_pct  IS DISTINCT FROM COALESCE(gst_pct, gst_percent, gst_rate);

-- =============================================================================
-- 2. Backfill hsn_master with any HSN codes already in use on products but
--    missing from hsn_master — required before the FK constraint below can
--    be added. Minimal stub rows; description/rate get filled in via the
--    HSN Master UI (Phase 2). A gst_rates row is also stubbed from the
--    product's own gst_pct so gst_rate_on_date() resolves something sane
--    immediately rather than leaving these HSNs rate-less.
-- =============================================================================
INSERT INTO public.hsn_master (hsn_code, description, status)
SELECT DISTINCT NULLIF(hsn_code, ''), NULL, 'active'
FROM public.products
WHERE NULLIF(hsn_code, '') IS NOT NULL
ON CONFLICT (hsn_code) DO NOTHING;

INSERT INTO public.gst_rates (hsn_code, rate, cess_rate, effective_from)
SELECT DISTINCT ON (p.hsn_code) p.hsn_code, COALESCE(p.gst_pct, 0), 0, CURRENT_DATE
FROM public.products p
WHERE NULLIF(p.hsn_code, '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gst_rates gr WHERE gr.hsn_code = p.hsn_code);

-- =============================================================================
-- 3. FK: products.hsn_code -> hsn_master.hsn_code. Nullable (not every
--    product has an HSN yet), RESTRICT not CASCADE (deleting an HSN must not
--    silently orphan/delete products — use hsn_master.status='inactive'
--    instead).
-- =============================================================================
ALTER TABLE public.products
  ALTER COLUMN hsn_code DROP NOT NULL;
UPDATE public.products SET hsn_code = NULL WHERE hsn_code = '';

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_hsn_code_fkey FOREIGN KEY (hsn_code)
    REFERENCES public.hsn_master(hsn_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_products_hsn_code ON public.products(hsn_code) WHERE hsn_code IS NOT NULL;

-- =============================================================================
-- 4. Drop the now-redundant legacy columns.
-- =============================================================================
ALTER TABLE public.products
  DROP COLUMN IF EXISTS hsn,
  DROP COLUMN IF EXISTS hsn_sac,
  DROP COLUMN IF EXISTS gst_percent,
  DROP COLUMN IF EXISTS gst_rate;

NOTIFY pgrst, 'reload schema';
