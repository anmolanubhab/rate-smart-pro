-- GST Module Production Audit — Blocker 1: Composition Scheme was inert.
--
-- Root cause: business_gst_registrations.registration_type already exists
-- as the correct, constrained (regular/composition/casual/sez/export_only/
-- unregistered), business-scoped, RLS-protected source of truth for a
-- business's GST registration type -- it's set via the "Company GST
-- Details" section of /gst/configuration. But nothing ever read it: every
-- sales/purchase invoice calculation and every GST report treated every
-- business as if it were "regular", regardless of what registration_type
-- said. A separate, redundant, ALSO-unused businesses.composition_scheme
-- boolean exists too (set by the Business Setup/Edit wizards) -- confirmed
-- via full-codebase and full-schema grep that neither field was consulted
-- by any calculation.
--
-- Fix direction chosen (per audit instructions): RD-Pro's accounting
-- architecture has no composition-specific tax treatment (flat levy on
-- turnover, no ITC, Bill of Supply instead of Tax Invoice, CMP-08 instead
-- of GSTR-1/3B) -- building that correctly is out of scope for this pass.
-- So instead of letting the app silently apply regular-scheme GST math to
-- a business that declared itself non-regular, this migration adds a
-- single DB-side lookup (gst_business_registration_type) that the
-- frontend now uses to explicitly BLOCK sales invoice generation and the
-- GSTR-1/3B-style reports for any non-"regular" registration, with a
-- clear message, rather than compute wrong numbers.
--
-- No new duplicate field introduced: business_gst_registrations.
-- registration_type remains the sole source of truth. The legacy
-- businesses.composition_scheme/gst_enabled/default_gst_pct columns are
-- left in place (still written by the Business wizards, still unused by
-- calculation) -- dropping them is a separate, larger change touching
-- BusinessWizard.tsx/EditCompanyWizard.tsx UI, out of scope for a
-- backward-safe migration.

CREATE OR REPLACE FUNCTION public.gst_business_registration_type(_business_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- Primary registration, matched to the point in time so switching a
  -- business's scheme in Settings never rewrites the type an already-posted
  -- historical invoice was created under (callers pass the invoice date,
  -- not "now"). Falls back to 'regular' when no registration row exists at
  -- all -- preserves current behaviour for the common case of a business
  -- that hasn't configured a formal GST registration yet.
  SELECT COALESCE(
    (
      SELECT registration_type
      FROM public.business_gst_registrations
      WHERE business_id = _business_id
        AND is_primary = true
        AND valid_from <= _as_of
        AND (valid_to IS NULL OR valid_to >= _as_of)
      LIMIT 1
    ),
    (
      SELECT registration_type
      FROM public.business_gst_registrations
      WHERE business_id = _business_id
        AND is_primary = true
      ORDER BY valid_from DESC
      LIMIT 1
    ),
    'regular'
  );
$function$;

REVOKE ALL ON FUNCTION public.gst_business_registration_type(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gst_business_registration_type(uuid, date) TO authenticated;
