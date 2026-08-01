-- A posted Sales Invoice has an auto-posted ledger voucher (see
-- sales_invoice_autopost trigger); deleting it directly would orphan that
-- voucher. It must be cancelled first (cancelInvoice cancels the voucher
-- too), after which deletion is safe. This was previously only enforced in
-- the frontend query layer — add the same rule as a DB trigger so it can't
-- be bypassed by a direct REST/SQL delete.

CREATE OR REPLACE FUNCTION public.prevent_posted_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Only draft or cancelled invoices can be deleted. Cancel invoice % first.', OLD.invoice_number;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_invoice_delete ON public.sales_invoices;
CREATE TRIGGER trg_prevent_posted_invoice_delete
  BEFORE DELETE ON public.sales_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_posted_invoice_delete();
