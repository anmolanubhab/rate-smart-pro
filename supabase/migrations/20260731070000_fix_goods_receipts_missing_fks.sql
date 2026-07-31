-- fetchGoodsReceipts() (src/lib/goodsReceipts.ts) embeds parties(name) and
-- warehouses(warehouse_name) via PostgREST's embedded-resource syntax, which
-- requires a real foreign key for PostgREST to resolve the join. goods_receipts
-- only ever had a FK on purchase_order_id — supplier_id/warehouse_id were left
-- as plain uuid columns, so every GRN list load has been returning a 400
-- ("could not find a relationship") since the GRN feature shipped.
ALTER TABLE public.goods_receipts
  ADD CONSTRAINT goods_receipts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.parties(id);
ALTER TABLE public.goods_receipts
  ADD CONSTRAINT goods_receipts_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);

NOTIFY pgrst, 'reload schema';
