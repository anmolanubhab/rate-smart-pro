-- GST calculation consistency audit (2026-08-23), Part B: missing GSTIN/
-- state must never silently become intrastate for a NEW transaction.
--
-- gst_is_interstate()/gst_split_amounts() already accept an optional
-- _buyer_place_of_supply_state_code fallback but have no equivalent
-- fallback for the SELLER side, and both businesses.state_code and
-- parties.state_code already exist as master-data columns that were never
-- wired in anywhere. This:
--   1. Adds a symmetric _seller_state_code fallback (intended to be
--      backward compatible via a trailing DEFAULT -- turned out NOT to be:
--      see 20260823070145_drop_stale_gst_function_overloads.sql, which
--      fixes the overload-ambiguity this migration accidentally created).
--   2. Adds gst_state_resolution_status(), a small read-only function the
--      frontend calls BEFORE posting a GST-bearing transaction to detect
--      "state genuinely unknown" and block with a clear message, instead of
--      finding out only after gst_is_interstate() silently returned false.
-- Existing posted invoices are never touched -- this only changes what a
-- NEW resolveIsInterstate()/gst_split_amounts() call sees, and adds a new
-- opt-in check the app calls explicitly before creating a new document.

CREATE OR REPLACE FUNCTION public.gst_is_interstate(
  _seller_gstin text,
  _buyer_gstin text,
  _buyer_place_of_supply_state_code text DEFAULT NULL,
  _seller_state_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    COALESCE(public.gst_state_code_from_gstin(_seller_gstin), _seller_state_code) IS NOT NULL
    AND COALESCE(public.gst_state_code_from_gstin(_buyer_gstin), _buyer_place_of_supply_state_code) IS NOT NULL
    AND COALESCE(public.gst_state_code_from_gstin(_seller_gstin), _seller_state_code)
        <> COALESCE(public.gst_state_code_from_gstin(_buyer_gstin), _buyer_place_of_supply_state_code)
  );
$$;
GRANT EXECUTE ON FUNCTION public.gst_is_interstate(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_split_amounts(
  _seller_gstin text,
  _buyer_gstin text,
  _gst_total numeric,
  _buyer_place_of_supply_state_code text DEFAULT NULL,
  _seller_state_code text DEFAULT NULL
)
RETURNS TABLE(cgst numeric, sgst numeric, igst numeric, is_interstate boolean)
LANGUAGE sql IMMUTABLE AS $$
  WITH codes AS (
    SELECT
      COALESCE(public.gst_state_code_from_gstin(_seller_gstin), _seller_state_code) AS seller_state,
      COALESCE(public.gst_state_code_from_gstin(_buyer_gstin), _buyer_place_of_supply_state_code) AS buyer_state
  ),
  decision AS (
    SELECT (seller_state IS NOT NULL AND buyer_state IS NOT NULL AND seller_state <> buyer_state) AS interstate
    FROM codes
  )
  SELECT s.cgst, s.sgst, s.igst, d.interstate AS is_interstate
  FROM decision d
  CROSS JOIN LATERAL public.gst_split_by_flag(_gst_total, d.interstate) s;
$$;

-- Explicit "can we actually resolve both states" check -- gst_is_interstate
-- collapses "genuinely intrastate" and "state unknown" into the same
-- `false`, which is correct for its own purpose (a safe default for the
-- split) but wrong for validation. This exposes the distinction.
CREATE OR REPLACE FUNCTION public.gst_state_resolution_status(
  _seller_gstin text,
  _seller_state_code text,
  _buyer_gstin text,
  _buyer_state_code text
)
RETURNS TABLE(seller_state text, buyer_state text, is_resolved boolean, is_interstate boolean)
LANGUAGE sql IMMUTABLE AS $$
  WITH codes AS (
    SELECT
      COALESCE(public.gst_state_code_from_gstin(_seller_gstin), _seller_state_code) AS seller_state,
      COALESCE(public.gst_state_code_from_gstin(_buyer_gstin), _buyer_state_code) AS buyer_state
  )
  SELECT
    c.seller_state,
    c.buyer_state,
    (c.seller_state IS NOT NULL AND c.buyer_state IS NOT NULL) AS is_resolved,
    (c.seller_state IS NOT NULL AND c.buyer_state IS NOT NULL AND c.seller_state <> c.buyer_state) AS is_interstate
  FROM codes c;
$$;
GRANT EXECUTE ON FUNCTION public.gst_state_resolution_status(text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
