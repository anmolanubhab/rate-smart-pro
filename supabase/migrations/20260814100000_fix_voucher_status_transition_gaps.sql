-- Phase 1, Migration 6 of Tally-style voucher lifecycle redesign.
-- Purpose: (1) make "cancel is one-way" a structural DB guarantee, not just an
-- app-level convention -- per the locked project decision, a cancelled voucher
-- must never be un-cancelled; (2) close the two remaining "ghost ledger" vectors
-- where cancelling a sales/purchase invoice can leave its auto-posted voucher
-- still counting toward balances if the separate client-side cancelVoucher()
-- call is skipped or fails -- by making that cancellation an unconditional,
-- atomic DB trigger fired from the SAME UPDATE statement that flips the source
-- document to 'cancelled', exactly the pattern already proven correct for stock
-- reversal in 20260813010000_enforce_sales_invoice_cancel_stock_reversal.sql.
--
-- Captured live body of vouchers_sync_balance_on_status_change() before this
-- change (2026-08-14): the existing two branches (draft/cancelled->posted
-- applies delta; posted->cancelled reverses it) are preserved as-is. Only a new
-- guard is added ahead of them.

CREATE OR REPLACE FUNCTION public.vouchers_sync_balance_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  -- Cancel is a one-way transition (Tally-style, locked project decision --
  -- no restore workflow). Reject any attempt to move a voucher OUT of
  -- 'cancelled' outright, regardless of target status, before either branch
  -- below can run.
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled vouchers cannot be un-cancelled. Create a new voucher instead.';
  END IF;

  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
    FOR r IN SELECT ledger_account_id, dr_amount, cr_amount FROM public.voucher_items WHERE voucher_id = NEW.id LOOP
      PERFORM public.apply_ledger_balance_delta(r.ledger_account_id, COALESCE(r.dr_amount,0), COALESCE(r.cr_amount,0));
    END LOOP;
  ELSIF OLD.status = 'posted' AND NEW.status = 'cancelled' THEN
    FOR r IN SELECT ledger_account_id, dr_amount, cr_amount FROM public.voucher_items WHERE voucher_id = NEW.id LOOP
      PERFORM public.apply_ledger_balance_delta(r.ledger_account_id, -COALESCE(r.dr_amount,0), -COALESCE(r.cr_amount,0));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Atomic voucher-cancel backstop for sales_invoices and purchase_invoices.
--
-- Today, cancelling a posted invoice cancels the invoice row and its linked
-- voucher as two SEPARATE client-side calls (see src/lib/salesInvoices.ts
-- cancelInvoice(), src/lib/purchaseInvoices.ts cancelPurchaseInvoice()) with
-- the voucher cancel wrapped in try/catch { console.error } -- a confirmed
-- ghost-ledger vector if that second call never runs or fails. Making the
-- linked voucher's cancellation fire as a trigger on the SAME UPDATE that
-- flips the invoice to 'cancelled' makes it atomic with that statement,
-- structurally -- not merely best-effort.
--
-- Idempotent/safe to fire even if the app-level cancelVoucher() call also
-- runs afterward: the UPDATE is a no-op once status is already 'cancelled'
-- (WHERE status = 'posted' guard), so no double-reversal is possible.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_cancel_linked_voucher_on_invoice_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.voucher_id IS NOT NULL THEN
    UPDATE public.vouchers
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancelled_reason = COALESCE(cancelled_reason, 'Source document cancelled')
    WHERE id = NEW.voucher_id
      AND status = 'posted';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_cancel_linked_voucher_on_invoice_cancel() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_sales_invoice_cancel_voucher ON public.sales_invoices;
CREATE TRIGGER trg_sales_invoice_cancel_voucher
  AFTER UPDATE OF status ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_linked_voucher_on_invoice_cancel();

DROP TRIGGER IF EXISTS trg_purchase_invoice_cancel_voucher ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoice_cancel_voucher
  AFTER UPDATE OF status ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_linked_voucher_on_invoice_cancel();

COMMENT ON FUNCTION public.trg_cancel_linked_voucher_on_invoice_cancel() IS
  'Atomic backstop: cancels the voucher linked to a sales_invoice/purchase_invoice the instant that document''s status flips to cancelled, in the same transaction. Closes the ghost-ledger vector where the separate client-side cancelVoucher() call (see cancelInvoice()/cancelPurchaseInvoice()) is skipped or fails.';
