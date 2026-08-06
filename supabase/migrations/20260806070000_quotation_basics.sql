-- Quotation basics gap-fill: billing/shipping address, reference no, shipping
-- charges, and a party snapshot — same fields orders already carry (see
-- 20260514081509_..._orders.sql-equivalent columns on public.orders) so
-- Convert to Order can eventually pass them through untouched.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS reference_no text,
  ADD COLUMN IF NOT EXISTS shipping_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS party_snapshot jsonb;

NOTIFY pgrst, 'reload schema';
