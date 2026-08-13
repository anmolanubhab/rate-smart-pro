-- Root cause (RD-Pro Stock Summary showing stale stock for cancelled Sales
-- Invoices): src/lib/salesInvoices.ts cancelInvoice() flips
-- sales_invoices.status to 'cancelled' FIRST, then calls
-- reverse_sales_invoice_stock() as a best-effort RPC wrapped in try/catch
-- that only console.error's on failure -- it never re-throws, and never
-- rolls back the status update that already committed. If that RPC call
-- fails for any reason (network blip, transient error, tab closed before
-- the second await resolves), the invoice is left "Cancelled" in the UI
-- while its original 'sale'/'dispatch' inventory_movements rows are never
-- reversed -- their stock effect stays baked into every stock report
-- (Stock Summary, Stock Ledger, the Inventory screen's products.stock)
-- forever, with no live way to detect it after the fact.
--
-- inventory_movements itself has no status/deleted column -- validity is
-- expressed only by a genuine offsetting reversal row referencing the same
-- reference_id (confirmed: a cancelled purchase invoice in production has
-- exactly this shape -- a +150 purchase_invoice_direct movement paired
-- with a -150 purchase_invoice_cancel movement, net zero). get_stock_summary/
-- get_stock_movement_register already sum inventory_movements.qty directly,
-- so they report correctly whenever that reversal pair actually exists --
-- the bug is that it sometimes doesn't get written at all, not that the
-- reporting query mishandles it once it does.
--
-- Fix: make the reversal unconditional and atomic at the database level,
-- the same way dispatch cancellation already works correctly today
-- (trg_dispatch_cancel_reversal, an AFTER UPDATE trigger that fires
-- automatically on status -> 'cancelled', not a client-side best-effort
-- call). This trigger calls the EXISTING reverse_sales_invoice_stock()
-- function unchanged -- no reversal logic is duplicated -- and that
-- function already guards against double-reversal (it checks for an
-- existing 'sales_invoice_cancel'/'dispatch_cancel' movement for this
-- invoice before doing anything), so it's safe to fire from both this
-- trigger AND the existing client-side call in cancelInvoice() without
-- ever reversing stock twice.

CREATE OR REPLACE FUNCTION public.trg_reverse_sales_invoice_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM public.reverse_sales_invoice_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sales_invoice_cancel_reversal ON public.sales_invoices;
CREATE TRIGGER trg_sales_invoice_cancel_reversal
  AFTER UPDATE OF status ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_reverse_sales_invoice_stock_on_cancel();

REVOKE EXECUTE ON FUNCTION public.trg_reverse_sales_invoice_stock_on_cancel() FROM PUBLIC, anon;
