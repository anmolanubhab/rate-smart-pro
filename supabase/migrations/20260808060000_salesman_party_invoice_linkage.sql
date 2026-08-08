-- Link structured Salesman -> Party -> Sales Invoice, additive-only.
--
-- The existing free-text `salesman` column on orders/sales_invoices/
-- quotations is NOT touched, renamed, or backfilled here — it stays the
-- parallel legacy field exactly as it is today, per explicit product
-- decision. These new columns are the source of truth for reporting going
-- forward; historical rows simply have them NULL, which the Sales
-- Performance Report treats as an "Unassigned / Legacy" bucket rather than
-- guessing a mapping.
--
-- sales_invoices.salesman_id / salesman_group_id are a SNAPSHOT taken at
-- invoice-creation time (app-layer responsibility, see
-- src/lib/salesInvoices.ts) — not a live join to parties.salesman_id or
-- salesmen.salesman_group_id. That's what keeps a historical invoice's
-- reported group/salesman stable even after the salesman is later moved to
-- a different group, or the party's assigned salesman changes. ON DELETE
-- SET NULL (rather than RESTRICT/CASCADE) on all three FKs below means even
-- a hard-deleted salesman/group only nulls the reference — a past invoice
-- still counts, just falls into the Unassigned/Legacy bucket instead of
-- blocking the delete or vanishing from the report.

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS salesman_id uuid REFERENCES public.salesmen(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_parties_salesman ON public.parties(salesman_id);

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS salesman_id uuid REFERENCES public.salesmen(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS salesman_group_id uuid REFERENCES public.salesman_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_salesman ON public.sales_invoices(salesman_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_salesman_group ON public.sales_invoices(salesman_group_id);

-- orders also feeds sales_invoices (generateInvoiceFromOrder /
-- generateInvoiceFromDispatch copy the order's salesman across at
-- generation time) -- capturing salesman_id here too means the structured
-- selection made at order-entry time survives the order -> invoice
-- generation step instead of only living on the free-text field.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS salesman_id uuid REFERENCES public.salesmen(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_salesman ON public.orders(salesman_id);

NOTIFY pgrst, 'reload schema';
