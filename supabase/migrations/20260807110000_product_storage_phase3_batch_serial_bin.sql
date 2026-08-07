-- Product Storage Management, Phase 3, step 1: link batches and serials to
-- the bin they physically sit in at receipt time. Additive/nullable, same
-- surgical-diff discipline as every prior phase — existing batch/serial
-- rows and every warehouse-only flow keep working unchanged.
--
-- Idempotent: IF NOT EXISTS, safe to re-run.
-- Reversible: ALTER TABLE ... DROP COLUMN bin_id.

ALTER TABLE public.product_batches ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES public.warehouse_bins(id);
CREATE INDEX IF NOT EXISTS idx_product_batches_bin ON public.product_batches(bin_id);

ALTER TABLE public.product_serials ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES public.warehouse_bins(id);
CREATE INDEX IF NOT EXISTS idx_product_serials_bin ON public.product_serials(bin_id);
