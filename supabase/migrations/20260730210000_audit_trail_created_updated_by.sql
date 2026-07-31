-- Consistent audit-trail columns across core transactional tables.
--
-- Audit found the pattern inconsistent: purchase_orders has created_by/
-- approved_by/approved_at and the app actually populates them; orders and
-- vouchers already have created_by (and orders has updated_by too) sitting
-- unused in the live schema (confirmed via src/integrations/supabase/
-- types.ts, which is ahead of this repo's migration history); dispatches
-- and sales_invoices have neither column at all; purchase_invoices has
-- created_by but no updated_by. This migration closes the column gaps only
-- — the application-code changes that actually populate them on every
-- insert/update ship alongside it in src/lib/{orders,voucherService,
-- dispatches,salesInvoices,purchaseInvoices}.ts.
--
-- vouchers already has created_by/approved_by/approved_at/cancelled_by
-- (used by cancelVoucher()) — only updated_by is missing.
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- dispatches has cancelled_by/deleted_by/locked_by but no creator/editor.
ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- sales_invoices: same gap as dispatches.
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- purchase_invoices already has created_by (populated by savePurchaseInvoice());
-- only updated_by is missing.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Backfill: every existing row's original creator is already known via
-- user_id (the immutable creator field on these tables), so created_by can
-- be backfilled exactly rather than left null for all pre-existing rows.
UPDATE public.dispatches SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.sales_invoices SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.vouchers SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.orders SET created_by = user_id WHERE created_by IS NULL;
