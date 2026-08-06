-- Quotation save was broken two ways:
-- 1) quotations.ref_no (added by 20260803000000_quotation_order_field_parity)
--    was superseded by a reference_no column + a quotation-revisions column
--    set (revision_number/root_quotation_id/is_latest) added directly against
--    the shared dev project outside this branch's migration history, and
--    ref_no was subsequently dropped as "unused" — breaking CreateQuotation's
--    save (PostgREST: "Could not find the 'ref_no' column"). Frontend now
--    writes reference_no (src/lib/quotations.ts, CreateQuotation.tsx).
-- 2) root_quotation_id was made NOT NULL with no default and no populating
--    trigger, so every insert (this branch's code never sets it) fails with
--    a not-null violation. Add the missing self-reference default.
--
-- Column adds are IF NOT EXISTS so this is idempotent whether run against
-- the already-drifted shared project or a fresh database built from this
-- migration history alone.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS reference_no text,
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS root_quotation_id uuid,
  ADD COLUMN IF NOT EXISTS is_latest boolean NOT NULL DEFAULT true;

UPDATE public.quotations SET root_quotation_id = id WHERE root_quotation_id IS NULL;

ALTER TABLE public.quotations
  ALTER COLUMN root_quotation_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.quotations
    ADD CONSTRAINT quotations_root_fk FOREIGN KEY (root_quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.quotations DROP COLUMN IF EXISTS ref_no;

CREATE OR REPLACE FUNCTION public.quotations_default_root_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.root_quotation_id IS NULL THEN
    NEW.root_quotation_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotations_default_root_id ON public.quotations;
CREATE TRIGGER trg_quotations_default_root_id BEFORE INSERT ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.quotations_default_root_id();

NOTIFY pgrst, 'reload schema';
