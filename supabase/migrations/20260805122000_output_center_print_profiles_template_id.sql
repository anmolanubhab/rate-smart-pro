-- Universal Document Output Center, Phase 1 / Locked Decision #14: company-
-- wise template selection. One additive column on the existing print_profiles
-- table (template choice is a per-(business, document_type) attribute exactly
-- like page_size already is — no new table needed). Reserved ids
-- ('modern','gst_standard','custom') are allowed now so shipping them later
-- needs zero migration, only a new LayoutTemplateRegistry entry.

ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS template_id text NOT NULL DEFAULT 'classic'
  CHECK (template_id IN ('classic', 'thermal', 'modern', 'gst_standard', 'custom'));

-- Backfill: today thermal-ness is 100% derived from page_size (see
-- profileToPrintConfig's layoutMode derivation) — preserve that as the
-- initial template_id so existing thermal profiles keep rendering thermal.
UPDATE public.print_profiles SET template_id = 'thermal'
  WHERE page_size LIKE 'Thermal_%' AND template_id = 'classic';

NOTIFY pgrst, 'reload schema';
