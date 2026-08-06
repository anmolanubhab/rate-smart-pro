-- Universal Document Output Center, Phase 4: Sales Return needs its OWN
-- print_profiles document_type, distinct from the existing "credit_note"
-- type. "credit_note" is already actively used by VoucherDetail.tsx's
-- Credit Note voucher printing (ledger Dr/Cr lines, item_grid_mode='ledger',
-- show_party=false) — a different document from a Sales Return, which is a
-- product-line return document (part/batch/HSN/qty/rate/discount/GST,
-- item_grid_mode='product', has a real party) despite both ultimately
-- posting a 'credit_note' voucher underneath. Reusing "credit_note" here
-- would have silently broken CreateSalesReturn.tsx's print output (product
-- columns replaced by ledger account rows). Same shape as sales_order/
-- quotation, since CreateSalesReturn.tsx already always showed HSN/Rate/
-- Discount/GST/Amount columns.

ALTER TABLE public.print_profiles DROP CONSTRAINT print_profiles_document_type_check;
ALTER TABLE public.print_profiles ADD CONSTRAINT print_profiles_document_type_check
  CHECK (document_type IN (
    'sales_invoice', 'purchase_invoice', 'delivery_challan',
    'sales_order', 'purchase_order', 'quotation', 'packing_slip',
    'debit_note', 'credit_note', 'payment_receipt',
    'journal_voucher', 'contra_voucher', 'sales_return'
  ));

CREATE OR REPLACE FUNCTION public.ensure_default_print_profiles(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'sales_invoice') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section)
    VALUES (_business_id, 'sales_invoice', 'Classic', true, 'TAX INVOICE', 'BILL TO', true, true, true, true, true, false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'purchase_invoice') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section)
    VALUES (_business_id, 'purchase_invoice', 'Classic', true, 'PURCHASE INVOICE', 'BILL TO', true, true, true, true, true, false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'delivery_challan') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, purpose_text)
    VALUES (_business_id, 'delivery_challan', 'Classic', true, 'DELIVERY CHALLAN', 'DELIVER TO', false, false, false, false, false, true, 'Sale on approval / Goods sent for delivery');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'sales_order') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, show_mrp, show_discount_column, show_warehouse)
    VALUES (_business_id, 'sales_order', 'Classic', true, 'SALES ORDER', 'BILL TO', true, true, true, true, true, false, true, true, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'purchase_order') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section)
    VALUES (_business_id, 'purchase_order', 'Classic', true, 'PURCHASE ORDER', 'SUPPLIER', true, true, true, true, true, false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'quotation') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, show_mrp, show_discount_column, show_warehouse, terms)
    VALUES (_business_id, 'quotation', 'Classic', true, 'QUOTATION', 'TO', true, true, true, true, true, false, true, true, true,
      '["This is a price quotation, not a tax invoice.", "Prices subject to change without notice.", "Goods once sold will not be taken back.", "E. & O.E."]'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'sales_return') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, show_warehouse)
    VALUES (_business_id, 'sales_return', 'Classic', true, 'CREDIT NOTE / SALES RETURN', 'BILL TO', true, true, true, true, true, false, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'packing_slip') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, purpose_text)
    VALUES (_business_id, 'packing_slip', 'Classic', true, 'PACKING SLIP', 'DELIVER TO', false, false, false, false, false, false, null);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'debit_note') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, item_grid_mode, show_party)
    VALUES (_business_id, 'debit_note', 'Classic', true, 'DEBIT NOTE', '', false, false, false, false, false, false, 'ledger', false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'credit_note') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, item_grid_mode, show_party)
    VALUES (_business_id, 'credit_note', 'Classic', true, 'CREDIT NOTE', '', false, false, false, false, false, false, 'ledger', false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'payment_receipt') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, item_grid_mode, show_party)
    VALUES (_business_id, 'payment_receipt', 'Classic', true, 'PAYMENT VOUCHER', '', false, false, false, false, false, false, 'ledger', false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'journal_voucher') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, item_grid_mode, show_party)
    VALUES (_business_id, 'journal_voucher', 'Classic', true, 'JOURNAL VOUCHER', '', false, false, false, false, false, false, 'ledger', false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'contra_voucher') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, item_grid_mode, show_party)
    VALUES (_business_id, 'contra_voucher', 'Classic', true, 'CONTRA VOUCHER', '', false, false, false, false, false, false, 'ledger', false);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
