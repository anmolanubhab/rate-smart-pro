-- Accounting integrity audit, P0 Orphan Prevention (2026-08-19).
--
-- Root cause of the 207 orphaned inventory_movements found in AKL Traders:
-- 20260814092000_inventory_movements_identity_columns.sql backfilled
-- source_doc_type/source_doc_id ONCE for existing rows, but nothing keeps
-- them populated for NEW rows -- confirmed empirically: every one of the 42
-- inventory_movements rows inserted since that backfill (2026-08-14 onward)
-- has source_doc_type IS NULL despite reference_type being set. That means
-- vw_effective_stock_movements' orphan-detection fallback ("no source doc
-- match -> always effective") can never actually fire for anything written
-- after the backfill, and reconcile_effective_stock()/check_movement_
-- integrity() are silently blind to any NEW orphan. Two-part fix:
--
-- 1. trg_inventory_movements_populate_source_doc: auto-derives
--    source_doc_type/source_doc_id from reference_type/reference_id on every
--    INSERT, using the exact same mapping the one-time backfill used -- one
--    choke point instead of touching every JS call site that writes this
--    table (goods receipts, dispatches, purchase/sales invoices, returns,
--    adjustments, stock takes, ...).
--
-- 2. trg_prevent_*_delete_unreversed_stock on the six document tables
--    (sales_invoices, purchase_invoices, goods_receipts, dispatches,
--    sales_returns, purchase_returns): blocks DELETE if that document's
--    inventory_movements don't net to exactly zero. Deliberately a NET-ZERO
--    check, not a "zero rows reference it" check -- the existing app-layer
--    delete flows (deleteGRN/deleteDispatch/deletePurchaseInvoice/
--    deleteInvoice) are only reachable after cancel already wrote a
--    compensating reversal movement, so their net is legitimately zero and
--    must keep working unchanged. What this blocks is exactly the failure
--    mode that created the 207 orphans: a document deleted (via a raw-SQL
--    script like cleanup_demo_pending_orders.sql, or any future code path)
--    whose stock effect was never reversed at all -- net non-zero -- so it
--    now fails loudly instead of leaving a permanent phantom-stock row.
--    Being a DB trigger, this protects against the Supabase Studio /
--    execute_sql-tool bypass path too, not just app code.
--
-- Verified live (2026-08-19, in a rolled-back transaction): a nonzero-net
-- delete attempt is correctly blocked with a clear error; a net-zero delete
-- (mirroring the existing cancel-then-delete app flow) is correctly allowed.

CREATE OR REPLACE FUNCTION public.inventory_movements_populate_source_doc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source_doc_type IS NULL AND NEW.reference_type IS NOT NULL THEN
    NEW.source_doc_type := CASE NEW.reference_type
      WHEN 'sales_invoice'        THEN 'sales_invoice'
      WHEN 'sales_invoice_cancel' THEN 'sales_invoice'
      WHEN 'purchase_invoice'     THEN 'purchase_invoice'
      WHEN 'purchase_return'      THEN 'purchase_return'
      WHEN 'sales_return'         THEN 'sales_return'
      WHEN 'dispatch'             THEN 'dispatch'
      WHEN 'goods_receipt'        THEN 'goods_receipt'
      WHEN 'inventory_adjustment' THEN 'inventory_adjustment'
      WHEN 'stock_take'           THEN 'stock_take_sheet'
      ELSE NULL
    END;
    IF NEW.source_doc_type IS NOT NULL THEN
      NEW.source_doc_id := NEW.reference_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.inventory_movements_populate_source_doc() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_movements_populate_source_doc() FROM anon;

DROP TRIGGER IF EXISTS trg_inventory_movements_populate_source_doc ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_populate_source_doc
BEFORE INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_populate_source_doc();

CREATE OR REPLACE FUNCTION public.prevent_document_delete_with_unreversed_movements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc_type text := TG_ARGV[0];
  v_net numeric;
  v_count integer;
BEGIN
  SELECT COALESCE(SUM(qty), 0), count(*) INTO v_net, v_count
  FROM public.inventory_movements
  WHERE source_doc_type = v_doc_type AND source_doc_id = OLD.id;

  IF v_count > 0 AND v_net <> 0 THEN
    RAISE EXCEPTION 'Cannot delete % % -- its % linked inventory movement(s) do not net to zero (unreversed stock effect of %). Reverse/cancel the stock impact before deleting.', v_doc_type, OLD.id, v_count, v_net
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_document_delete_with_unreversed_movements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_document_delete_with_unreversed_movements() FROM anon;

DROP TRIGGER IF EXISTS trg_prevent_sales_invoice_delete_unreversed_stock ON public.sales_invoices;
CREATE TRIGGER trg_prevent_sales_invoice_delete_unreversed_stock
BEFORE DELETE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_document_delete_with_unreversed_movements('sales_invoice');

DROP TRIGGER IF EXISTS trg_prevent_purchase_invoice_delete_unreversed_stock ON public.purchase_invoices;
CREATE TRIGGER trg_prevent_purchase_invoice_delete_unreversed_stock
BEFORE DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_document_delete_with_unreversed_movements('purchase_invoice');

DROP TRIGGER IF EXISTS trg_prevent_goods_receipt_delete_unreversed_stock ON public.goods_receipts;
CREATE TRIGGER trg_prevent_goods_receipt_delete_unreversed_stock
BEFORE DELETE ON public.goods_receipts
FOR EACH ROW EXECUTE FUNCTION public.prevent_document_delete_with_unreversed_movements('goods_receipt');

DROP TRIGGER IF EXISTS trg_prevent_dispatch_delete_unreversed_stock ON public.dispatches;
CREATE TRIGGER trg_prevent_dispatch_delete_unreversed_stock
BEFORE DELETE ON public.dispatches
FOR EACH ROW EXECUTE FUNCTION public.prevent_document_delete_with_unreversed_movements('dispatch');

DROP TRIGGER IF EXISTS trg_prevent_sales_return_delete_unreversed_stock ON public.sales_returns;
CREATE TRIGGER trg_prevent_sales_return_delete_unreversed_stock
BEFORE DELETE ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.prevent_document_delete_with_unreversed_movements('sales_return');

DROP TRIGGER IF EXISTS trg_prevent_purchase_return_delete_unreversed_stock ON public.purchase_returns;
CREATE TRIGGER trg_prevent_purchase_return_delete_unreversed_stock
BEFORE DELETE ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.prevent_document_delete_with_unreversed_movements('purchase_return');
