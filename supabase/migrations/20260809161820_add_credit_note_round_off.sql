-- P1 remediation (Phase 4b): make Credit Note (Sales Return) round-off
-- actually reach the ledger. sales_returns.round_off already existed as
-- a column but was read nowhere and written nowhere -- post_sales_return()
-- recomputes and posts taxable_amount/gst_amount/total_amount itself at
-- post-time (not at draft-save time), so unlike Purchase Invoice this
-- fix lives entirely in this one function, reading accounting_settings
-- directly rather than trusting a JS-computed value.
--
-- Sign convention: CORRECTED after a live scratch-test caught the
-- original algebra was wrong (produced an unbalanced voucher, dr=44.84
-- vs cr=45.16, for a +0.16 round-up case). Actual required direction,
-- confirmed by the same test after the fix: Dr(Sales+GST, raw) must
-- equal Cr(party, ROUNDED total = taxable+gst+round_off). Since the
-- party leg alone already carries the full rounded total while
-- Sales/GST only cover the raw figure, round_off > 0 needs an extra
-- DEBIT to balance, not credit: round_off > 0 -> Dr Round Off;
-- round_off < 0 -> Cr Round Off. (This is the OPPOSITE of Sales
-- Invoice's own convention, not the same -- the earlier reasoning that
-- the two mirror-cancel was the bug.)

CREATE OR REPLACE FUNCTION public.post_sales_return(_return_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return record;
  v_invoice record;
  v_item record;
  v_already_returned numeric;
  v_remaining numeric;
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
  v_number text;
  v_ro_enabled boolean;
  v_ro_method text;
  v_ro_apply boolean;
  v_round_off numeric := 0;
BEGIN
  SELECT * INTO v_return FROM public.sales_returns WHERE id = _return_id;
  IF v_return IS NULL THEN
    RAISE EXCEPTION 'Return not found';
  END IF;
  IF NOT public.is_business_member(v_return.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_return.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft returns can be posted';
  END IF;

  SELECT * INTO v_invoice FROM public.sales_invoices WHERE id = v_return.sales_invoice_id;
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Linked invoice not found';
  END IF;
  IF v_invoice.status <> 'posted' THEN
    RAISE EXCEPTION 'Cannot post a return against an invoice that is not posted (invoice status: %)', v_invoice.status;
  END IF;
  IF v_return.return_date < v_invoice.invoice_date THEN
    RAISE EXCEPTION 'Return date cannot be before the invoice date';
  END IF;

  FOR v_item IN
    SELECT sri.*, p.stock AS current_stock, p.tracking_type
    FROM public.sales_return_items sri
    LEFT JOIN public.products p ON p.id = sri.product_id
    WHERE sri.return_id = _return_id
  LOOP
    IF v_item.qty <= 0 THEN CONTINUE; END IF;

    -- Re-validate against every OTHER posted return on this invoice line
    -- (excludes this draft's own not-yet-posted rows, and cancelled returns).
    SELECT COALESCE(SUM(sri2.qty), 0) INTO v_already_returned
    FROM public.sales_return_items sri2
    JOIN public.sales_returns sr2 ON sr2.id = sri2.return_id
    WHERE sri2.sales_invoice_item_id = v_item.sales_invoice_item_id
      AND sr2.status = 'posted'
      AND sr2.id <> _return_id;

    SELECT (qty - v_already_returned) INTO v_remaining
    FROM public.sales_invoice_items WHERE id = v_item.sales_invoice_item_id;

    IF v_item.qty > v_remaining THEN
      RAISE EXCEPTION 'Return qty (%) exceeds remaining returnable qty (%) for %', v_item.qty, v_remaining, v_item.part_number;
    END IF;

    -- v_item.rate is already the post-discount net rate (same convention
    -- computeItem() uses client-side: net = mrp*(1-disc/100)) -- discount_pct
    -- is stored alongside for display/audit only, not reapplied here.
    v_line_taxable := v_item.qty * v_item.rate;
    v_line_gst := v_line_taxable * v_item.gst_pct / 100;
    UPDATE public.sales_return_items SET line_total = v_line_taxable + v_line_gst WHERE id = v_item.id;
    v_total_taxable := v_total_taxable + v_line_taxable;
    v_total_gst := v_total_gst + v_line_gst;

    IF v_item.product_id IS NOT NULL THEN
      v_before := COALESCE(v_item.current_stock, 0);
      v_after := v_before + v_item.qty;
      UPDATE public.products SET stock = v_after WHERE id = v_item.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_return.business_id, v_item.product_id, 'sales_return', v_item.qty, v_before, v_after, _return_id, 'sales_return', 'Return ' || v_return.return_number);

      IF v_item.tracking_type = 'batch' AND v_item.batch_id IS NOT NULL THEN
        UPDATE public.product_batches SET qty = qty + v_item.qty WHERE id = v_item.batch_id;
      END IF;
    END IF;
  END LOOP;

  -- Round Off, per Settings -> Accounting -> Round Off (applyCreditNote).
  -- Reads accounting_settings directly rather than trusting a pre-set
  -- value, since this function is the sole source of truth for this
  -- return's totals (saveSalesReturnDraft() never touches them).
  SELECT round_off_enabled, round_off_method, round_off_credit_note
    INTO v_ro_enabled, v_ro_method, v_ro_apply
  FROM public.accounting_settings WHERE business_id = v_return.business_id;

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
      round_off = v_round_off, total_amount = v_total_taxable + v_total_gst + v_round_off,
      status = 'posted', posted_at = now(), posted_by = auth.uid()
  WHERE id = _return_id;

  -- Post the Credit Note voucher -- identical construction to
  -- create_sales_return's own (lines 225-276 of the prior migration).
  PERFORM public.seed_accounting_defaults(auth.uid(), v_return.business_id);
  v_party_ledger := public.ensure_party_ledger(auth.uid(), v_return.party_id, v_return.business_id);

  SELECT id INTO v_sales_ledger FROM public.ledger_accounts WHERE business_id = v_return.business_id AND name = 'Sales Account' LIMIT 1;
  SELECT id INTO v_cgst_out FROM public.ledger_accounts WHERE business_id = v_return.business_id AND name = 'CGST Output' LIMIT 1;
  SELECT id INTO v_sgst_out FROM public.ledger_accounts WHERE business_id = v_return.business_id AND name = 'SGST Output' LIMIT 1;
  SELECT id INTO v_igst_out FROM public.ledger_accounts WHERE business_id = v_return.business_id AND name = 'IGST Output' LIMIT 1;
  SELECT id INTO v_gst_out_legacy FROM public.ledger_accounts WHERE business_id = v_return.business_id AND name = 'GST Output' LIMIT 1;
  SELECT id INTO v_round_off_ledger FROM public.ledger_accounts WHERE business_id = v_return.business_id AND name = 'Round Off' LIMIT 1;

  IF v_party_ledger IS NOT NULL THEN
    DECLARE
      v_seller_gstin text; v_buyer_gstin text; v_split record;
    BEGIN
      SELECT gst_number INTO v_seller_gstin FROM public.businesses WHERE id = v_return.business_id;
      SELECT gst INTO v_buyer_gstin FROM public.parties WHERE id = v_return.party_id;
      SELECT * INTO v_split FROM public.gst_split_amounts(v_seller_gstin, v_buyer_gstin, v_total_gst);

      v_number := public.next_voucher_number(auth.uid(), 'credit_note');
      INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status, note_mode)
      VALUES (auth.uid(), v_return.business_id, v_number, 'credit_note', v_return.return_date,
        'Sales return ' || v_return.return_number || COALESCE(' — ' || v_return.reason, ''), _return_id, 'sales_return',
        v_total_taxable + v_total_gst + v_round_off, 'posted', 'material_return')
      RETURNING id INTO v_voucher;

      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), v_return.business_id, v_voucher, v_party_ledger, 0, v_total_taxable + v_total_gst + v_round_off, 1);

      IF v_sales_ledger IS NOT NULL AND v_total_taxable > 0 THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (auth.uid(), v_return.business_id, v_voucher, v_sales_ledger, v_total_taxable, 0, 2);
      END IF;

      IF v_total_gst > 0 THEN
        IF v_split.is_interstate AND v_igst_out IS NOT NULL THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_return.business_id, v_voucher, v_igst_out, v_split.igst, 0, 3);
        ELSIF NOT v_split.is_interstate AND v_cgst_out IS NOT NULL AND v_sgst_out IS NOT NULL THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_return.business_id, v_voucher, v_cgst_out, v_split.cgst, 0, 3);
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_return.business_id, v_voucher, v_sgst_out, v_split.sgst, 0, 4);
        ELSIF v_gst_out_legacy IS NOT NULL THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_return.business_id, v_voucher, v_gst_out_legacy, v_total_gst, 0, 3);
        END IF;
      END IF;

      -- Dr(Sales+GST, raw) must equal Cr(party, ROUNDED total) -- see
      -- migration header comment: rounded up (round_off > 0) -> Dr Round
      -- Off; rounded down (< 0) -> Cr Round Off.
      IF v_round_off_ledger IS NOT NULL AND v_round_off <> 0 THEN
        IF v_round_off > 0 THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_return.business_id, v_voucher, v_round_off_ledger, v_round_off, 0, 5);
        ELSE
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_return.business_id, v_voucher, v_round_off_ledger, 0, -v_round_off, 5);
        END IF;
      END IF;

      UPDATE public.sales_returns SET voucher_id = v_voucher WHERE id = _return_id;
    END;
  END IF;

  INSERT INTO public.sales_return_activity_logs (return_id, business_id, user_id, action, description, new_data)
  VALUES (_return_id, v_return.business_id, auth.uid(), 'posted', 'Return ' || v_return.return_number || ' posted',
          jsonb_build_object('total_amount', v_total_taxable + v_total_gst + v_round_off, 'voucher_id', v_voucher));

  RETURN _return_id;
END;
$function$;
