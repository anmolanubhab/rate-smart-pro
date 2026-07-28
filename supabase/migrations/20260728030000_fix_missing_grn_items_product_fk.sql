-- Pre-existing bug found while browser-testing the QC feature: goods_receipt_items
-- had no foreign key from product_id -> products.id (only FKs to goods_receipts,
-- purchase_order_items, units existed). Without it, PostgREST can't resolve
-- Supabase's embedded-relation syntax (`product:products(...)`) used by
-- fetchGrnItemsForInvoice() in src/lib/purchaseInvoices.ts — the "Link GRN"
-- prefill in RecordPurchaseInvoiceDialog.tsx has silently never worked at
-- runtime, independent of anything in this session's QC changes.
ALTER TABLE public.goods_receipt_items
  ADD CONSTRAINT goods_receipt_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
