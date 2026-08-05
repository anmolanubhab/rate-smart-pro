-- GST Portal Sync — future-ready architecture, no live GSP/GSTN API calls.
--
-- Decision: user has no GSP/ASP subscription today, so the manual
-- generate-JSON / paste-response workflow (EInvoiceEwayDialog.tsx, backed by
-- einvoice_/ewaybill_ RPCs) stays the production path. This migration only
-- adds the columns a future API-mode provider would need to record sync
-- state, plus a business-level toggle for which mode is active. Everything
-- is nullable or defaulted so existing rows and the current manual flow are
-- unaffected.
--
-- Deliberately NOT duplicated onto sales_invoices: that table already has
-- dead irn/e_invoice_status/eway_bill_no/gst_registration_id columns left
-- over from an earlier abandoned "GST Engine" attempt (confirmed unused —
-- Invoices.tsx and PrintDocument.tsx both read IRN from einvoice_records via
-- the join, never from sales_invoices directly). einvoice_records and
-- ewaybill_records are the real source of truth per GST Compliance Suite
-- Phase 2/3, so the new sync-tracking columns join them instead of
-- recreating that same duplication.

ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS gst_integration_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS default_place_of_supply text;

DO $$ BEGIN
  ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_gst_integration_mode_check
    CHECK (gst_integration_mode IN ('manual', 'api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.einvoice_records
  ADD COLUMN IF NOT EXISTS signed_invoice text,
  ADD COLUMN IF NOT EXISTS api_request_id text,
  ADD COLUMN IF NOT EXISTS api_response jsonb,
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_attempt timestamptz;

ALTER TABLE public.ewaybill_records
  ADD COLUMN IF NOT EXISTS api_request_id text,
  ADD COLUMN IF NOT EXISTS api_response jsonb,
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_attempt timestamptz;

-- No RLS changes: nothing writes these new sync-tracking columns yet (a
-- future API provider would run server-side in an Edge Function using the
-- service role, bypassing RLS same as any other server-side write). Existing
-- policies on all three tables already cover the whole row.

NOTIFY pgrst, 'reload schema';
