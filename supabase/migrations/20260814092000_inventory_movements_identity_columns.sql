-- Phase 0, Migration 3 of Tally-style voucher lifecycle redesign.
-- Purpose: give inventory_movements (the real stock ledger) an IDENTITY link back
-- to its source document, WITHOUT adding a validity/status column. Validity stays
-- derived (joined against vw_document_lifecycle), never cached here -- this is what
-- keeps the design aligned with the existing "ledger-residual, compute on read"
-- principle instead of creating a second source of truth that has to be kept in
-- lockstep (the exact failure mode products.stock already demonstrates).
--
-- No FK is added: reference_type/reference_id is genuinely polymorphic (at least
-- 10 shapes today) and several movement_types (initial, import, manual corrections)
-- have no source document at all. The lifecycle view is the contract, not a constraint.
--
-- Backfill mapping verified against live data (project zskfuioojivdqmqkzjqc, 2026-08-14):
-- reference_type values that reliably carry the parent doc id in reference_id
-- (confirmed either by direct existence match or by reading the INSERT statement
-- in the writing trigger/RPC):
--   sales_invoice, sales_invoice_cancel -> sales_invoice   (20260810150000: reference_id = _invoice_id)
--   purchase_invoice                    -> purchase_invoice (both *_direct and *_cancel share this reference_type)
--   purchase_return                     -> purchase_return  (covers return/cancel/qc_rejection/qc_rejection_cancel)
--   sales_return                        -> sales_return     (covers return/cancel)
--   dispatch                            -> dispatch         (20260519065639: reference_id = NEW.dispatch_id)
--   goods_receipt                       -> goods_receipt    (20260807060000: reference_id = NEW.goods_receipt_id)
--   inventory_adjustment                -> inventory_adjustment
--   stock_take                          -> stock_take_sheet (confirmed by direct id match against stock_take_sheets)
-- Left unmapped (source_doc_type stays NULL -> always-effective, identical to today):
--   product_create, stock_import, stock_transfer, data_fix, manual_correction
--   (no source document / not a lifecycle-tracked entity)
--   dispatch_reversal, goods_receipt_reversal
--   (legacy reference_type values with no writer anywhere in current migrations or
--   src/ -- grepped and confirmed absent; their reference_id semantics are unknown
--   and not worth guessing at. Any row here remains always-effective exactly as
--   it is today; nothing about their treatment changes.)
--
-- Note: a stale reference_id that no longer matches any live document (heavy
-- test-data churn produced many of these) is harmless under this design -- the
-- LEFT JOIN in vw_effective_stock_movements simply fails to match, and the row
-- falls into the "no matching document" branch, which is always-effective --
-- identical to leaving source_doc_type NULL. So this backfill does not need to
-- pre-verify existence; incorrect/stale ids degrade gracefully to today's behavior.

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS source_doc_type text,
  ADD COLUMN IF NOT EXISTS source_doc_id   uuid,
  ADD COLUMN IF NOT EXISTS is_compensating boolean NOT NULL DEFAULT false;

UPDATE public.inventory_movements
SET
  source_doc_type = CASE reference_type
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
  END,
  source_doc_id = CASE reference_type
    WHEN 'sales_invoice'        THEN reference_id
    WHEN 'sales_invoice_cancel' THEN reference_id
    WHEN 'purchase_invoice'     THEN reference_id
    WHEN 'purchase_return'      THEN reference_id
    WHEN 'sales_return'         THEN reference_id
    WHEN 'dispatch'             THEN reference_id
    WHEN 'goods_receipt'        THEN reference_id
    WHEN 'inventory_adjustment' THEN reference_id
    WHEN 'stock_take'           THEN reference_id
    ELSE NULL
  END,
  is_compensating = movement_type IN (
    'sale_reversal', 'dispatch_cancel', 'purchase_invoice_cancel',
    'sales_return_cancel', 'purchase_return_cancel', 'qc_rejection_cancel'
  )
WHERE source_doc_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_source_doc
  ON public.inventory_movements (business_id, source_doc_type, source_doc_id);

COMMENT ON COLUMN public.inventory_movements.source_doc_type IS
  'Identity link to the source document type (see vw_document_lifecycle doc_type values). NULL means no lifecycle-tracked source (initial stock, import, manual correction, or a legacy/unmapped reference_type) -- such rows are always effective. Never used as a validity flag by itself -- join to vw_document_lifecycle for that.';
COMMENT ON COLUMN public.inventory_movements.is_compensating IS
  'True for movement rows that reverse an earlier posting (cancel/return-reversal). Kept for history/audit richness in reports that show cancelled activity; vw_effective_stock_movements excludes both an original and its compensating row together via the lifecycle join, not via this flag.';
