-- Phase 4 (partial), Tally-style voucher lifecycle redesign.
-- Purpose: fix the GST cancelled-invoice leak (original spec item 9). Today:
--   - gst_report_register/_hsn_summary/_reconciliation_invoice_vs_voucher/
--     _dashboard_summary filter sales rows only on `COALESCE(is_deleted,false)`
--     -- a column nothing ever writes -- and never on status='cancelled', so a
--     cancelled sales invoice still appears in GSTR-1/HSN summary/dashboard.
--   - The purchase side of every one of those has NO filter at all (purchase_
--     invoices has no is_deleted column), so a cancelled purchase invoice
--     leaks into every purchase-side GST report unconditionally.
--   - gst_report_note_register (Credit/Debit Note Register) has no lifecycle
--     filter on either side either.
--
-- Fix: replace/add a join against vw_document_lifecycle_min (Phase 0's SSOT)
-- requiring lifecycle_status='posted', which correctly subsumes the old
-- is_deleted check (draft/cancelled/is_deleted all collapse into "not
-- posted") and closes the purchase-side gap that had no filter at all.
--
-- Explicitly OUT of scope here (do not touch): e-Invoice/e-Way Bill IRN
-- records and any external compliance-document restriction -- those are
-- governed by their own government-facing rules, not the internal lifecycle
-- view, and gst_report_note_register's issuance logic for those is untouched.
-- Only the read-side filtering changes; no data is modified.

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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'sales_invoice' AND dl.doc_id = si.id AND dl.lifecycle_status = 'posted'
    WHERE si.business_id = _business_id
      AND si.invoice_date BETWEEN _from_date AND _to_date
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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'purchase_invoice' AND dl.doc_id = pi.id AND dl.lifecycle_status = 'posted'
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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'sales_invoice' AND dl.doc_id = si.id AND dl.lifecycle_status = 'posted'
    WHERE si.business_id = _business_id AND si.invoice_date BETWEEN _from_date AND _to_date
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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'purchase_invoice' AND dl.doc_id = pi.id AND dl.lifecycle_status = 'posted'
    WHERE pi.business_id = _business_id AND pi.invoice_date BETWEEN _from_date AND _to_date
    GROUP BY COALESCE(pii.hsn, 'UNSPECIFIED')
    ORDER BY 1;
  ELSE
    RAISE EXCEPTION 'Invalid direction: % (expected sales or purchase)', _direction;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_report_hsn_summary(uuid, text, date, date) TO authenticated;

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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'sales_return' AND dl.doc_id = sr.id AND dl.lifecycle_status = 'posted'
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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'purchase_return' AND dl.doc_id = pr.id AND dl.lifecycle_status = 'posted'
    WHERE pr.business_id = _business_id AND pr.return_date BETWEEN _from_date AND _to_date
    ORDER BY pr.return_date, pr.return_number;
  ELSE
    RAISE EXCEPTION 'Invalid note_type: % (expected credit_note or debit_note)', _note_type;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_report_note_register(uuid, text, date, date) TO authenticated;

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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'sales_invoice' AND dl.doc_id = si.id AND dl.lifecycle_status = 'posted'
    WHERE si.business_id = _business_id AND si.invoice_date BETWEEN _from_date AND _to_date
      AND COALESCE(si.gst_total, 0) > 0
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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'purchase_invoice' AND dl.doc_id = pi.id AND dl.lifecycle_status = 'posted'
    WHERE pi.business_id = _business_id AND pi.invoice_date BETWEEN _from_date AND _to_date
      AND COALESCE(pi.gst_total, 0) > 0
    ORDER BY pi.invoice_date, pi.invoice_number;
  ELSE
    RAISE EXCEPTION 'Invalid direction: % (expected sales or purchase)', _direction;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_reconciliation_invoice_vs_voucher(uuid, text, date, date) TO authenticated;

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
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'sales_invoice' AND dl.doc_id = si.id AND dl.lifecycle_status = 'posted'
    WHERE si.business_id = _business_id AND si.invoice_date BETWEEN _from_date AND _to_date
  ),
  in_tax AS (
    SELECT
      COALESCE(sum(pii.cgst_amount), 0) AS cgst, COALESCE(sum(pii.sgst_amount), 0) AS sgst, COALESCE(sum(pii.igst_amount), 0) AS igst
    FROM public.purchase_invoice_items pii
    JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id
    JOIN public.vw_document_lifecycle_min dl ON dl.doc_type = 'purchase_invoice' AND dl.doc_id = pi.id AND dl.lifecycle_status = 'posted'
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
