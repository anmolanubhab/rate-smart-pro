-- HSN Compliance Engine — Phase 5
-- createPurchaseInvoice() never wrote purchase_invoice_items.hsn despite the
-- column existing (fixed in src/lib/purchaseInvoices.ts alongside this
-- migration) — every purchase invoice line created before this fix has a
-- null hsn. Backfilled here from the linked product's current hsn_code,
-- mirroring the same backfill already done for sales_invoice_items in
-- 20260729080000_gst_backfill_sales_invoice_items.sql.
--
-- Caveat, worth keeping in mind if this data is ever audited: this is a
-- best-effort *reconstruction* from the product's HSN as it stands today,
-- not a true point-in-time snapshot — the product's HSN at the actual time
-- of purchase is unknown for these historical rows.
UPDATE public.purchase_invoice_items pii
SET hsn = pr.hsn_code
FROM public.products pr
WHERE pii.product_id = pr.id
  AND pii.hsn IS NULL
  AND pr.hsn_code IS NOT NULL;
