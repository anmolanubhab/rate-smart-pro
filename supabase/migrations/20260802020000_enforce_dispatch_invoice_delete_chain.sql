-- Extends the delete-chain guard already enforced on public.orders
-- (20260801000000_enforce_order_delete_document_chain.sql) down one level:
-- a Dispatch may not be hard-deleted while an active Sales Invoice still
-- references it, and a Sales Invoice may not be hard-deleted while an
-- active (non-reversed) payment is still allocated against it. Both were
-- previously only assumed/checked in application code
-- (deleteDispatch/deleteInvoice), which any direct API/RPC call could
-- bypass.

CREATE OR REPLACE FUNCTION public.prevent_dispatch_delete_with_active_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_number text;
BEGIN
  SELECT invoice_number INTO v_invoice_number
  FROM public.sales_invoices
  WHERE dispatch_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Dispatch is linked to Invoice %. Cancel/reverse the invoice first.', v_invoice_number;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_dispatch_delete_with_active_invoice ON public.dispatches;
CREATE TRIGGER trg_prevent_dispatch_delete_with_active_invoice
  BEFORE DELETE ON public.dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_dispatch_delete_with_active_invoice();

CREATE OR REPLACE FUNCTION public.prevent_invoice_delete_with_active_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_payment boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.payment_allocations
    WHERE sales_invoice_id = OLD.id AND amount > 0
  ) INTO v_has_payment;

  IF v_has_payment THEN
    RAISE EXCEPTION 'This Invoice has Payment already received. Reverse the payment first.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_delete_with_active_payment ON public.sales_invoices;
CREATE TRIGGER trg_prevent_invoice_delete_with_active_payment
  BEFORE DELETE ON public.sales_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invoice_delete_with_active_payment();
