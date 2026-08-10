-- P2 fix (RD-Pro workflow audit, 2026-08-10): round-off coverage check
-- turned up a real gap missed by the earlier Credit Note round-off fix
-- (20260809161820_add_credit_note_round_off.sql): that migration only
-- patched post_sales_return() (the newer draft-first Create Sales Return
-- flow), but create_sales_return() -- the older, still-live RPC used by
-- src/components/returns/InvoiceReturnDialog.tsx -- posts its own Credit
-- Note voucher independently and never applied round-off at all. Two live,
-- coexisting "post a credit note" entry points, only one of them rounding.
--
-- Fix: give create_sales_return() the identical round-off block
-- (accounting_settings.round_off_enabled/method/round_off_credit_note),
-- same sign convention already verified correct in post_sales_return:
-- round_off > 0 -> Dr Round Off; round_off < 0 -> Cr Round Off.

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
  v_round_off_ledger uuid;
  v_voucher uuid;
  v_ro_enabled boolean;
  v_ro_method text;
  v_ro_apply boolean;
  v_round_off numeric := 0;
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

  -- Round Off, per Settings -> Accounting -> Round Off -- same block as
  -- post_sales_return(), so both live "post a credit note" paths agree.
  SELECT round_off_enabled, round_off_method, round_off_credit_note
    INTO v_ro_enabled, v_ro_method, v_ro_apply
  FROM public.accounting_settings WHERE business_id = _business_id;

  IF COALESCE(v_ro_enabled, false) AND COALESCE(v_ro_apply, false) THEN
    v_round_off := ROUND(
      CASE COALESCE(v_ro_method, 'nearest')
        WHEN 'round_down' THEN FLOOR(v_total_taxable + v_total_gst) - (v_total_taxable + v_total_gst)
        WHEN 'round_up'   THEN CEIL(v_total_taxable + v_total_gst) - (v_total_taxable + v_total_gst)
        ELSE ROUND(v_total_taxable + v_total_gst) - (v_total_taxable + v_total_gst)
      END, 2);
  END IF;

  UPDATE public.sales_returns
  SET taxable_amount = v_total_taxable, gst_amount = v_total_gst,
      round_off = v_round_off, total_amount = v_total_taxable + v_total_gst + v_round_off
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
  SELECT id INTO v_round_off_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Round Off' LIMIT 1;

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
        v_total_taxable + v_total_gst + v_round_off, 'posted', 'material_return')
      RETURNING id INTO v_voucher;

      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_party_ledger, 0, v_total_taxable + v_total_gst + v_round_off, 1);

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

      -- Dr(Sales+GST, raw) must equal Cr(party, ROUNDED total) -- same
      -- convention verified in post_sales_return(): round_off > 0 -> Dr
      -- Round Off; round_off < 0 -> Cr Round Off.
      IF v_round_off_ledger IS NOT NULL AND v_round_off <> 0 THEN
        IF v_round_off > 0 THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), _business_id, v_voucher, v_round_off_ledger, v_round_off, 0, 5);
        ELSE
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), _business_id, v_voucher, v_round_off_ledger, 0, -v_round_off, 5);
        END IF;
      END IF;

      UPDATE public.sales_returns SET voucher_id = v_voucher WHERE id = v_return_id;
    END;
  END IF;

  RETURN v_return_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
