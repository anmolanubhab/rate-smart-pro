ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS party_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date DATE,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

CREATE INDEX IF NOT EXISTS idx_calculations_user_created
  ON public.calculations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calculations_party
  ON public.calculations (user_id, party_name);