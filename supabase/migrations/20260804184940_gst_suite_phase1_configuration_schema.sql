-- GST Compliance Suite — Phase 1: GST Configuration
-- accounting_settings gains the e-Invoice/e-Way Bill enable flags and a
-- default return-filing-frequency preference, following the exact pattern
-- already used for lock_date/financial_note_*/require_hsn_on_invoice (one
-- row per business, same isMissingTable-guarded fetch/set functions in
-- src/lib/accountingLock.ts).
ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS enable_einvoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ewaybill boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_return_frequency text NOT NULL DEFAULT 'monthly';

DO $$ BEGIN
  ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_gst_return_frequency_check
    CHECK (gst_return_frequency IN ('monthly', 'quarterly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- business_gst_registrations becomes the source of truth for GSTIN
-- (GST Compliance Suite decision #2) — this trigger keeps the legacy
-- businesses.gst_number column in sync automatically so every existing
-- reader (GST reports, e-Invoice/e-Way payload generation, GstFiling's
-- seller-GSTIN lookups) keeps working unchanged without being migrated.
-- Fires regardless of write path (app code or direct SQL), unlike an
-- app-level sync which only helps if every caller remembers to do it.
CREATE OR REPLACE FUNCTION public.sync_primary_gstin_to_business()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.businesses SET gst_number = NEW.gstin WHERE id = NEW.business_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_gstin ON public.business_gst_registrations;
CREATE TRIGGER trg_sync_primary_gstin AFTER INSERT OR UPDATE ON public.business_gst_registrations
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_gstin_to_business();

NOTIFY pgrst, 'reload schema';
