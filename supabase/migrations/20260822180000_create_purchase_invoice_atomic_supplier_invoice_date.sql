-- Wire the new purchase_invoices.supplier_invoice_date column (see
-- 20260822170000_purchase_invoice_supplier_invoice_date.sql) into the
-- atomic create RPC, exactly like the existing supplier_invoice_number
-- param -- so a new Purchase Invoice's supplier invoice date is saved in
-- the same transaction as everything else, not a follow-up update.
--
-- Based on the function's actual live definition (pulled via
-- pg_get_functiondef against production) -- only the supplier_invoice_date
-- param/column is new; every other line is reproduced unchanged.
--
-- Adding a new IN parameter changes the function's signature, so a plain
-- CREATE OR REPLACE would leave the old 11-arg overload behind instead of
-- truly replacing it (Postgres resolves overloads by argument-type
-- signature). Drop the old signature explicitly first.
DROP FUNCTION IF EXISTS public.create_purchase_invoice_atomic(
  uuid, uuid, text, text, uuid, uuid, date, date, text, uuid, jsonb
);

CREATE OR REPLACE FUNCTION public.create_purchase_invoice_atomic(
  _business_id uuid,
  _supplier_id uuid,
  _invoice_number text,
  _supplier_invoice_number text,
  _supplier_invoice_date date,
  _purchase_order_id uuid,
  _goods_receipt_id uuid,
  _invoice_date date,
  _due_date date,
  _notes text,
  _created_by uuid,
  _items jsonb
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_row jsonb;
  v_subtotal numeric := 0;
  v_taxable numeric := 0;
  v_tax_total numeric := 0;
  v_discount_total numeric;
  v_grand_total_raw numeric;
  v_round_off numeric := 0;
  v_grand_total numeric;
  v_ro_enabled boolean; v_ro_method text; v_ro_apply boolean;
  v_business_gstin text; v_supplier_gstin text; v_split record;
  v_is_interstate boolean;
  v_purchase_ledger uuid; v_supplier_ledger uuid;
  v_cgst_in uuid; v_sgst_in uuid; v_igst_in uuid; v_gst_in_legacy uuid; v_round_off_ledger uuid;
  v_voucher uuid; v_voucher_number text;
  v_pos int := 1;
  v_product_id uuid; v_qty numeric; v_rate numeric; v_disc numeric; v_adisc numeric; v_gstpct numeric;
  v_line_taxable numeric; v_line_tax numeric; v_line_total numeric;
  v_hsn text;
  v_cgst_rate numeric; v_sgst_rate numeric; v_igst_rate numeric;
  v_cgst_amt numeric; v_sgst_amt numeric; v_igst_amt numeric;
  v_stock_before numeric; v_stock_after numeric; v_stock_qty numeric;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;
  SELECT id INTO v_supplier_ledger FROM public.parties WHERE id = _supplier_id AND business_id = _business_id;
  IF v_supplier_ledger IS NULL THEN
    RAISE EXCEPTION 'Supplier not found for this business';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_subtotal := v_subtotal + (COALESCE((v_row->>'rate')::numeric,0) * COALESCE((v_row->>'qty')::numeric,0));
    v_taxable := v_taxable + COALESCE((v_row->>'taxable_amount')::numeric,0);
    v_tax_total := v_tax_total + COALESCE((v_row->>'tax_amount')::numeric,0);
  END LOOP;
  v_discount_total := v_subtotal - v_taxable;
  v_grand_total_raw := v_taxable + v_tax_total;

  SELECT round_off_enabled, round_off_method, round_off_purchase_invoice
    INTO v_ro_enabled, v_ro_method, v_ro_apply
  FROM public.accounting_settings WHERE business_id = _business_id;

  IF COALESCE(v_ro_enabled, false) AND COALESCE(v_ro_apply, false) THEN
    v_round_off := ROUND(
      CASE COALESCE(v_ro_method, 'nearest')
        WHEN 'round_down' THEN FLOOR(v_grand_total_raw) - v_grand_total_raw
        WHEN 'round_up'   THEN CEIL(v_grand_total_raw) - v_grand_total_raw
        ELSE ROUND(v_grand_total_raw) - v_grand_total_raw
      END, 2);
  END IF;
  v_grand_total := v_grand_total_raw + v_round_off;

  INSERT INTO public.purchase_invoices
    (business_id, supplier_id, invoice_number, supplier_invoice_number, supplier_invoice_date, purchase_order_id, goods_receipt_id,
     invoice_date, due_date, notes, status, subtotal, discount_total, gst_total, grand_total, round_off_amount, created_by)
  VALUES
    (_business_id, _supplier_id, _invoice_number, _supplier_invoice_number, _supplier_invoice_date, _purchase_order_id, _goods_receipt_id,
     _invoice_date, _due_date, _notes, 'unpaid', v_subtotal, v_discount_total, v_tax_total, v_grand_total, v_round_off, _created_by)
  RETURNING id INTO v_invoice_id;

  SELECT gst_number INTO v_business_gstin FROM public.businesses WHERE id = _business_id;
  SELECT gst INTO v_supplier_gstin FROM public.parties WHERE id = _supplier_id;
  SELECT * INTO v_split FROM public.gst_split_amounts(v_business_gstin, v_supplier_gstin, v_tax_total);
  v_is_interstate := COALESCE(v_split.is_interstate, false);

  FOR v_row IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id := NULLIF(v_row->>'product_id','')::uuid;
    v_qty := COALESCE((v_row->>'qty')::numeric,0);
    IF v_qty <= 0 OR COALESCE(v_row->>'part_number','') = '' THEN CONTINUE; END IF;

    v_rate := COALESCE((v_row->>'rate')::numeric,0);
    v_disc := COALESCE((v_row->>'discount_percent')::numeric,0);
    v_adisc := COALESCE((v_row->>'additional_discount_percent')::numeric,0);
    v_gstpct := COALESCE((v_row->>'gst_percent')::numeric,0);
    v_line_taxable := COALESCE((v_row->>'taxable_amount')::numeric,0);
    v_line_tax := COALESCE((v_row->>'tax_amount')::numeric,0);
    v_line_total := COALESCE((v_row->>'total_amount')::numeric, v_line_taxable + v_line_tax);

    v_hsn := CASE WHEN v_product_id IS NOT NULL THEN (SELECT hsn_code FROM public.products WHERE id = v_product_id) ELSE NULL END;

    IF v_is_interstate THEN
      v_cgst_rate := 0; v_sgst_rate := 0; v_igst_rate := v_gstpct;
      v_cgst_amt := 0; v_sgst_amt := 0; v_igst_amt := ROUND(v_line_tax, 2);
    ELSE
      v_cgst_rate := v_gstpct / 2; v_sgst_rate := v_gstpct / 2; v_igst_rate := 0;
      v_cgst_amt := ROUND(v_line_tax / 2, 2); v_sgst_amt := ROUND(v_line_tax - v_cgst_amt, 2); v_igst_amt := 0;
    END IF;

    INSERT INTO public.purchase_invoice_items
      (purchase_invoice_id, business_id, product_id, part_number, description, hsn, quantity, purchase_price,
       discount_percent, additional_discount_percent, gst_percent, line_total, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
       cess_amount, position, unit_id, stock_qty,
       resolved_purchase_pricing_mode, resolved_ndp, resolved_primary_discount_pct, resolved_additional_discount_pct,
       purchase_scheme_id, chargeable_qty, free_qty, source_price_list_id, is_overridden, configured_rate)
    VALUES
      (v_invoice_id, _business_id, v_product_id, v_row->>'part_number', v_row->>'description', v_hsn, v_qty, v_rate,
       v_disc, v_adisc, v_gstpct, v_line_total, v_cgst_rate, v_sgst_rate, v_igst_rate, v_cgst_amt, v_sgst_amt, v_igst_amt,
       0, v_pos, NULLIF(v_row->>'unit_id','')::uuid, NULLIF(v_row->>'stock_qty','')::numeric,
       v_row->>'resolved_purchase_pricing_mode', NULLIF(v_row->>'resolved_ndp','')::numeric, NULLIF(v_row->>'resolved_primary_discount_pct','')::numeric, NULLIF(v_row->>'resolved_additional_discount_pct','')::numeric,
       NULLIF(v_row->>'purchase_scheme_id','')::uuid, NULLIF(v_row->>'chargeable_qty','')::numeric, COALESCE((v_row->>'free_qty')::numeric, 0), NULLIF(v_row->>'source_price_list_id','')::uuid, COALESCE((v_row->>'is_overridden')::boolean, false), NULLIF(v_row->>'configured_rate','')::numeric);
    v_pos := v_pos + 1;
  END LOOP;

  -- Voucher: Dr Purchase Account (taxable) + Dr GST Input (tax) / Cr Supplier
  -- (grand total) -- identical construction to buildPurchaseInvoiceLedgerItems().
  PERFORM public.seed_accounting_defaults(_created_by, _business_id);
  v_supplier_ledger := public.ensure_party_ledger(_created_by, _supplier_id, _business_id);
  IF v_supplier_ledger IS NULL THEN
    RAISE EXCEPTION 'Could not resolve a ledger for this supplier -- classify the party as a Supplier first.';
  END IF;

  SELECT id INTO v_purchase_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Purchase Account' LIMIT 1;
  IF v_purchase_ledger IS NULL THEN
    RAISE EXCEPTION 'Purchase Account ledger missing for this business.';
  END IF;
  SELECT id INTO v_cgst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'CGST Input' LIMIT 1;
  SELECT id INTO v_sgst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'SGST Input' LIMIT 1;
  SELECT id INTO v_igst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'IGST Input' LIMIT 1;
  SELECT id INTO v_gst_in_legacy FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'GST Input' LIMIT 1;
  SELECT id INTO v_round_off_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Round Off' LIMIT 1;

  v_voucher_number := public.next_voucher_number(_created_by, 'Purchase', _business_id);
  INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
  VALUES (_created_by, _business_id, v_voucher_number, 'purchase', _invoice_date,
    'Auto-posted from Purchase Invoice ' || _invoice_number, v_invoice_id, 'purchase_invoice', v_grand_total, 'posted')
  RETURNING id INTO v_voucher;

  INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
  VALUES (_created_by, _business_id, v_voucher, v_purchase_ledger, v_taxable, 0, 1);

  IF v_tax_total > 0 THEN
    IF v_is_interstate AND v_igst_in IS NOT NULL THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (_created_by, _business_id, v_voucher, v_igst_in, v_split.igst, 0, 2);
    ELSIF NOT v_is_interstate AND v_cgst_in IS NOT NULL AND v_sgst_in IS NOT NULL THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (_created_by, _business_id, v_voucher, v_cgst_in, v_split.cgst, 0, 2);
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (_created_by, _business_id, v_voucher, v_sgst_in, v_split.sgst, 0, 3);
    ELSIF v_gst_in_legacy IS NOT NULL THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (_created_by, _business_id, v_voucher, v_gst_in_legacy, v_tax_total, 0, 2);
    END IF;
  END IF;

  INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
  VALUES (_created_by, _business_id, v_voucher, v_supplier_ledger, 0, v_grand_total, 4);

  IF v_round_off_ledger IS NOT NULL AND v_round_off <> 0 THEN
    IF v_round_off > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (_created_by, _business_id, v_voucher, v_round_off_ledger, v_round_off, 0, 5);
    ELSE
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (_created_by, _business_id, v_voucher, v_round_off_ledger, 0, -v_round_off, 5);
    END IF;
  END IF;

  UPDATE public.purchase_invoices SET voucher_id = v_voucher WHERE id = v_invoice_id;

  IF _goods_receipt_id IS NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(_items) LOOP
      v_product_id := NULLIF(v_row->>'product_id','')::uuid;
      v_qty := COALESCE((v_row->>'qty')::numeric,0);
      IF v_product_id IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
      v_stock_qty := COALESCE(NULLIF(v_row->>'stock_qty','')::numeric, v_qty);

      SELECT stock INTO v_stock_before FROM public.products WHERE id = v_product_id;
      v_stock_before := COALESCE(v_stock_before, 0);
      v_stock_after := v_stock_before + v_stock_qty;

      UPDATE public.products SET stock = v_stock_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (_created_by, _business_id, v_product_id, 'purchase_invoice_direct', v_stock_qty, v_stock_before, v_stock_after, v_invoice_id, 'purchase_invoice', 'Direct Purchase Invoice ' || _invoice_number || ' (no GRN)');
    END LOOP;
  END IF;

  RETURN v_invoice_id;
END;
$function$;
