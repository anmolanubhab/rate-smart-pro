-- Universal Document Output Center, Phase 4: the previous migration
-- (20260806100000) only updated ALREADY-SEEDED default Quotation profiles.
-- Businesses that haven't opened Quotation print settings yet still get the
-- plain defaults from this seed function on first use — bring the seed
-- itself in line so newly-seeded Quotation profiles match what
-- CreateQuotation.tsx's pre-migration toggle-mode print always showed
-- (MRP/Rack/Discount% columns, quotation-specific terms text).

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
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section)
    VALUES (_business_id, 'sales_order', 'Classic', true, 'SALES ORDER', 'BILL TO', true, true, true, true, true, false);
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
