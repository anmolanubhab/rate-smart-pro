-- Accounting integrity audit (2026-08-19): accounting_settings.round_off_debit_note
-- exists as a column and is fully wired into Settings -> Accounting ->
-- Round Off (RoundOffSettings.tsx "Apply Debit Note" toggle), but no
-- purchase-return/debit-note RPC ever read it -- create_purchase_return()
-- always posted total_amount = taxable + gst with no round-off leg,
-- making the setting a dead no-op toggle. Mirrors the Credit Note fix
-- (20260809161820_add_credit_note_round_off.sql), but with the OPPOSITE
-- sign convention worked out from this voucher's own shape: Dr Supplier
-- (rounded total) / Cr Purchase Account + GST Input (raw taxable+gst) --
-- round_off > 0 means Dr already covers it and Cr is short, so it needs
-- an extra CREDIT to balance (the reverse of Credit Note's Dr Round Off
-- for round_off > 0, since Credit Note's rounded leg sits on the credit
-- side instead of the debit side).
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
  v_cgst_in uuid; v_sgst_in uuid; v_igst_in uuid; v_gst_in_legacy uuid;
  v_round_off_ledger uuid;
  v_voucher uuid;
  v_business_gstin text; v_supplier_gstin text; v_split record;
  v_ro_enabled boolean;
  v_ro_method text;
  v_ro_apply boolean;
  v_round_off numeric := 0;
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

    IF v_item.product_id IS NOT NULL THEN
      v_before := COALESCE(v_item.current_stock, 0);
      v_after := v_before - v_return_qty;
      IF NOT public.stock_negative_allowed(_business_id) AND v_after < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product % to process this return (available %, requested %)', v_item.product_id, v_before, v_return_qty;
      END IF;
      UPDATE public.products SET stock = v_after WHERE id = v_item.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), _business_id, v_item.product_id, 'purchase_return', -v_return_qty, v_before, v_after, v_return_id, 'purchase_return', 'Return ' || v_number);
    END IF;
  END LOOP;

  -- Round Off, per Settings -> Accounting -> Round Off (applyDebitNote).
  SELECT round_off_enabled, round_off_method, round_off_debit_note
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

  UPDATE public.purchase_returns
  SET taxable_amount = v_total_taxable, gst_amount = v_total_gst,
      total_amount = v_total_taxable + v_total_gst + v_round_off
  WHERE id = v_return_id;

  PERFORM public.seed_accounting_defaults(auth.uid(), _business_id);
  v_supplier_ledger := public.ensure_party_ledger(auth.uid(), v_supplier_id, _business_id);

  SELECT id INTO v_purchase_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Purchase Account' LIMIT 1;
  SELECT id INTO v_cgst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'CGST Input' LIMIT 1;
  SELECT id INTO v_sgst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'SGST Input' LIMIT 1;
  SELECT id INTO v_igst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'IGST Input' LIMIT 1;
  SELECT id INTO v_gst_in_legacy FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'GST Input' LIMIT 1;
  SELECT id INTO v_round_off_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Round Off' LIMIT 1;

  IF v_supplier_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(auth.uid(), 'debit_note');
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status, note_mode)
    VALUES (auth.uid(), _business_id, v_number, 'debit_note', CURRENT_DATE,
      'Purchase return ' || v_number || COALESCE(' — ' || _reason, ''), v_return_id, 'purchase_return',
      v_total_taxable + v_total_gst + v_round_off, 'posted', 'material_return')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (auth.uid(), _business_id, v_voucher, v_supplier_ledger, v_total_taxable + v_total_gst + v_round_off, 0, 1);

    IF v_purchase_ledger IS NOT NULL AND v_total_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_purchase_ledger, 0, v_total_taxable, 2);
    END IF;

    IF v_total_gst > 0 THEN
      SELECT gst_number INTO v_business_gstin FROM public.businesses WHERE id = _business_id;
      SELECT gst INTO v_supplier_gstin FROM public.parties WHERE id = v_supplier_id;
      SELECT * INTO v_split FROM public.gst_split_amounts(v_business_gstin, v_supplier_gstin, v_total_gst);

      IF v_split.is_interstate AND v_igst_in IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), _business_id, v_voucher, v_igst_in, 0, v_split.igst, 3);
      ELSIF NOT v_split.is_interstate AND v_cgst_in IS NOT NULL AND v_sgst_in IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), _business_id, v_voucher, v_cgst_in, 0, v_split.cgst, 3);
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), _business_id, v_voucher, v_sgst_in, 0, v_split.sgst, 4);
      ELSIF v_gst_in_legacy IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), _business_id, v_voucher, v_gst_in_legacy, 0, v_total_gst, 3);
      END IF;
    END IF;

    -- Cr(Purchase+GST, raw) must equal Dr(supplier, ROUNDED total) -- see
    -- migration header: round_off > 0 -> Cr Round Off; round_off < 0 -> Dr Round Off.
    IF v_round_off_ledger IS NOT NULL AND v_round_off <> 0 THEN
      IF v_round_off > 0 THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), _business_id, v_voucher, v_round_off_ledger, 0, v_round_off, 5);
      ELSE
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), _business_id, v_voucher, v_round_off_ledger, -v_round_off, 0, 5);
      END IF;
    END IF;

    UPDATE public.purchase_returns SET voucher_id = v_voucher WHERE id = v_return_id;
  END IF;

  RETURN v_return_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
