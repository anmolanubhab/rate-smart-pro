-- The trigger doesn't need elevated privileges (it only SELECTs from tables
-- the deleting role already has access to) — SECURITY DEFINER just left it
-- callable directly via the REST RPC endpoint by anon/authenticated roles
-- (harmless since OLD isn't available outside trigger context, but flagged
-- by the linter). Switch to SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.prevent_order_delete_with_active_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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
