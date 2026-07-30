-- Print Phase 2: extends print_profiles to cover the remaining document
-- types on the existing engine — Sales Order, Purchase Order, Quotation,
-- Packing Slip (product/item-grid shape, same as the Phase 1 documents),
-- and Debit Note / Credit Note / Payment Receipt (ledger Dr/Cr shape,
-- since vouchers have no party/item-price structure — they're double-entry
-- ledger lines). No new print component: item_grid_mode picks which grid
-- PrintDocument renders, and show_party controls whether the party block
-- renders at all (voucher documents don't have a structural party).

ALTER TABLE public.print_profiles DROP CONSTRAINT print_profiles_document_type_check;
ALTER TABLE public.print_profiles ADD CONSTRAINT print_profiles_document_type_check
  CHECK (document_type IN (
    'sales_invoice', 'purchase_invoice', 'delivery_challan',
    'sales_order', 'purchase_order', 'quotation', 'packing_slip',
    'debit_note', 'credit_note', 'payment_receipt'
  ));

ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS item_grid_mode text NOT NULL DEFAULT 'product'
  CHECK (item_grid_mode IN ('product', 'ledger'));
ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS show_party boolean NOT NULL DEFAULT true;

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
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section)
    VALUES (_business_id, 'quotation', 'Classic', true, 'QUOTATION', 'TO', true, true, true, true, true, false);
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
END;
$$;

NOTIFY pgrst, 'reload schema';
