-- Extends the delete-safety firewall already in place for Sales Orders/Invoices
-- (20260801000000_enforce_order_delete_document_chain.sql,
-- 20260801010000_enforce_posted_invoice_no_delete.sql) to Purchase Orders,
-- Goods Receipts, Purchase Invoices, and all Accounting Vouchers (Payment,
-- Receipt, Journal, Contra, Credit Note, Debit Note all live in `vouchers`).
--
-- None of these tables had any DB-level block on delete: purchase_orders,
-- goods_receipts, and purchase_invoices FKs are ON DELETE SET NULL, so a
-- delete "succeeds" but silently blanks the reference on downstream
-- historical records; vouchers had no trigger at all (only an app-layer
-- check in voucherService.ts, and that check has its own bug fixed
-- separately in this same change).

-- 1. Purchase Order: block delete while any GRN exists (GRN has no cancelled
--    state yet — any row is "active"), or any non-cancelled Purchase Invoice
--    references it.
CREATE OR REPLACE FUNCTION public.prevent_purchase_order_delete_with_active_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_grn_number text;
  v_invoice_number text;
BEGIN
  SELECT grn_number INTO v_grn_number
  FROM public.goods_receipts
  WHERE purchase_order_id = OLD.id
  LIMIT 1;

  IF v_grn_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Purchase Order is linked to Goods Receipt %. Remove it first.', v_grn_number;
  END IF;

  SELECT invoice_number INTO v_invoice_number
  FROM public.purchase_invoices
  WHERE purchase_order_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Purchase Order is linked to Purchase Invoice %. Cancel/Delete the invoice first.', v_invoice_number;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_purchase_order_delete_with_active_documents ON public.purchase_orders;
CREATE TRIGGER trg_prevent_purchase_order_delete_with_active_documents
  BEFORE DELETE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_purchase_order_delete_with_active_documents();

-- 2. Goods Receipt (GRN): block delete while any non-cancelled Purchase
--    Invoice was generated from it.
CREATE OR REPLACE FUNCTION public.prevent_grn_delete_with_active_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_number text;
BEGIN
  SELECT invoice_number INTO v_invoice_number
  FROM public.purchase_invoices
  WHERE goods_receipt_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Goods Receipt is linked to Purchase Invoice %. Cancel/Delete the invoice first.', v_invoice_number;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_grn_delete_with_active_documents ON public.goods_receipts;
CREATE TRIGGER trg_prevent_grn_delete_with_active_documents
  BEFORE DELETE ON public.goods_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_grn_delete_with_active_documents();

-- 3. Purchase Invoice: a real financial document, not a draft/posted
--    lifecycle like sales_invoices (status is unpaid/partially_paid/paid/
--    cancelled — a payment-progress status). No "cancel" UI action exists
--    for it yet, so until Phase 2 adds one, block delete unless the row is
--    already cancelled, and always block if a supplier payment references it.
CREATE OR REPLACE FUNCTION public.prevent_purchase_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Purchase Invoice % cannot be deleted while active (status: %). Cancel it first.', OLD.invoice_number, OLD.status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.supplier_payments WHERE purchase_invoice_id = OLD.id) THEN
    RAISE EXCEPTION 'Purchase Invoice % has a recorded supplier payment against it and cannot be deleted.', OLD.invoice_number;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_purchase_invoice_delete ON public.purchase_invoices;
CREATE TRIGGER trg_prevent_purchase_invoice_delete
  BEFORE DELETE ON public.purchase_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_purchase_invoice_delete();

-- 4. Accounting Voucher (Payment/Receipt/Journal/Contra/Credit Note/Debit
--    Note all live here): block delete once posted, mirroring
--    prevent_posted_invoice_delete. Defense-in-depth backing up the
--    app-layer check in voucherService.ts's deleteVoucher(), whose own
--    error-swallowing bug is fixed separately in this change.
CREATE OR REPLACE FUNCTION public.prevent_posted_voucher_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted voucher % cannot be deleted. Cancel it first.', OLD.voucher_number;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_voucher_delete ON public.vouchers;
CREATE TRIGGER trg_prevent_posted_voucher_delete
  BEFORE DELETE ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_posted_voucher_delete();
