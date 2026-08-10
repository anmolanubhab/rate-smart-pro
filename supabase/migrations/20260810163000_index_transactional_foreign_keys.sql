-- P3 fix (RD-Pro workflow audit, 2026-08-10): 223 unindexed foreign keys
-- were flagged by the Supabase performance advisor, concentrated on the
-- Sales/Purchase/Inventory/Accounting transactional backbone -- party
-- ledgers, outstanding/ageing reports, and voucher drill-downs all join
-- through these FK columns and will degrade as data volume grows. Additive
-- and safe: no behavior change, just covering indexes for the confirmed
-- unindexed FK columns on the backbone tables.

CREATE INDEX IF NOT EXISTS idx_dispatch_items_bin_id ON public.dispatch_items (bin_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_unit_id ON public.dispatch_items (unit_id);

CREATE INDEX IF NOT EXISTS idx_dispatches_invoice_id ON public.dispatches (invoice_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_locked_by ON public.dispatches (locked_by);
CREATE INDEX IF NOT EXISTS idx_dispatches_warehouse_id ON public.dispatches (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_bin_id ON public.goods_receipt_items (bin_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_product_id ON public.goods_receipt_items (product_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_unit_id ON public.goods_receipt_items (unit_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_warehouse_id ON public.goods_receipts (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_bin_id ON public.inventory_movements (bin_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_party_id ON public.inventory_movements (party_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_unit_id ON public.inventory_movements (unit_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_unit_id ON public.order_items (unit_id);

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON public.orders (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_orders_locked_by ON public.orders (locked_by);
CREATE INDEX IF NOT EXISTS idx_orders_party_id ON public.orders (party_id);

CREATE INDEX IF NOT EXISTS idx_parties_cancelled_by ON public.parties (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_parties_locked_by ON public.parties (locked_by);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_business_id ON public.payment_allocations (business_id);

CREATE INDEX IF NOT EXISTS idx_payment_entries_bank_account_id ON public.payment_entries (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_payment_entries_party_id ON public.payment_entries (party_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_unit_id ON public.purchase_invoice_items (unit_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_by ON public.purchase_invoices (created_by);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_unit_id ON public.purchase_order_items (unit_id);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_business_id ON public.purchase_return_items (business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product_id ON public.purchase_return_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_purchase_invoice_item_id ON public.purchase_return_items (purchase_invoice_item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return_id ON public.purchase_return_items (return_id);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_goods_receipt_item_id ON public.purchase_returns (goods_receipt_item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase_invoice_id ON public.purchase_returns (purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier_id ON public.purchase_returns (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_voucher_id ON public.purchase_returns (voucher_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_unit_id ON public.sales_invoice_items (unit_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_dispatch_id ON public.sales_invoices (dispatch_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_locked_by ON public.sales_invoices (locked_by);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_party_id ON public.sales_invoices (party_id);

CREATE INDEX IF NOT EXISTS idx_sales_return_items_batch_id ON public.sales_return_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_business_id ON public.sales_return_items (business_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_product_id ON public.sales_return_items (product_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return_id ON public.sales_return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_sales_invoice_item_id ON public.sales_return_items (sales_invoice_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_unit_id ON public.sales_return_items (unit_id);

CREATE INDEX IF NOT EXISTS idx_sales_returns_party_id ON public.sales_returns (party_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_sales_invoice_id ON public.sales_returns (sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_voucher_id ON public.sales_returns (voucher_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_warehouse_id ON public.sales_returns (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by ON public.supplier_payments (created_by);

CREATE INDEX IF NOT EXISTS idx_vouchers_adjustment_category_id ON public.vouchers (adjustment_category_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_created_by ON public.vouchers (created_by);
CREATE INDEX IF NOT EXISTS idx_vouchers_locked_by ON public.vouchers (locked_by);
