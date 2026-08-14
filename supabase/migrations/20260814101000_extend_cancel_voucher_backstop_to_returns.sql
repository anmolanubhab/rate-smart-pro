-- Phase 1, Migration 7 of Tally-style voucher lifecycle redesign.
-- Purpose: cancelReturn() (src/lib/returns.ts, used by both cancelSalesReturn()
-- and cancelPurchaseReturn()) has the identical ghost-ledger vector already fixed
-- for invoices in the previous migration -- its linked voucher cancel is wrapped
-- in try/catch { console.error }. Reuse the same generic trigger function
-- (it only depends on NEW.status/OLD.status/NEW.voucher_id, present on both
-- sales_returns and purchase_returns) rather than duplicating logic.

DROP TRIGGER IF EXISTS trg_sales_return_cancel_voucher ON public.sales_returns;
CREATE TRIGGER trg_sales_return_cancel_voucher
  AFTER UPDATE OF status ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_linked_voucher_on_invoice_cancel();

DROP TRIGGER IF EXISTS trg_purchase_return_cancel_voucher ON public.purchase_returns;
CREATE TRIGGER trg_purchase_return_cancel_voucher
  AFTER UPDATE OF status ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_linked_voucher_on_invoice_cancel();
