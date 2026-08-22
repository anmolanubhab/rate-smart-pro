-- GRN header: capture the supplier's own invoice number/date at receiving
-- time (2026-08-22) -- optional, since the supplier invoice often doesn't
-- exist yet when goods physically arrive. Purely a reference/reconciliation
-- field: never overwritten by any calculation, and Purchase Invoice creation
-- can later reuse/verify against it.

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS supplier_invoice_number text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_date   date;

NOTIFY pgrst, 'reload schema';
