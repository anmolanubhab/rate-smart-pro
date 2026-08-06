-- Create Quotation is becoming a full-page twin of Create Order (same header
-- fields, party snapshot, shipping charges) instead of the current bare
-- modal dialog. Brings quotations up to the same header-field shape orders
-- already has so the new page has somewhere to save everything it captures.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS party_snapshot jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shipping_charges numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ref_no text;

NOTIFY pgrst, 'reload schema';
