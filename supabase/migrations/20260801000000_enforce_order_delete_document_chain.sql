-- Enforce the Sales Order → Dispatch → Sales Invoice → Payment document chain:
-- a Sales Order may not be deleted while an active (non-cancelled) Dispatch or
-- Sales Invoice still references it. This was previously only assumed by the
-- frontend (which never actually checked), so orders could be deleted first,
-- orphaning invoices that then failed to delete for an unrelated reason
-- (status != 'draft'), leaving the document chain broken either way.

CREATE OR REPLACE FUNCTION public.prevent_order_delete_with_active_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_number text;
  v_dispatch_number text;
BEGIN
  SELECT invoice_number INTO v_invoice_number
  FROM public.sales_invoices
  WHERE order_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Sales Order is linked to Invoice %. Cancel/Delete the invoice first.', v_invoice_number;
  END IF;

  SELECT dispatch_number INTO v_dispatch_number
  FROM public.dispatches
  WHERE order_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_dispatch_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Sales Order is linked to Dispatch %. Cancel it first.', v_dispatch_number;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_order_delete_with_active_documents ON public.orders;
CREATE TRIGGER trg_prevent_order_delete_with_active_documents
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_delete_with_active_documents();
