-- Products.tsx previously hard-deleted a product with no check at all. Several
-- product-referencing tables (order_items, sales_invoice_items,
-- purchase_order_items, goods_receipt_items, purchase_invoice_items,
-- quotation_items) have their product_id FK set to ON DELETE SET NULL, so
-- deleting an in-use product silently blanked out the product reference on
-- every historical order/invoice/PO/GRN/quotation line — destroying
-- traceability rather than raising an error. Others (order_items itself,
-- stock_take_items, stock_transfer_items, production_orders, bom_master,
-- etc.) are NO ACTION, so a delete there just throws a raw Postgres FK
-- violation with no useful message.
--
-- get_products_in_use() lets the app check, in one round trip, which of a
-- batch of product IDs are referenced anywhere in the transactional/document
-- trail, so it can hard-delete the genuinely unused ones and archive
-- (status = 'inactive') the rest instead of corrupting or erroring on them.

CREATE OR REPLACE FUNCTION public.get_products_in_use(_product_ids uuid[])
RETURNS TABLE(product_id uuid, used_in text[])
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT pid, array_agg(DISTINCT src ORDER BY src)
  FROM (
    SELECT product_id AS pid, 'Sales Order' AS src FROM public.order_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Sales Invoice' FROM public.sales_invoice_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Purchase Order' FROM public.purchase_order_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Goods Receipt' FROM public.goods_receipt_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Purchase Invoice' FROM public.purchase_invoice_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Quotation' FROM public.quotation_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Sales Return' FROM public.sales_return_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Purchase Return' FROM public.purchase_return_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Stock Transfer' FROM public.stock_transfer_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Physical Stock Take' FROM public.stock_take_items WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Stock Ledger' FROM public.stock_movements WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Opening Stock' FROM public.opening_stock_entries WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Stock Adjustment' FROM public.inventory_adjustments WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Production Order' FROM public.production_orders WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Bill of Materials' FROM public.bom_master WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT raw_material_id, 'Bill of Materials (component)' FROM public.bom_items WHERE raw_material_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Batch Tracking' FROM public.product_batches WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Serial Tracking' FROM public.product_serials WHERE product_id = ANY(_product_ids)
    UNION ALL
    SELECT product_id, 'Warehouse Stock' FROM public.warehouse_stock WHERE product_id = ANY(_product_ids)
  ) t(pid, src)
  GROUP BY pid;
$$;

GRANT EXECUTE ON FUNCTION public.get_products_in_use(uuid[]) TO authenticated;
