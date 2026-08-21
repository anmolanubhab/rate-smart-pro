-- Follow-up to 20260821110000: the Purchase Pricing Engine's "Additional
-- Discount %" (spec Mode 2 — sequential discount after the primary one)
-- needs its own persisted column on both purchase_order_items and
-- purchase_invoice_items; the prior migration only added the resolved-*
-- snapshot columns and missed this one.
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS additional_discount_percent numeric NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS additional_discount_percent numeric NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
