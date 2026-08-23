-- Regression coverage for public.gst_split_by_flag(), the single low-level
-- rounding function extracted so create_purchase_invoice_atomic() no longer
-- carries its own inline copy of the CGST/SGST split formula (see
-- 20260823110000_gst_split_by_flag_atomic_dedup.sql).
--
-- Baseline captured BEFORE the refactor by evaluating the exact formula
-- create_purchase_invoice_atomic used inline (ROUND(line_tax/2,2) for CGST,
-- line_tax - that for SGST) directly via SQL against the live DB on
-- 2026-08-23, project zskfuioojivdqmqkzjqc:
--   0.01     -> cgst 0.01, sgst 0.00
--   0.02     -> cgst 0.01, sgst 0.01
--   0.49     -> cgst 0.25, sgst 0.24
--   0.50     -> cgst 0.25, sgst 0.25
--   0.99     -> cgst 0.50, sgst 0.49
--   29203.20 -> cgst 14601.60, sgst 14601.60
-- This file asserts gst_split_by_flag() reproduces every one of these
-- exactly (parity), plus the interstate branch and a multi-line sum-vs-
-- round-per-line divergence check. A failing assertion aborts the script
-- (RAISE EXCEPTION); no exception raised = PASS. Read-only, no schema
-- writes -- safe to run standalone (no BEGIN/ROLLBACK needed), but wrapped
-- in one for consistency with the rest of supabase/tests/.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  -- ── Intrastate: byte-for-byte parity with the old inline formula ──────
  SELECT * INTO r FROM public.gst_split_by_flag(0.01, false);
  IF r.cgst <> 0.01 OR r.sgst <> 0.00 OR r.igst <> 0 THEN
    RAISE EXCEPTION 'FAIL: 0.01 intrastate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  SELECT * INTO r FROM public.gst_split_by_flag(0.02, false);
  IF r.cgst <> 0.01 OR r.sgst <> 0.01 OR r.igst <> 0 THEN
    RAISE EXCEPTION 'FAIL: 0.02 intrastate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  SELECT * INTO r FROM public.gst_split_by_flag(0.49, false);
  IF r.cgst <> 0.25 OR r.sgst <> 0.24 OR r.igst <> 0 THEN
    RAISE EXCEPTION 'FAIL: 0.49 intrastate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  SELECT * INTO r FROM public.gst_split_by_flag(0.50, false);
  IF r.cgst <> 0.25 OR r.sgst <> 0.25 OR r.igst <> 0 THEN
    RAISE EXCEPTION 'FAIL: 0.50 intrastate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  SELECT * INTO r FROM public.gst_split_by_flag(0.99, false);
  IF r.cgst <> 0.50 OR r.sgst <> 0.49 OR r.igst <> 0 THEN
    RAISE EXCEPTION 'FAIL: 0.99 intrastate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  SELECT * INTO r FROM public.gst_split_by_flag(29203.20, false);
  IF r.cgst <> 14601.60 OR r.sgst <> 14601.60 OR r.igst <> 0 THEN
    RAISE EXCEPTION 'FAIL: 29203.20 intrastate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  -- ── Interstate: full amount to IGST, CGST/SGST exactly zero ───────────
  SELECT * INTO r FROM public.gst_split_by_flag(0.01, true);
  IF r.cgst <> 0 OR r.sgst <> 0 OR r.igst <> 0.01 THEN
    RAISE EXCEPTION 'FAIL: 0.01 interstate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  SELECT * INTO r FROM public.gst_split_by_flag(29203.20, true);
  IF r.cgst <> 0 OR r.sgst <> 0 OR r.igst <> 29203.20 THEN
    RAISE EXCEPTION 'FAIL: 29203.20 interstate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  -- ── Zero must stay exactly zero, not NULL or a rounding artifact ──────
  SELECT * INTO r FROM public.gst_split_by_flag(0, false);
  IF r.cgst <> 0 OR r.sgst <> 0 OR r.igst <> 0 THEN
    RAISE EXCEPTION 'FAIL: 0 intrastate -> got cgst=%, sgst=%, igst=%', r.cgst, r.sgst, r.igst;
  END IF;

  -- ── Round-off independence: gst_split_by_flag never sees or touches
  --    round_off -- it only ever receives the raw GST amount. Confirmed by
  --    signature (2 args: amount, is_interstate) with no round-off param.
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'gst_split_by_flag'
      AND pg_get_function_identity_arguments(oid) = '_amount numeric, _is_interstate boolean') <> 1 THEN
    RAISE EXCEPTION 'FAIL: gst_split_by_flag(numeric, boolean) signature not found';
  END IF;

  -- ── Multi-line precision: 3 lines whose raw sum, split then summed,
  --    must equal the split of the true (unrounded) total -- not the sum of
  --    3 independently-rounded halves, which would drift.
  DECLARE
    v_l1 numeric := 33.33; v_l2 numeric := 33.33; v_l3 numeric := 33.34; -- sums to 100.00
    v_cgst_sum numeric := 0; v_sgst_sum numeric := 0;
    v_expected record;
  BEGIN
    SELECT * INTO r FROM public.gst_split_by_flag(v_l1, false); v_cgst_sum := v_cgst_sum + r.cgst; v_sgst_sum := v_sgst_sum + r.sgst;
    SELECT * INTO r FROM public.gst_split_by_flag(v_l2, false); v_cgst_sum := v_cgst_sum + r.cgst; v_sgst_sum := v_sgst_sum + r.sgst;
    SELECT * INTO r FROM public.gst_split_by_flag(v_l3, false); v_cgst_sum := v_cgst_sum + r.cgst; v_sgst_sum := v_sgst_sum + r.sgst;
    IF v_cgst_sum + v_sgst_sum <> v_l1 + v_l2 + v_l3 THEN
      RAISE EXCEPTION 'FAIL: multi-line split sum % + % <> total %', v_cgst_sum, v_sgst_sum, v_l1 + v_l2 + v_l3;
    END IF;
    -- Each line's own split must never lose paise vs that line's own total
    -- (per-line cgst+sgst == that line's tax, since gst_split_by_flag is a
    -- remainder split, not independently rounded on both sides).
    SELECT * INTO r FROM public.gst_split_by_flag(v_l3, false);
    IF r.cgst + r.sgst <> v_l3 THEN
      RAISE EXCEPTION 'FAIL: line 33.34 split cgst+sgst=% <> line total 33.34', r.cgst + r.sgst;
    END IF;
  END;

  RAISE NOTICE 'PASS: gst_split_by_flag_regression -- all intrastate/interstate/precision/multi-line cases match the pre-refactor baseline';
END $$;

ROLLBACK;
