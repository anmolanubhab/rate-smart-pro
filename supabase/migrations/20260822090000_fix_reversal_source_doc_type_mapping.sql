-- Fix: GRN delete blocked by its own reversal (2026-08-22).
--
-- Repro: cancel a "received" GRN (writes a correct reversal movement via
-- trg_grn_cancel_reversal, reference_type='goods_receipt_reversal'), then try
-- to delete it. Blocked by trg_prevent_goods_receipt_delete_unreversed_stock
-- (20260819130000) with "1 linked inventory movement(s) do not net to zero" --
-- even though the reversal happened and stock is correct.
--
-- Root cause: inventory_movements_populate_source_doc()'s reference_type ->
-- source_doc_type mapping has no case for 'goods_receipt_reversal' or
-- 'dispatch_cancel', so rows written with those reference_types get
-- source_doc_type = NULL. The delete-guard trigger only sums movements
-- WHERE source_doc_type = 'goods_receipt' AND source_doc_id = OLD.id, so it
-- never sees the (unlinked) reversal row -- it only sees the original +qty
-- receipt movement, which looks like a non-zero, unreversed net.
--
-- The 20260814092000 audit explicitly called 'goods_receipt_reversal' and
-- 'dispatch_reversal' "legacy, no writer anywhere" -- true at the time, but
-- trg_grn_cancel_reversal (confirmed live in 20260817120000) writes
-- 'goods_receipt_reversal' on every GRN cancel, and reverse_sales_invoice_stock
-- (20260810150000) writes 'dispatch_cancel' (not 'dispatch_reversal') on every
-- sales-invoice cancel whose stock was deducted at dispatch time. Both were
-- missed by that audit's mapping.
--
-- Fix: add both cases to the mapping (both point back at their parent doc's
-- source_doc_type, since a reversal's reference_id is the original document's
-- id -- see 20260817120000 line 64 and 20260810150000 line 85), then backfill
-- existing rows so previously-cancelled documents can be deleted.

CREATE OR REPLACE FUNCTION public.inventory_movements_populate_source_doc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source_doc_type IS NULL AND NEW.reference_type IS NOT NULL THEN
    NEW.source_doc_type := CASE NEW.reference_type
      WHEN 'sales_invoice'          THEN 'sales_invoice'
      WHEN 'sales_invoice_cancel'   THEN 'sales_invoice'
      WHEN 'purchase_invoice'       THEN 'purchase_invoice'
      WHEN 'purchase_return'        THEN 'purchase_return'
      WHEN 'sales_return'           THEN 'sales_return'
      WHEN 'dispatch'               THEN 'dispatch'
      WHEN 'dispatch_cancel'        THEN 'dispatch'
      WHEN 'goods_receipt'          THEN 'goods_receipt'
      WHEN 'goods_receipt_reversal' THEN 'goods_receipt'
      WHEN 'inventory_adjustment'   THEN 'inventory_adjustment'
      WHEN 'stock_take'             THEN 'stock_take_sheet'
      ELSE NULL
    END;
    IF NEW.source_doc_type IS NOT NULL THEN
      NEW.source_doc_id := NEW.reference_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill existing rows the trigger above never got a chance to run for.
UPDATE public.inventory_movements
SET source_doc_type = 'goods_receipt',
    source_doc_id = reference_id
WHERE reference_type = 'goods_receipt_reversal'
  AND source_doc_type IS NULL;

UPDATE public.inventory_movements
SET source_doc_type = 'dispatch',
    source_doc_id = reference_id
WHERE reference_type = 'dispatch_cancel'
  AND source_doc_type IS NULL;
