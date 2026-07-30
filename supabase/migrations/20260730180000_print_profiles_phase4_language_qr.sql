-- Print Engine Phase 4: bilingual labels, QR code, and thermal layout.
-- Thermal layout needs no new column — it is derived at read time from the
-- existing page_size ("Thermal_80mm" / "Thermal_58mm").

ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'hi'));
ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS show_qr_code boolean NOT NULL DEFAULT false;
