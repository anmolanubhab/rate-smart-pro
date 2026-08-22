-- Purchase Order simplification (2026-08-22): move receiving/operational
-- fields off the Purchase Order and onto the Goods Receipt Note.
--
-- Rationale: a PO records what/how-much/at-what-terms was ordered from a
-- supplier -- transporter, LR number, vehicle number and transport mode are
-- receiving-time facts (a supplier can use a different transporter per
-- shipment; PO->GRN is already one-to-many for partial receipts) and belong
-- on the document that captures what actually arrived, not the one that
-- states what was asked for. payment_terms duplicated parties.payment_terms
-- (already the real source of truth, set at PO-save time via
-- CreatePurchaseOrder.tsx's "auto-fill from supplier" step) and
-- terms_conditions was confirmed unused -- purchaseOrderUdm.ts (the PO
-- print/PDF builder) never reads it.
--
-- purchase_orders.transport_name/transporter_id/transport_mode/lr_number/
-- vehicle_number/payment_terms/terms_conditions were live columns with no
-- corresponding migration in this repo (added out-of-band) -- confirmed via
-- src/integrations/supabase/types.ts and grep across supabase/migrations.
--
-- Data preserved: goods_receipts gains the same five transport columns, and
-- existing GRNs linked to a PO that had transport data inherit it (a GRN's
-- transporter/LR/vehicle at receiving time was, for every existing record,
-- whatever the PO said -- the two were never captured separately before
-- today). payment_terms/terms_conditions are dropped outright: the former is
-- redundant with parties.payment_terms, the latter was never surfaced
-- anywhere.

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS transporter_id  uuid REFERENCES public.transporters(id),
  ADD COLUMN IF NOT EXISTS transport_name  text,
  ADD COLUMN IF NOT EXISTS transport_mode  text,
  ADD COLUMN IF NOT EXISTS lr_number       text,
  ADD COLUMN IF NOT EXISTS vehicle_number  text;

UPDATE public.goods_receipts gr
SET transporter_id = po.transporter_id,
    transport_name = po.transport_name,
    transport_mode = po.transport_mode,
    lr_number = po.lr_number,
    vehicle_number = po.vehicle_number
FROM public.purchase_orders po
WHERE gr.purchase_order_id = po.id
  AND (
    po.transporter_id IS NOT NULL OR po.transport_name IS NOT NULL OR
    po.transport_mode IS NOT NULL OR po.lr_number IS NOT NULL OR
    po.vehicle_number IS NOT NULL
  );

ALTER TABLE public.purchase_orders
  DROP COLUMN IF EXISTS transport_name,
  DROP COLUMN IF EXISTS transporter_id,
  DROP COLUMN IF EXISTS transport_mode,
  DROP COLUMN IF EXISTS lr_number,
  DROP COLUMN IF EXISTS vehicle_number,
  DROP COLUMN IF EXISTS payment_terms,
  DROP COLUMN IF EXISTS terms_conditions;

NOTIFY pgrst, 'reload schema';
