-- Quotation Revision System (ERP priority #1): once a quotation has left
-- draft (sent/accepted/rejected/expired), editing it must not silently
-- overwrite what the customer already saw. Editing a non-draft quotation
-- creates a new row — same root, revision_number + 1 — and the prior row is
-- flipped to is_latest = false so it stays visible in history but stops
-- being the one users act on day-to-day.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS root_quotation_id uuid,
  ADD COLUMN IF NOT EXISTS is_latest boolean NOT NULL DEFAULT true;

-- Backfill existing rows as revision 0 of themselves.
UPDATE public.quotations SET root_quotation_id = id WHERE root_quotation_id IS NULL;

ALTER TABLE public.quotations
  ALTER COLUMN root_quotation_id SET NOT NULL,
  ADD CONSTRAINT quotations_root_fk FOREIGN KEY (root_quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_quotations_root ON public.quotations(root_quotation_id, revision_number);
CREATE INDEX IF NOT EXISTS idx_quotations_latest ON public.quotations(business_id, is_latest) WHERE is_latest;

NOTIFY pgrst, 'reload schema';
