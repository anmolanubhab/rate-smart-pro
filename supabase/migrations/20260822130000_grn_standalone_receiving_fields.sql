-- GRN standalone-receiving refactor (2026-08-22): a GRN records what
-- physically arrived from a supplier — it is not required to reference a
-- Purchase Order, and its received quantity is never capped to a PO's
-- pending quantity. Purchase Order linkage (goods_receipts.purchase_order_id)
-- was already nullable and every DB trigger touching it already no-ops
-- gracefully when it's NULL (recalc_po_quantities(_po_id) returns early on
-- NULL; grn_item_apply_hold_stock() posts stock purely off product_id/
-- received_qty/accepted_qty/damaged_qty/shortage_qty, never touching
-- purchase_order_item_id) — confirmed live via pg_get_functiondef before
-- writing this migration. So no schema relaxation is needed there; this
-- migration only adds the receiving-time header fields a standalone GRN
-- needs that the PO link previously stood in for.

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS supplier_challan_number text,
  ADD COLUMN IF NOT EXISTS supplier_challan_date   date,
  ADD COLUMN IF NOT EXISTS lr_date                 date;

NOTIFY pgrst, 'reload schema';
