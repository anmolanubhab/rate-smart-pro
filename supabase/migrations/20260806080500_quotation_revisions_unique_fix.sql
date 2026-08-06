-- Revisions of the same quotation intentionally share quotation_number
-- (only the revision_number suffix differs), so the original
-- UNIQUE(business_id, quotation_number) from 20260728050000_quotations.sql
-- must widen to include revision_number.

ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_business_id_quotation_number_key;

DO $$ BEGIN
  ALTER TABLE public.quotations
    ADD CONSTRAINT quotations_number_revision_unique UNIQUE (business_id, quotation_number, revision_number);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
