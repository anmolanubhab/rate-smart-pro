-- Adaptive Workflow — Phase 2: Direct Sales Invoice, idempotency support.
--
-- generateInvoiceFromDispatch()/generateInvoiceFromOrder() are naturally
-- double-submit-safe: a dispatch can only be invoiced once (invoice_id
-- uniqueness check), and an order is guarded by a "does a non-cancelled
-- invoice already reference this order_id" query. A Direct Sales Invoice
-- has no parent document to check against -- two legitimate invoices for
-- the same party with identical items are a normal, valid scenario, so
-- nothing about the invoice's *content* can be used to detect a duplicate
-- submission. This adds a client-generated idempotency token instead: the
-- UI generates one UUID per compose session and the insert carries it; a
-- genuine double-submit (double-click, retry, race between two tabs on the
-- exact same in-flight save) reuses the same token and is rejected by the
-- partial unique index below, while two independently-composed invoices
-- (even with identical line items) use different tokens and are both
-- allowed through.
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoices_client_request_id
  ON public.sales_invoices (business_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
