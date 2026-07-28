-- Phase 3 (part 1) of the Debit Note / Credit Note redesign: tag the vouchers
-- already created by the Material Return path with note_mode='material_return'
-- (the vouchers.note_mode column was added, but left unset, in Phase 1's
-- migration 20260728060000). No new functions — this is CREATE OR REPLACE on
-- the three existing functions, reproducing each body exactly as captured
-- from the live database and changing only the `vouchers` INSERT to also set
-- note_mode. Everything else — validation, ledger posting, GST split, stock
-- movement — is byte-for-byte unchanged.
--
-- Idempotent: CREATE OR REPLACE is naturally idempotent (safe to re-run).
-- Backward compatible: signatures unchanged, so every existing caller
-- (SalesReturns.tsx, PurchaseReturns.tsx, RecordPurchaseInvoiceDialog's QC
-- flow) keeps working without any frontend change.
--
-- Manual rollback: re-apply the pre-migration bodies (see git history of
-- this file, or the exact bodies captured before this migration — available
-- via `pg_get_functiondef` on this project prior to 2026-07-29) via the same
-- CREATE OR REPLACE FUNCTION statements, or simply drop the `note_mode`
-- assignment from each INSERT.

CREATE OR REPLACE FUNCTION public.create_purchase_return(_business_id uuid, _purchase_invoice_id uuid, _reason text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier_id uuid;
  v_return_id uuid;
  v_number text;
  v_row jsonb;
  v_item record;
  v_return_qty numeric;
  v_already_returned numeric;
  v_line_taxable numeric;
  v_line_gst numeric;
  v_total_taxable numeric := 0;
  v_total_gst numeric := 0;
  v_before numeric; v_after numeric;
  v_supplier_ledger uuid;
  v_purchase_ledger uuid;
  v_gst_in_ledger uuid;
  v_voucher uuid;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT supplier_id INTO v_supplier_id FROM public.purchase_invoices
   WHERE id = _purchase_invoice_id AND business_id = _business_id;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice not found for this business';
  END IF;

  v_number := public.next_purchase_return_number(_business_id);
  INSERT INTO public.purchase_returns (business_id, user_id, return_number, purchase_invoice_id, supplier_id, reason)
  VALUES (_business_id, auth.uid(), v_number, _purchase_invoice_id, v_supplier_id, _reason)
  RETURNING id INTO v_return_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT pii.*, p.stock AS current_stock INTO v_item
    FROM public.purchase_invoice_items pii
    LEFT JOIN public.products p ON p.id = pii.product_id
    WHERE pii.id = (v_row->>'purchase_invoice_item_id')::uuid AND pii.purchase_invoice_id = _purchase_invoice_id;

    IF v_item IS NULL THEN
      RAISE EXCEPTION 'Invoice line % not found on this invoice', v_row->>'purchase_invoice_item_id';
    END IF;

    v_return_qty := (v_row->>'qty')::numeric;
    IF v_return_qty <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(qty), 0) INTO v_already_returned
    FROM public.purchase_return_items WHERE purchase_invoice_item_id = v_item.id;

    IF v_return_qty > (v_item.quantity - v_already_returned) THEN
      RAISE EXCEPTION 'Return qty (%) exceeds remaining returnable qty (%) for %', v_return_qty, v_item.quantity - v_already_returned, v_item.part_number;
    END IF;

    v_line_taxable := v_return_qty * v_item.purchase_price * (1 - COALESCE(v_item.discount_percent, 0) / 100);
    v_line_gst := v_line_taxable * COALESCE(v_item.gst_percent, 0) / 100;

    INSERT INTO public.purchase_return_items
      (return_id, purchase_invoice_item_id, business_id, product_id, part_number, description, qty, rate, gst_pct, line_total)
    VALUES
      (v_return_id, v_item.id, _business_id, v_item.product_id, v_item.part_number, v_item.description,
       v_return_qty, v_item.purchase_price, v_item.gst_percent, v_line_taxable + v_line_gst);

    v_total_taxable := v_total_taxable + v_line_taxable;
    v_total_gst := v_total_gst + v_line_gst;

    -- Stock leaves (goods going back to supplier)
    IF v_item.product_id IS NOT NULL THEN
      v_before := COALESCE(v_item.current_stock, 0);
      v_after := v_before - v_return_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_item.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), _business_id, v_item.product_id, 'purchase_return', -v_return_qty, v_before, v_after, v_return_id, 'purchase_return', 'Return ' || v_number);
    END IF;
  END LOOP;

  UPDATE public.purchase_returns
  SET taxable_amount = v_total_taxable, gst_amount = v_total_gst, total_amount = v_total_taxable + v_total_gst
  WHERE id = v_return_id;

  -- Post the Debit Note voucher (reverse of the purchase entries).
  PERFORM public.seed_accounting_defaults(auth.uid(), _business_id);
  v_supplier_ledger := public.ensure_party_ledger(auth.uid(), v_supplier_id, _business_id);

  SELECT id INTO v_purchase_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Purchase Account' LIMIT 1;
  SELECT id INTO v_gst_in_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'GST Input' LIMIT 1;

  IF v_supplier_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(auth.uid(), 'debit_note');
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status, note_mode)
    VALUES (auth.uid(), _business_id, v_number, 'debit_note', CURRENT_DATE,
      'Purchase return ' || v_number || COALESCE(' — ' || _reason, ''), v_return_id, 'purchase_return',
      v_total_taxable + v_total_gst, 'posted', 'material_return')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (auth.uid(), _business_id, v_voucher, v_supplier_ledger, v_total_taxable + v_total_gst, 0, 1);

    IF v_purchase_ledger IS NOT NULL AND v_total_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_purchase_ledger, 0, v_total_taxable, 2);
    END IF;
    IF v_gst_in_ledger IS NOT NULL AND v_total_gst > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_gst_in_ledger, 0, v_total_gst, 3);
    END IF;

    UPDATE public.purchase_returns SET voucher_id = v_voucher WHERE id = v_return_id;
  END IF;

  RETURN v_return_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_sales_return(_business_id uuid, _sales_invoice_id uuid, _reason text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_party_id uuid;
  v_return_id uuid;
  v_number text;
  v_row jsonb;
  v_item record;
  v_return_qty numeric;
  v_already_returned numeric;
  v_line_taxable numeric;
  v_line_gst numeric;
  v_total_taxable numeric := 0;
  v_total_gst numeric := 0;
  v_before numeric; v_after numeric;
  v_party_ledger uuid;
  v_sales_ledger uuid;
  v_cgst_out uuid; v_sgst_out uuid; v_igst_out uuid; v_gst_out_legacy uuid;
  v_voucher uuid;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT party_id INTO v_party_id FROM public.sales_invoices
   WHERE id = _sales_invoice_id AND business_id = _business_id;
  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'Sales invoice not found for this business';
  END IF;

  v_number := public.next_sales_return_number(_business_id);
  INSERT INTO public.sales_returns (business_id, user_id, return_number, sales_invoice_id, party_id, reason)
  VALUES (_business_id, auth.uid(), v_number, _sales_invoice_id, v_party_id, _reason)
  RETURNING id INTO v_return_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT sii.*, p.stock AS current_stock INTO v_item
    FROM public.sales_invoice_items sii
    LEFT JOIN public.products p ON p.id = sii.product_id
    WHERE sii.id = (v_row->>'sales_invoice_item_id')::uuid AND sii.invoice_id = _sales_invoice_id;

    IF v_item IS NULL THEN
      RAISE EXCEPTION 'Invoice line % not found on this invoice', v_row->>'sales_invoice_item_id';
    END IF;

    v_return_qty := (v_row->>'qty')::numeric;
    IF v_return_qty <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(qty), 0) INTO v_already_returned
    FROM public.sales_return_items WHERE sales_invoice_item_id = v_item.id;

    IF v_return_qty > (v_item.qty - v_already_returned) THEN
      RAISE EXCEPTION 'Return qty (%) exceeds remaining returnable qty (%) for %', v_return_qty, v_item.qty - v_already_returned, v_item.part_number;
    END IF;

    v_line_taxable := v_return_qty * COALESCE(v_item.net_rate, v_item.rate) * (1 - COALESCE(v_item.discount_pct, 0) / 100);
    v_line_gst := v_line_taxable * COALESCE(v_item.gst_pct, 0) / 100;

    INSERT INTO public.sales_return_items
      (return_id, sales_invoice_item_id, business_id, product_id, part_number, description, qty, rate, gst_pct, line_total)
    VALUES
      (v_return_id, v_item.id, _business_id, v_item.product_id, v_item.part_number, v_item.description,
       v_return_qty, COALESCE(v_item.net_rate, v_item.rate), v_item.gst_pct, v_line_taxable + v_line_gst);

    v_total_taxable := v_total_taxable + v_line_taxable;
    v_total_gst := v_total_gst + v_line_gst;

    -- Stock comes back
    IF v_item.product_id IS NOT NULL THEN
      v_before := COALESCE(v_item.current_stock, 0);
      v_after := v_before + v_return_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_item.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), _business_id, v_item.product_id, 'sales_return', v_return_qty, v_before, v_after, v_return_id, 'sales_return', 'Return ' || v_number);
    END IF;
  END LOOP;

  UPDATE public.sales_returns
  SET taxable_amount = v_total_taxable, gst_amount = v_total_gst, total_amount = v_total_taxable + v_total_gst
  WHERE id = v_return_id;

  -- Post the Credit Note voucher (reverse of the sales entries), same
  -- CGST/SGST vs IGST split logic as the original invoice.
  PERFORM public.seed_accounting_defaults(auth.uid(), _business_id);
  v_party_ledger := public.ensure_party_ledger(auth.uid(), v_party_id, _business_id);

  SELECT id INTO v_sales_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Sales Account' LIMIT 1;
  SELECT id INTO v_cgst_out FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'CGST Output' LIMIT 1;
  SELECT id INTO v_sgst_out FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'SGST Output' LIMIT 1;
  SELECT id INTO v_igst_out FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'IGST Output' LIMIT 1;
  SELECT id INTO v_gst_out_legacy FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'GST Output' LIMIT 1;

  IF v_party_ledger IS NOT NULL THEN
    DECLARE
      v_seller_gstin text; v_buyer_gstin text; v_split record;
    BEGIN
      SELECT gst_number INTO v_seller_gstin FROM public.businesses WHERE id = _business_id;
      SELECT gst INTO v_buyer_gstin FROM public.parties WHERE id = v_party_id;
      SELECT * INTO v_split FROM public.gst_split_amounts(v_seller_gstin, v_buyer_gstin, v_total_gst);

      v_number := public.next_voucher_number(auth.uid(), 'credit_note');
      INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status, note_mode)
      VALUES (auth.uid(), _business_id, v_number, 'credit_note', CURRENT_DATE,
        'Sales return ' || v_number || COALESCE(' — ' || _reason, ''), v_return_id, 'sales_return',
        v_total_taxable + v_total_gst, 'posted', 'material_return')
      RETURNING id INTO v_voucher;

      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_party_ledger, 0, v_total_taxable + v_total_gst, 1);

      IF v_sales_ledger IS NOT NULL AND v_total_taxable > 0 THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), _business_id, v_voucher, v_sales_ledger, v_total_taxable, 0, 2);
      END IF;

      IF v_total_gst > 0 THEN
        IF v_split.is_interstate AND v_igst_out IS NOT NULL THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), _business_id, v_voucher, v_igst_out, v_split.igst, 0, 3);
        ELSIF NOT v_split.is_interstate AND v_cgst_out IS NOT NULL AND v_sgst_out IS NOT NULL THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), _business_id, v_voucher, v_cgst_out, v_split.cgst, 0, 3);
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), _business_id, v_voucher, v_sgst_out, v_split.sgst, 0, 4);
        ELSIF v_gst_out_legacy IS NOT NULL THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), _business_id, v_voucher, v_gst_out_legacy, v_total_gst, 0, 3);
        END IF;
      END IF;

      UPDATE public.sales_returns SET voucher_id = v_voucher WHERE id = v_return_id;
    END;
  END IF;

  RETURN v_return_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_qc_debit_note(
  _business_id uuid,
  _purchase_invoice_id uuid,
  _goods_receipt_id uuid,
  _reason_category text,
  _items jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_supplier_id uuid;
  v_return_id uuid;
  v_number text;
  v_row jsonb;
  v_item record;
  v_qty numeric;
  v_line_taxable numeric;
  v_line_gst numeric;
  v_total_taxable numeric := 0;
  v_total_gst numeric := 0;
  v_before numeric; v_after numeric;
  v_supplier_ledger uuid;
  v_purchase_ledger uuid;
  v_gst_in_ledger uuid;
  v_voucher uuid;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT supplier_id INTO v_supplier_id FROM public.purchase_invoices
   WHERE id = _purchase_invoice_id AND business_id = _business_id;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice not found for this business';
  END IF;

  v_number := public.next_purchase_return_number(_business_id);
  INSERT INTO public.purchase_returns
    (business_id, user_id, return_number, purchase_invoice_id, supplier_id, reason,
     reason_category, source, goods_receipt_item_id)
  VALUES
    (_business_id, auth.uid(), v_number, _purchase_invoice_id, v_supplier_id,
     'QC rejection — ' || _reason_category, _reason_category, 'qc',
     (SELECT (jsonb_array_elements(_items)->>'goods_receipt_item_id')::uuid LIMIT 1))
  RETURNING id INTO v_return_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT pii.* INTO v_item
    FROM public.purchase_invoice_items pii
    WHERE pii.id = (v_row->>'purchase_invoice_item_id')::uuid AND pii.purchase_invoice_id = _purchase_invoice_id;

    IF v_item IS NULL THEN
      RAISE EXCEPTION 'Invoice line % not found on this invoice', v_row->>'purchase_invoice_item_id';
    END IF;

    v_qty := (v_row->>'qty')::numeric;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_line_taxable := v_qty * v_item.purchase_price * (1 - COALESCE(v_item.discount_percent, 0) / 100);
    v_line_gst := v_line_taxable * COALESCE(v_item.gst_percent, 0) / 100;

    INSERT INTO public.purchase_return_items
      (return_id, purchase_invoice_item_id, business_id, product_id, part_number, description, qty, rate, gst_pct, line_total)
    VALUES
      (v_return_id, v_item.id, _business_id, v_item.product_id, v_item.part_number, v_item.description,
       v_qty, v_item.purchase_price, v_item.gst_percent, v_line_taxable + v_line_gst);

    v_total_taxable := v_total_taxable + v_line_taxable;
    v_total_gst := v_total_gst + v_line_gst;

    -- Rejected qty leaves stock_on_hold (it was never in available stock).
    IF v_item.product_id IS NOT NULL THEN
      SELECT stock_on_hold INTO v_before FROM public.products WHERE id = v_item.product_id;
      v_before := COALESCE(v_before, 0);
      v_after := GREATEST(v_before - v_qty, 0);
      UPDATE public.products SET stock_on_hold = v_after WHERE id = v_item.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), _business_id, v_item.product_id, 'qc_rejection', -v_qty, v_before, v_after, v_return_id, 'purchase_return', 'QC-rejected — ' || v_number || ' (' || _reason_category || ')');
    END IF;
  END LOOP;

  UPDATE public.purchase_returns
  SET taxable_amount = v_total_taxable, gst_amount = v_total_gst, total_amount = v_total_taxable + v_total_gst
  WHERE id = v_return_id;

  PERFORM public.seed_accounting_defaults(auth.uid(), _business_id);
  v_supplier_ledger := public.ensure_party_ledger(auth.uid(), v_supplier_id, _business_id);

  SELECT id INTO v_purchase_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Purchase Account' LIMIT 1;
  SELECT id INTO v_gst_in_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'GST Input' LIMIT 1;

  IF v_supplier_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(auth.uid(), 'debit_note');
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status, note_mode)
    VALUES (auth.uid(), _business_id, v_number, 'debit_note', CURRENT_DATE,
      'QC rejection — ' || v_number || ' (' || _reason_category || ')', v_return_id, 'purchase_return',
      v_total_taxable + v_total_gst, 'posted', 'material_return')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (auth.uid(), _business_id, v_voucher, v_supplier_ledger, v_total_taxable + v_total_gst, 0, 1);

    IF v_purchase_ledger IS NOT NULL AND v_total_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_purchase_ledger, 0, v_total_taxable, 2);
    END IF;
    IF v_gst_in_ledger IS NOT NULL AND v_total_gst > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_gst_in_ledger, 0, v_total_gst, 3);
    END IF;

    UPDATE public.purchase_returns SET voucher_id = v_voucher WHERE id = v_return_id;
  END IF;

  RETURN v_return_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_qc_debit_note(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_qc_debit_note(uuid, uuid, uuid, text, jsonb) TO authenticated;
