-- P1 remediation (Phase 4a): give Purchase Invoice a place to persist its
-- Round Off amount, mirroring sales_invoices.round_off_amount. Verified
-- purchase_invoices had no such column at all -- computeInvoiceTotals()
-- never applied any rounding step, so grand_total = taxable + tax_total
-- exactly, and the posted voucher balanced only because nothing was
-- rounded. accounting_settings.round_off_purchase_invoice already exists
-- and implies this should work; this migration plus the accompanying
-- purchaseInvoices.ts change make it actually do so.

ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS round_off_amount numeric NOT NULL DEFAULT 0;
