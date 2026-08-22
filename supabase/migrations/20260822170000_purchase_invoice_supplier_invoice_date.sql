-- Purchase Invoice already captures the supplier's own invoice NUMBER
-- (supplier_invoice_number, added in 20260819095000_create_purchase_invoice_atomic.sql)
-- but never the date printed on that same physical bill -- GRN already has
-- both (supplier_invoice_number/date, 20260822150000_grn_supplier_invoice_reference.sql)
-- and Purchase Invoice's own GRN-pull already auto-fills the number from it,
-- so this closes the matching gap on the date.

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS supplier_invoice_date date;
