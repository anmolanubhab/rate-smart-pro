-- P0 remediation (4/6): restore DB-level protection against hard-deleting
-- a posted voucher that a source document still depends on.
--
-- Verified live defects (forensic audit, 2026-08-09):
--  - trg_prevent_posted_voucher_delete was added 2026-08-01
--    (purchase_and_voucher_delete_firewall) then deliberately dropped
--    2026-08-06 (allow_hard_delete_of_posted_vouchers) -- confirmed zero
--    %prevent%voucher%delete% functions exist today.
--  - sales_invoices.voucher_id, purchase_invoices.voucher_id,
--    payment_entries.voucher_id carry NO foreign key to vouchers at all.
--    purchase_returns/sales_returns/inventory_adjustments/
--    year_closing_entries.voucher_id are NO ACTION FKs.
--  - voucherService.ts::deleteVoucher() deliberately nulls voucher_id on
--    all of those tables BEFORE deleting voucher_items then the voucher
--    row (needed so the NO ACTION FKs don't reject the delete, and so the
--    balance-reversal trigger still sees status='posted' while items are
--    removed). A guard based on "do any child rows still reference me"
--    would therefore be trivially defeated by the app's own existing,
--    legitimate null-out step for a genuinely safe draft delete -- so
--    this guard is based on the voucher row's OWN status/reference_type,
--    which the null-out step never touches, plus a child-row check as
--    defense in depth for any caller that bypasses the null-out step.
--  - Live reference_type values in production: sales_invoice,
--    purchase_invoice, purchase_return, payment_entry, supplier_payment,
--    NULL -- every voucher auto-generated from a source document carries
--    a non-null reference_type.
--
-- Explicitly ALLOWED (unchanged): draft vouchers (any linkage state),
-- cancelled vouchers, and a posted-but-genuinely-standalone voucher
-- (reference_type IS NULL, zero live child references) -- e.g. a manual
-- Journal/Payment/Receipt/Contra entry nobody else depends on.

CREATE OR REPLACE FUNCTION public.prevent_posted_voucher_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linked_count integer := 0;
BEGIN
  IF OLD.status = 'posted' THEN
    IF OLD.reference_type IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot hard-delete posted voucher % -- it was generated from a %. Cancel or unlink the source document first.', OLD.voucher_number, OLD.reference_type
        USING ERRCODE = '23503';
    END IF;

    SELECT
        (SELECT count(*) FROM public.sales_invoices WHERE voucher_id = OLD.id)
      + (SELECT count(*) FROM public.purchase_invoices WHERE voucher_id = OLD.id)
      + (SELECT count(*) FROM public.payment_entries WHERE voucher_id = OLD.id)
      + (SELECT count(*) FROM public.purchase_returns WHERE voucher_id = OLD.id)
      + (SELECT count(*) FROM public.sales_returns WHERE voucher_id = OLD.id)
      + (SELECT count(*) FROM public.inventory_adjustments WHERE voucher_id = OLD.id)
    INTO v_linked_count;

    IF v_linked_count > 0 THEN
      RAISE EXCEPTION 'Cannot hard-delete posted voucher % -- % linked document(s) still reference it. Unlink or cancel them first.', OLD.voucher_number, v_linked_count
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_prevent_posted_voucher_delete
BEFORE DELETE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_voucher_delete();
