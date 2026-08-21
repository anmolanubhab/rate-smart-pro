-- Quick Create Master, Phase 1: audit trail for master records. Neither
-- parties, products, nor ledger_accounts track who created a row today --
-- normal master creation and the new Quick Create dialogs both start
-- setting this from here on, so Quick Create's audit is "the same
-- mechanism as normal creation," not a special case. Nullable/additive --
-- no backfill needed, existing rows simply have no recorded creator.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.ledger_accounts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
