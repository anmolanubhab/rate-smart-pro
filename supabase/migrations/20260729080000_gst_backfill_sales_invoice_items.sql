-- Repairs the real data damage caused by the bug just fixed in
-- src/lib/salesInvoices.ts: generateInvoiceFromDispatch and
-- generateInvoiceFromOrder never wrote cgst/sgst/igst amounts, so every
-- sales invoice created before this fix has gst_pct > 0 but all three tax
-- columns at 0. This recomputes those columns in place for the affected
-- rows only (gst_pct > 0 and all three amounts still 0), using the same
-- gst_is_interstate() decision the fixed frontend code now uses.
DO $$
DECLARE
  r RECORD;
  _is_interstate boolean;
  _line_gst numeric;
  _half numeric;
BEGIN
  FOR r IN
    SELECT sii.id, sii.net_rate, sii.qty, sii.gst_pct,
           b.gst_number AS seller_gstin, p.gst AS buyer_gstin
    FROM public.sales_invoice_items sii
    JOIN public.sales_invoices si ON si.id = sii.invoice_id
    LEFT JOIN public.businesses b ON b.id = si.business_id
    LEFT JOIN public.parties p ON p.id = si.party_id
    WHERE sii.gst_pct > 0
      AND COALESCE(sii.cgst_amount, 0) = 0
      AND COALESCE(sii.sgst_amount, 0) = 0
      AND COALESCE(sii.igst_amount, 0) = 0
  LOOP
    _is_interstate := COALESCE(public.gst_is_interstate(r.seller_gstin, r.buyer_gstin), false);
    _line_gst := ROUND(COALESCE(r.net_rate, 0) * COALESCE(r.qty, 0) * (COALESCE(r.gst_pct, 0) / 100), 2);
    _half := ROUND(_line_gst / 2, 2);

    IF _is_interstate THEN
      UPDATE public.sales_invoice_items
      SET igst_rate = gst_pct, cgst_rate = 0, sgst_rate = 0,
          igst_amount = _line_gst, cgst_amount = 0, sgst_amount = 0
      WHERE id = r.id;
    ELSE
      UPDATE public.sales_invoice_items
      SET cgst_rate = gst_pct / 2, sgst_rate = gst_pct / 2, igst_rate = 0,
          cgst_amount = _half, sgst_amount = _line_gst - _half, igst_amount = 0
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Same historical gap for HSN: backfill from the linked product where the
-- item itself has none recorded yet.
UPDATE public.sales_invoice_items sii
SET hsn = pr.hsn
FROM public.products pr
WHERE sii.product_id = pr.id
  AND sii.hsn IS NULL
  AND pr.hsn IS NOT NULL;

