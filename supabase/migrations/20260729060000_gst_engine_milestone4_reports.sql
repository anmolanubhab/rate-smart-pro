-- GST Engine — Milestone 4: Reporting Engine
--
-- The master spec names 35+ reports (GST Summary, Tax Liability Register,
-- Input/Output Tax Register, B2B/B2C Sales, State-wise Sales/Purchase,
-- Credit/Debit Note Register, GST Mismatch Report, ...). Building each as a
-- separate near-duplicate query would violate "never duplicate business
-- logic". Instead: a small number of flexible, parametrized functions that
-- cover that list through their filter arguments — one register function
-- for Sales/Purchase/B2B/B2C/State-wise/Tax-Liability views, one HSN
-- summary, one note register, one reconciliation check, one dashboard
-- summary. All calculation lives here; report pages only render results
-- (Milestone 4's frontend wiring is a follow-up — this migration ships the
-- engine + proves it against real data).

-- =============================================================================
-- 1. Sales/Purchase Register — the core report. Covers: Sales Register,
--    Purchase Register, B2B Sales, B2C Sales, State-wise Sales/Purchase,
--    Output Tax Register, Input Tax Register — all the same underlying
--    query, sliced by _direction and the caller's own WHERE-style filtering
--    on the returned is_b2b/place_of_supply columns.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_report_register(
  _business_id uuid,
  _direction text,
  _from_date date,
  _to_date date
)
RETURNS TABLE(
  invoice_id uuid,
  document_number text,
  document_date date,
  party_name text,
  party_gstin text,
  place_of_supply text,
  is_b2b boolean,
  taxable_value numeric,
  cgst numeric, sgst numeric, igst numeric, cess numeric,
  total_value numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF _direction = 'sales' THEN
    RETURN QUERY
    SELECT
      si.id, si.invoice_number, si.invoice_date, p.name, p.gst,
      COALESCE(si.place_of_supply, p.state_code),
      (p.gst IS NOT NULL),
      COALESCE(sum(sii.total - sii.cgst_amount - sii.sgst_amount - sii.igst_amount - sii.cess_amount), 0),
      COALESCE(sum(sii.cgst_amount), 0), COALESCE(sum(sii.sgst_amount), 0),
      COALESCE(sum(sii.igst_amount), 0), COALESCE(sum(sii.cess_amount), 0),
      si.grand_total
    FROM public.sales_invoices si
    LEFT JOIN public.parties p ON p.id = si.party_id
    LEFT JOIN public.sales_invoice_items sii ON sii.invoice_id = si.id
    WHERE si.business_id = _business_id
      AND si.invoice_date BETWEEN _from_date AND _to_date
      AND COALESCE(si.is_deleted, false) = false
    GROUP BY si.id, si.invoice_number, si.invoice_date, p.name, p.gst, si.place_of_supply, p.state_code, si.grand_total
    ORDER BY si.invoice_date, si.invoice_number;

  ELSIF _direction = 'purchase' THEN
    RETURN QUERY
    SELECT
      pi.id, pi.invoice_number, pi.invoice_date, p.name, p.gst,
      p.state_code,
      (p.gst IS NOT NULL),
      COALESCE(sum(pii.line_total - pii.cgst_amount - pii.sgst_amount - pii.igst_amount - pii.cess_amount), 0),
      COALESCE(sum(pii.cgst_amount), 0), COALESCE(sum(pii.sgst_amount), 0),
      COALESCE(sum(pii.igst_amount), 0), COALESCE(sum(pii.cess_amount), 0),
      pi.grand_total
    FROM public.purchase_invoices pi
    LEFT JOIN public.parties p ON p.id = pi.supplier_id
    LEFT JOIN public.purchase_invoice_items pii ON pii.purchase_invoice_id = pi.id
    WHERE pi.business_id = _business_id
      AND pi.invoice_date BETWEEN _from_date AND _to_date
    GROUP BY pi.id, pi.invoice_number, pi.invoice_date, p.name, p.gst, p.state_code, pi.grand_total
    ORDER BY pi.invoice_date, pi.invoice_number;
  ELSE
    RAISE EXCEPTION 'Invalid direction: % (expected sales or purchase)', _direction;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_report_register(uuid, text, date, date) TO authenticated;

-- =============================================================================
-- 2. HSN Summary — combined sales+purchase, per HSN. Covers HSN Summary,
--    HSN Detailed, SAC Summary (SAC is just a service HSN in this schema).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_report_hsn_summary(
  _business_id uuid,
  _direction text,
  _from_date date,
  _to_date date
)
RETURNS TABLE(
  hsn text, total_qty numeric, taxable_value numeric,
  cgst numeric, sgst numeric, igst numeric, cess numeric, total_value numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF _direction = 'sales' THEN
    RETURN QUERY
    SELECT
      COALESCE(sii.hsn, 'UNSPECIFIED'), sum(sii.qty),
      sum(sii.total - sii.cgst_amount - sii.sgst_amount - sii.igst_amount - sii.cess_amount),
      sum(sii.cgst_amount), sum(sii.sgst_amount), sum(sii.igst_amount), sum(sii.cess_amount), sum(sii.total)
    FROM public.sales_invoice_items sii
    JOIN public.sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = _business_id AND si.invoice_date BETWEEN _from_date AND _to_date
      AND COALESCE(si.is_deleted, false) = false
    GROUP BY COALESCE(sii.hsn, 'UNSPECIFIED')
    ORDER BY 1;
  ELSIF _direction = 'purchase' THEN
    RETURN QUERY
    SELECT
      COALESCE(pii.hsn, 'UNSPECIFIED'), sum(pii.quantity),
      sum(pii.line_total - pii.cgst_amount - pii.sgst_amount - pii.igst_amount - pii.cess_amount),
      sum(pii.cgst_amount), sum(pii.sgst_amount), sum(pii.igst_amount), sum(pii.cess_amount), sum(pii.line_total)
    FROM public.purchase_invoice_items pii
    JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id
    WHERE pi.business_id = _business_id AND pi.invoice_date BETWEEN _from_date AND _to_date
    GROUP BY COALESCE(pii.hsn, 'UNSPECIFIED')
    ORDER BY 1;
  ELSE
    RAISE EXCEPTION 'Invalid direction: % (expected sales or purchase)', _direction;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_report_hsn_summary(uuid, text, date, date) TO authenticated;

-- =============================================================================
-- 3. Credit / Debit Note Register.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_report_note_register(
  _business_id uuid,
  _note_type text,
  _from_date date,
  _to_date date
)
RETURNS TABLE(
  note_number text, note_date date, against_document text, party_name text,
  taxable_value numeric, gst_amount numeric, total_value numeric, reason text, source text
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF _note_type = 'credit_note' THEN
    RETURN QUERY
    SELECT sr.return_number, sr.return_date, si.invoice_number, p.name,
           sr.taxable_amount, sr.gst_amount, sr.total_amount, sr.reason, 'sales_return'::text
    FROM public.sales_returns sr
    LEFT JOIN public.sales_invoices si ON si.id = sr.sales_invoice_id
    LEFT JOIN public.parties p ON p.id = sr.party_id
    WHERE sr.business_id = _business_id AND sr.return_date BETWEEN _from_date AND _to_date
    ORDER BY sr.return_date, sr.return_number;
  ELSIF _note_type = 'debit_note' THEN
    RETURN QUERY
    SELECT pr.return_number, pr.return_date, pi.invoice_number, p.name,
           pr.taxable_amount, pr.gst_amount, pr.total_amount, pr.reason,
           COALESCE(pr.source, 'manual')
    FROM public.purchase_returns pr
    LEFT JOIN public.purchase_invoices pi ON pi.id = pr.purchase_invoice_id
    LEFT JOIN public.parties p ON p.id = pr.supplier_id
    WHERE pr.business_id = _business_id AND pr.return_date BETWEEN _from_date AND _to_date
    ORDER BY pr.return_date, pr.return_number;
  ELSE
    RAISE EXCEPTION 'Invalid note_type: % (expected credit_note or debit_note)', _note_type;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_report_note_register(uuid, text, date, date) TO authenticated;

-- =============================================================================
-- 4. Reconciliation — compares each invoice's own GST total (the "register")
--    against what actually landed in GST ledger accounts via its linked
--    voucher (the "books"). A genuine "GST Mismatch Report": catches cases
--    like this session's very first purchase invoice, which posted to the
--    old flat "GST Input" ledger rather than split CGST/SGST — the register
--    total still matches (both add up to the same number), so an
--    aggregate-only check wouldn't catch it, but per-invoice reconciliation
--    exists precisely so a business can still audit whether the *right*
--    ledger heads were used, not just the right total.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_reconciliation_invoice_vs_voucher(
  _business_id uuid,
  _direction text,
  _from_date date,
  _to_date date
)
RETURNS TABLE(
  invoice_number text, invoice_date date, register_gst numeric, voucher_gst numeric,
  difference numeric, uses_split_ledgers boolean, status text
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_gst_ledger_names text[];
BEGIN
  IF _direction = 'sales' THEN
    v_gst_ledger_names := ARRAY['CGST Output','SGST Output','IGST Output','GST Output'];
    RETURN QUERY
    SELECT
      si.invoice_number, si.invoice_date, COALESCE(si.gst_total, 0),
      COALESCE((SELECT sum(vi.cr_amount) FROM public.voucher_items vi
                JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
                WHERE vi.voucher_id = si.voucher_id AND la.name = ANY(v_gst_ledger_names)), 0),
      COALESCE(si.gst_total, 0) - COALESCE((SELECT sum(vi.cr_amount) FROM public.voucher_items vi
                JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
                WHERE vi.voucher_id = si.voucher_id AND la.name = ANY(v_gst_ledger_names)), 0),
      EXISTS (SELECT 1 FROM public.voucher_items vi JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
              WHERE vi.voucher_id = si.voucher_id AND la.name IN ('CGST Output','SGST Output','IGST Output')),
      CASE
        WHEN si.voucher_id IS NULL THEN 'no_voucher'
        WHEN abs(COALESCE(si.gst_total, 0) - COALESCE((SELECT sum(vi.cr_amount) FROM public.voucher_items vi
                JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
                WHERE vi.voucher_id = si.voucher_id AND la.name = ANY(v_gst_ledger_names)), 0)) < 0.01 THEN 'matched'
        ELSE 'mismatch'
      END
    FROM public.sales_invoices si
    WHERE si.business_id = _business_id AND si.invoice_date BETWEEN _from_date AND _to_date
      AND COALESCE(si.is_deleted, false) = false AND COALESCE(si.gst_total, 0) > 0
    ORDER BY si.invoice_date, si.invoice_number;

  ELSIF _direction = 'purchase' THEN
    v_gst_ledger_names := ARRAY['CGST Input','SGST Input','IGST Input','GST Input'];
    RETURN QUERY
    SELECT
      pi.invoice_number, pi.invoice_date, COALESCE(pi.gst_total, 0),
      COALESCE((SELECT sum(vi.dr_amount) FROM public.voucher_items vi
                JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
                WHERE vi.voucher_id = pi.voucher_id AND la.name = ANY(v_gst_ledger_names)), 0),
      COALESCE(pi.gst_total, 0) - COALESCE((SELECT sum(vi.dr_amount) FROM public.voucher_items vi
                JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
                WHERE vi.voucher_id = pi.voucher_id AND la.name = ANY(v_gst_ledger_names)), 0),
      EXISTS (SELECT 1 FROM public.voucher_items vi JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
              WHERE vi.voucher_id = pi.voucher_id AND la.name IN ('CGST Input','SGST Input','IGST Input')),
      CASE
        WHEN pi.voucher_id IS NULL THEN 'no_voucher'
        WHEN abs(COALESCE(pi.gst_total, 0) - COALESCE((SELECT sum(vi.dr_amount) FROM public.voucher_items vi
                JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
                WHERE vi.voucher_id = pi.voucher_id AND la.name = ANY(v_gst_ledger_names)), 0)) < 0.01 THEN 'matched'
        ELSE 'mismatch'
      END
    FROM public.purchase_invoices pi
    WHERE pi.business_id = _business_id AND pi.invoice_date BETWEEN _from_date AND _to_date
      AND COALESCE(pi.gst_total, 0) > 0
    ORDER BY pi.invoice_date, pi.invoice_number;
  ELSE
    RAISE EXCEPTION 'Invalid direction: % (expected sales or purchase)', _direction;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_reconciliation_invoice_vs_voucher(uuid, text, date, date) TO authenticated;

-- =============================================================================
-- 5. GST Compliance Dashboard — period liability, ITC available, net payable.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_dashboard_summary(_business_id uuid, _from_date date, _to_date date)
RETURNS TABLE(
  output_cgst numeric, output_sgst numeric, output_igst numeric, total_output_tax numeric,
  input_cgst numeric, input_sgst numeric, input_igst numeric, total_input_tax numeric,
  net_payable numeric
)
LANGUAGE sql STABLE AS $$
  WITH out_tax AS (
    SELECT
      COALESCE(sum(sii.cgst_amount), 0) AS cgst, COALESCE(sum(sii.sgst_amount), 0) AS sgst, COALESCE(sum(sii.igst_amount), 0) AS igst
    FROM public.sales_invoice_items sii
    JOIN public.sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = _business_id AND si.invoice_date BETWEEN _from_date AND _to_date
      AND COALESCE(si.is_deleted, false) = false
  ),
  in_tax AS (
    SELECT
      COALESCE(sum(pii.cgst_amount), 0) AS cgst, COALESCE(sum(pii.sgst_amount), 0) AS sgst, COALESCE(sum(pii.igst_amount), 0) AS igst
    FROM public.purchase_invoice_items pii
    JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id
    WHERE pi.business_id = _business_id AND pi.invoice_date BETWEEN _from_date AND _to_date
  )
  SELECT
    out_tax.cgst, out_tax.sgst, out_tax.igst, (out_tax.cgst + out_tax.sgst + out_tax.igst),
    in_tax.cgst, in_tax.sgst, in_tax.igst, (in_tax.cgst + in_tax.sgst + in_tax.igst),
    (out_tax.cgst + out_tax.sgst + out_tax.igst) - (in_tax.cgst + in_tax.sgst + in_tax.igst)
  FROM out_tax, in_tax;
$$;
GRANT EXECUTE ON FUNCTION public.gst_dashboard_summary(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
