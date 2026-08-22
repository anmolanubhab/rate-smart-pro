-- Fix: create_qc_debit_note() ignored additional_discount_percent (2026-08-22).
--
-- Purchase Return / Debit Note commercial-consistency requirement: a
-- damaged/short-supply debit note raised against a GRN's discrepancy must
-- reverse the exact same rate/discount/GST pattern the original Purchase
-- Invoice line was posted at -- not a re-derived or partial one.
--
-- computePurchaseLine() (src/lib/purchaseCalc.ts), the formula that actually
-- computed the invoice line's taxable_amount at save time, applies BOTH
-- discounts sequentially:
--   taxable = qty * rate * (1 - primaryDiscountPct/100) * (1 - additionalDiscountPct/100)
-- (this is the Purchase Pricing Engine's Mode 2 -- primary + additional
-- discount applied one after the other, not summed).
--
-- create_qc_debit_note() only applied discount_percent (primary), never
-- additional_discount_percent, when computing the return line's taxable/GST:
--   v_line_taxable := v_qty * v_item.purchase_price * (1 - discount_percent/100)
-- For any invoice line that used an additional discount, the auto-generated
-- debit note overstated the taxable value (and therefore the GST and total),
-- so the return no longer matched the original invoice's actual per-unit net
-- rate -- breaking the "same commercial pattern" requirement.
--
-- Fix: apply additional_discount_percent sequentially after the primary
-- discount, identical to computePurchaseLine(). Both percentages are read
-- from the posted purchase_invoice_items row (a permanent snapshot, not
-- live-joined to the product/price-list), so this remains immune to any
-- later price-list change -- unchanged behavior, just now correct.

CREATE OR REPLACE FUNCTION public.create_qc_debit_note(_business_id uuid, _purchase_invoice_id uuid, _goods_receipt_id uuid, _reason_category text, _items jsonb)
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
  v_qty numeric;
  v_line_taxable numeric;
  v_line_gst numeric;
  v_total_taxable numeric := 0;
  v_total_gst numeric := 0;
  v_before numeric; v_after numeric;
  v_supplier_ledger uuid;
  v_purchase_ledger uuid;
  v_cgst_in uuid; v_sgst_in uuid; v_igst_in uuid; v_gst_in_legacy uuid;
  v_voucher uuid;
  v_business_gstin text; v_supplier_gstin text; v_split record;
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
    WHERE pii.id = (v_row->>'purchase_invoice_item_id')::uuid AND pii.purchase_invoice_id = _purchase_invoice_id
    FOR UPDATE OF pii;

    IF v_item IS NULL THEN
      RAISE EXCEPTION 'Invoice line % not found on this invoice', v_row->>'purchase_invoice_item_id';
    END IF;

    v_qty := (v_row->>'qty')::numeric;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    -- Same sequential primary-then-additional discount chain as
    -- computePurchaseLine() (src/lib/purchaseCalc.ts) -- the exact formula
    -- that produced this invoice line's own taxable_amount at save time.
    v_line_taxable := v_qty * v_item.purchase_price
                       * (1 - COALESCE(v_item.discount_percent, 0) / 100)
                       * (1 - COALESCE(v_item.additional_discount_percent, 0) / 100);
    v_line_gst := v_line_taxable * COALESCE(v_item.gst_percent, 0) / 100;

    INSERT INTO public.purchase_return_items
      (return_id, purchase_invoice_item_id, business_id, product_id, part_number, description, qty, rate, gst_pct, line_total)
    VALUES
      (v_return_id, v_item.id, _business_id, v_item.product_id, v_item.part_number, v_item.description,
       v_qty, v_item.purchase_price, v_item.gst_percent, v_line_taxable + v_line_gst);

    v_total_taxable := v_total_taxable + v_line_taxable;
    v_total_gst := v_total_gst + v_line_gst;

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
  SELECT id INTO v_cgst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'CGST Input' LIMIT 1;
  SELECT id INTO v_sgst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'SGST Input' LIMIT 1;
  SELECT id INTO v_igst_in FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'IGST Input' LIMIT 1;
  SELECT id INTO v_gst_in_legacy FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'GST Input' LIMIT 1;

  IF v_supplier_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(auth.uid(), 'debit_note');
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (auth.uid(), _business_id, v_number, 'debit_note', CURRENT_DATE,
      'QC rejection — ' || v_number || ' (' || _reason_category || ')', v_return_id, 'purchase_return',
      v_total_taxable + v_total_gst, 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (auth.uid(), _business_id, v_voucher, v_supplier_ledger, v_total_taxable + v_total_gst, 0, 1);

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

    UPDATE public.purchase_returns SET voucher_id = v_voucher WHERE id = v_return_id;
  END IF;

  RETURN v_return_id;
END;
$function$;
