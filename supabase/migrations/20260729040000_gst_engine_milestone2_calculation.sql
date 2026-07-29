-- GST Engine — Milestone 2: Calculation Engine
-- Builds on Milestone 1's masters (hsn_master, gst_rates, gst_split_amounts,
-- gst_validate_gstin_checksum). Adds the actual per-line calculator, Reverse
-- Charge / ITC-eligibility product fields, Rule 42/43 ITC reversal formulas,
-- multi-rate invoice aggregation (moving GROUP BY math out of report pages,
-- per "reports must never contain calculation logic"), and a self-contained
-- SQL test harness.

-- =============================================================================
-- 1. Reverse Charge / ITC / taxability — new, distinct concepts not already
--    represented anywhere on products (not a 4th duplicate rate/HSN column).
-- =============================================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reverse_charge_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS itc_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gst_type text NOT NULL DEFAULT 'goods',
  ADD COLUMN IF NOT EXISTS taxability text NOT NULL DEFAULT 'taxable';

DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT products_gst_type_check CHECK (gst_type IN ('goods','service'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT products_taxability_check CHECK (taxability IN ('taxable','exempt','nil_rated','non_gst'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 2. Core line-item calculator — the single function everything downstream
--    (voucher posting in M3, reports in M4, print in M5) calls. It owns GST
--    math only: given a taxable value and rate inputs, return the CGST/SGST/
--    IGST/CESS split. It does NOT own qty*rate*discount pricing math — that
--    stays in invoicing/pricing code, a separate concern from tax calculation.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_calculate_line(
  _taxable_value numeric,
  _seller_gstin text,
  _buyer_gstin text DEFAULT NULL,
  _buyer_place_of_supply_state_code text DEFAULT NULL,
  _hsn_code text DEFAULT NULL,
  _as_of_date date DEFAULT CURRENT_DATE,
  _override_rate numeric DEFAULT NULL,
  _cess_rate numeric DEFAULT 0,
  _is_reverse_charge boolean DEFAULT false
)
RETURNS TABLE(
  rate numeric, cess_rate numeric,
  cgst_rate numeric, sgst_rate numeric, igst_rate numeric,
  cgst_amount numeric, sgst_amount numeric, igst_amount numeric, cess_amount numeric,
  taxable_value numeric, is_interstate boolean, is_reverse_charge boolean
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_rate numeric;
  v_gst_total numeric;
  v_split record;
BEGIN
  v_rate := COALESCE(_override_rate, public.gst_rate_on_date(_hsn_code, _as_of_date), 0);
  v_gst_total := round(_taxable_value * v_rate / 100, 2);

  SELECT * INTO v_split FROM public.gst_split_amounts(_seller_gstin, _buyer_gstin, v_gst_total, _buyer_place_of_supply_state_code);

  RETURN QUERY SELECT
    v_rate,
    _cess_rate,
    CASE WHEN v_split.is_interstate THEN 0 ELSE v_rate / 2 END,
    CASE WHEN v_split.is_interstate THEN 0 ELSE v_rate / 2 END,
    CASE WHEN v_split.is_interstate THEN v_rate ELSE 0 END,
    v_split.cgst,
    v_split.sgst,
    v_split.igst,
    round(_taxable_value * _cess_rate / 100, 2),
    _taxable_value,
    v_split.is_interstate,
    _is_reverse_charge;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_calculate_line(numeric, text, text, text, text, date, numeric, numeric, boolean) TO authenticated;

-- =============================================================================
-- 3. ITC Reversal — Rule 42 (inputs/input services, monthly, turnover-ratio)
--    and Rule 43 (capital goods, spread over a 60-month useful life). Callers
--    supply the attribution figures (T1-T4, turnover) themselves — this is
--    normal: which credit is "common" vs directly attributable is a business
--    judgment call, not something the engine can infer from vouchers alone.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_itc_reversal_rule42(
  _common_credit numeric,
  _exempt_turnover numeric,
  _total_turnover numeric
)
RETURNS TABLE(d1_exempt_attributable numeric, d2_deemed_non_business numeric, total_reversal numeric)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE WHEN _total_turnover > 0 THEN round((_exempt_turnover / _total_turnover) * _common_credit, 2) ELSE 0 END AS d1,
    round(0.05 * _common_credit, 2) AS d2,
    CASE WHEN _total_turnover > 0 THEN round((_exempt_turnover / _total_turnover) * _common_credit, 2) ELSE 0 END + round(0.05 * _common_credit, 2) AS total;
$$;
GRANT EXECUTE ON FUNCTION public.gst_itc_reversal_rule42(numeric, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_itc_reversal_rule43(
  _capital_goods_common_credit numeric,
  _exempt_turnover numeric,
  _total_turnover numeric,
  _useful_life_months int DEFAULT 60
)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _total_turnover > 0 AND _useful_life_months > 0
    THEN round((_capital_goods_common_credit / _useful_life_months) * (_exempt_turnover / _total_turnover), 2)
    ELSE 0 END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_itc_reversal_rule43(numeric, numeric, numeric, int) TO authenticated;

-- =============================================================================
-- 4. Multi-rate invoice aggregation — grouping/summing math moved here so
--    GstSummary.tsx / HsnSummary.tsx / Gstr1.tsx (Milestone 4) call this
--    instead of doing GROUP BY arithmetic in the frontend.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_invoice_tax_summary_sales(_sales_invoice_id uuid)
RETURNS TABLE(gst_pct numeric, taxable_value numeric, cgst numeric, sgst numeric, igst numeric, cess numeric, line_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    sii.gst_pct,
    sum(sii.total - sii.cgst_amount - sii.sgst_amount - sii.igst_amount - sii.cess_amount) AS taxable_value,
    -- NOTE: sales_invoice_items' total-amount column is named "total"
    -- (not "line_total" like purchase_invoice_items) — found live when this
    -- migration first failed applying; corrected here to match.
    sum(sii.cgst_amount), sum(sii.sgst_amount), sum(sii.igst_amount), sum(sii.cess_amount),
    count(*)
  FROM public.sales_invoice_items sii
  WHERE sii.invoice_id = _sales_invoice_id
  GROUP BY sii.gst_pct
  ORDER BY sii.gst_pct;
$$;
GRANT EXECUTE ON FUNCTION public.gst_invoice_tax_summary_sales(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_invoice_tax_summary_purchase(_purchase_invoice_id uuid)
RETURNS TABLE(gst_pct numeric, taxable_value numeric, cgst numeric, sgst numeric, igst numeric, cess numeric, line_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    pii.gst_percent,
    sum(pii.line_total - pii.cgst_amount - pii.sgst_amount - pii.igst_amount - pii.cess_amount) AS taxable_value,
    sum(pii.cgst_amount), sum(pii.sgst_amount), sum(pii.igst_amount), sum(pii.cess_amount),
    count(*)
  FROM public.purchase_invoice_items pii
  WHERE pii.purchase_invoice_id = _purchase_invoice_id
  GROUP BY pii.gst_percent
  ORDER BY pii.gst_percent;
$$;
GRANT EXECUTE ON FUNCTION public.gst_invoice_tax_summary_purchase(uuid) TO authenticated;

-- =============================================================================
-- 5. Unit tests — self-contained: inserts a clearly-marked test HSN/rate row,
--    runs assertions, always deletes the test row (even on failure), and
--    returns one row per test so the caller sees exactly what passed/failed
--    instead of just an exception on the first failure.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_engine_run_tests()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_result record;
BEGIN
  -- Setup: a throwaway HSN with two effective-dated rates, to test rate history.
  DELETE FROM public.gst_rates WHERE hsn_code = 'TEST0001';
  DELETE FROM public.hsn_master WHERE hsn_code = 'TEST0001';
  INSERT INTO public.hsn_master (hsn_code, description) VALUES ('TEST0001', 'GST engine unit-test fixture');
  INSERT INTO public.gst_rates (hsn_code, rate, effective_from, effective_to) VALUES ('TEST0001', 12, '2020-01-01', '2025-12-31');
  INSERT INTO public.gst_rates (hsn_code, rate, effective_from, effective_to) VALUES ('TEST0001', 18, '2026-01-01', NULL);

  BEGIN
    -- Test 1: intra-state split (same state code).
    SELECT * INTO v_result FROM public.gst_split_amounts('10AAAAA0000A1Z5', '10BBBBB1111B2Z6', 1000);
    RETURN QUERY SELECT 'gst_split_amounts: intra-state -> CGST+SGST'::text,
      (v_result.cgst = 500 AND v_result.sgst = 500 AND v_result.igst = 0 AND v_result.is_interstate = false),
      format('cgst=%s sgst=%s igst=%s interstate=%s', v_result.cgst, v_result.sgst, v_result.igst, v_result.is_interstate);

    -- Test 2: inter-state split (different state codes).
    SELECT * INTO v_result FROM public.gst_split_amounts('10AAAAA0000A1Z5', '27BBBBB1111B2Z6', 1000);
    RETURN QUERY SELECT 'gst_split_amounts: inter-state -> IGST'::text,
      (v_result.igst = 1000 AND v_result.cgst = 0 AND v_result.is_interstate = true),
      format('cgst=%s sgst=%s igst=%s interstate=%s', v_result.cgst, v_result.sgst, v_result.igst, v_result.is_interstate);

    -- Test 3: B2C fallback via place_of_supply when buyer GSTIN is null.
    SELECT * INTO v_result FROM public.gst_split_amounts('10AAAAA0000A1Z5', NULL, 1000, '27');
    RETURN QUERY SELECT 'gst_split_amounts: B2C place_of_supply fallback -> IGST'::text,
      (v_result.igst = 1000 AND v_result.is_interstate = true),
      format('cgst=%s sgst=%s igst=%s interstate=%s', v_result.cgst, v_result.sgst, v_result.igst, v_result.is_interstate);

    -- Test 4: GSTIN checksum — known-good vs known-bad.
    RETURN QUERY SELECT 'gst_validate_gstin_checksum: rejects malformed input'::text,
      (public.gst_validate_gstin_checksum('not-a-gstin') = false), 'expected false';

    -- Test 5: effective-dated rate resolves the OLD rate for a date in the old window.
    RETURN QUERY SELECT 'gst_rate_on_date: historical date resolves old rate (12%)'::text,
      (public.gst_rate_on_date('TEST0001', '2024-06-15') = 12), format('got %s', public.gst_rate_on_date('TEST0001', '2024-06-15'));

    -- Test 6: effective-dated rate resolves the NEW rate for a current/future date.
    RETURN QUERY SELECT 'gst_rate_on_date: current date resolves new rate (18%)'::text,
      (public.gst_rate_on_date('TEST0001', '2026-06-15') = 18), format('got %s', public.gst_rate_on_date('TEST0001', '2026-06-15'));

    -- Test 7: gst_calculate_line end-to-end using the rate history above.
    SELECT * INTO v_result FROM public.gst_calculate_line(1000, '10AAAAA0000A1Z5', '10BBBBB1111B2Z6', NULL, 'TEST0001', '2026-06-15');
    RETURN QUERY SELECT 'gst_calculate_line: end-to-end intra-state @18%'::text,
      (v_result.rate = 18 AND v_result.cgst_amount = 90 AND v_result.sgst_amount = 90 AND v_result.igst_amount = 0),
      format('rate=%s cgst=%s sgst=%s igst=%s', v_result.rate, v_result.cgst_amount, v_result.sgst_amount, v_result.igst_amount);

    -- Test 8: Rule 42 formula against a hand-computed example
    -- (common credit 10000, exempt turnover 200000 of total 1000000 -> D1=2000, D2=500, total=2500).
    SELECT * INTO v_result FROM public.gst_itc_reversal_rule42(10000, 200000, 1000000);
    RETURN QUERY SELECT 'gst_itc_reversal_rule42: matches hand-computed example'::text,
      (v_result.total_reversal = 2500),
      format('d1=%s d2=%s total=%s', v_result.d1_exempt_attributable, v_result.d2_deemed_non_business, v_result.total_reversal);

    -- Test 9: Rule 43 formula (capital goods credit 60000 over 60 months = 1000/month,
    -- exempt ratio 20000/500000 = 4% -> 40).
    RETURN QUERY SELECT 'gst_itc_reversal_rule43: matches hand-computed example'::text,
      (public.gst_itc_reversal_rule43(60000, 20000, 500000, 60) = 40),
      format('got %s', public.gst_itc_reversal_rule43(60000, 20000, 500000, 60));

  EXCEPTION WHEN OTHERS THEN
    -- Ensure test fixtures are cleaned up even if an assertion itself errors.
    DELETE FROM public.gst_rates WHERE hsn_code = 'TEST0001';
    DELETE FROM public.hsn_master WHERE hsn_code = 'TEST0001';
    RAISE;
  END;

  -- Cleanup on the success path.
  DELETE FROM public.gst_rates WHERE hsn_code = 'TEST0001';
  DELETE FROM public.hsn_master WHERE hsn_code = 'TEST0001';
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_engine_run_tests() TO authenticated;

NOTIFY pgrst, 'reload schema';
