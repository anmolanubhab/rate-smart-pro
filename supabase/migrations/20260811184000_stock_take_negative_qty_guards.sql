-- Stock Take QA: the "Counted Qty" input had no floor, and post_stock_take()
-- would happily push a product's total on-hand stock negative (unlike
-- dispatch_stock_transfer, which already checks allow_negative_stock).
-- Two guards, mirroring the transfer flow's existing pattern:
--   1. counted_qty itself can never be negative (you can't count -5 items).
--   2. Posting a variance can't drive total stock below zero unless the
--      business has explicitly turned on allow_negative_stock.

ALTER TABLE public.stock_take_items
  ADD CONSTRAINT stock_take_items_counted_qty_non_negative CHECK (counted_qty IS NULL OR counted_qty >= 0);

CREATE OR REPLACE FUNCTION public.post_stock_take(_sheet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sheet record;
  v_item record;
  v_delta numeric;
  v_before numeric;
  v_after numeric;
  v_cost numeric;
  v_value numeric;
  v_total_value numeric := 0;
  v_position int := 1;
  v_stock_ledger uuid;
  v_expense_ledger uuid;
  v_voucher uuid;
  v_number text;
  v_allow_negative boolean;
BEGIN
  SELECT * INTO v_sheet FROM public.stock_take_sheets WHERE id = _sheet_id FOR UPDATE;
  IF v_sheet.id IS NULL THEN
    RAISE EXCEPTION 'Stock take sheet not found';
  END IF;
  IF NOT public.is_business_member(v_sheet.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_sheet.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft sheets can be posted (current status: %)', v_sheet.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_take_items WHERE sheet_id = _sheet_id) THEN
    RAISE EXCEPTION 'Sheet has no line items';
  END IF;

  SELECT COALESCE(allow_negative_stock, false) INTO v_allow_negative
  FROM public.accounting_settings WHERE business_id = v_sheet.business_id;

  IF NOT COALESCE(v_allow_negative, false) THEN
    FOR v_item IN
      SELECT * FROM public.stock_take_items
      WHERE sheet_id = _sheet_id AND counted_qty IS NOT NULL AND counted_qty <> system_qty
    LOOP
      SELECT COALESCE(stock, 0) + (v_item.counted_qty - v_item.system_qty) INTO v_after
      FROM public.products WHERE id = v_item.product_id;
      IF v_after < 0 THEN
        RAISE EXCEPTION 'Posting this count would take product % below zero total stock (resulting: %)',
          v_item.product_id, v_after;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.seed_accounting_defaults(auth.uid(), v_sheet.business_id);
  SELECT id INTO v_stock_ledger FROM public.ledger_accounts WHERE business_id = v_sheet.business_id AND name = 'Stock-in-Hand' LIMIT 1;
  IF v_stock_ledger IS NULL THEN
    INSERT INTO public.ledger_accounts (business_id, user_id, name, ledger_type, is_system)
    SELECT v_sheet.business_id, auth.uid(), 'Stock-in-Hand', 'asset', true
    WHERE NOT EXISTS (SELECT 1 FROM public.ledger_accounts WHERE business_id = v_sheet.business_id AND name = 'Stock-in-Hand')
    RETURNING id INTO v_stock_ledger;
  END IF;
  SELECT id INTO v_expense_ledger FROM public.ledger_accounts WHERE business_id = v_sheet.business_id AND name = 'Miscellaneous Expense' LIMIT 1;

  v_number := public.next_voucher_number(auth.uid(), 'stock_journal');
  INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
  VALUES (auth.uid(), v_sheet.business_id, v_number, 'stock_journal', COALESCE(v_sheet.count_date, CURRENT_DATE),
    'Stock take variance — ' || COALESCE(v_sheet.sheet_no, _sheet_id::text), _sheet_id, 'stock_take', 0, 'posted')
  RETURNING id INTO v_voucher;

  FOR v_item IN
    SELECT * FROM public.stock_take_items
    WHERE sheet_id = _sheet_id AND counted_qty IS NOT NULL AND counted_qty <> system_qty
  LOOP
    v_delta := v_item.counted_qty - v_item.system_qty;

    SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = v_item.product_id;
    v_after := v_before + v_delta;
    UPDATE public.products SET stock = v_after WHERE id = v_item.product_id;

    INSERT INTO public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id,
       stock_before, stock_after, reference_id, reference_type, notes)
    VALUES
      (auth.uid(), v_sheet.business_id, v_item.product_id, 'stock_take', v_delta, v_sheet.warehouse_id, v_item.bin_id,
       v_before, v_after, _sheet_id, 'stock_take', 'Stock take ' || COALESCE(v_sheet.sheet_no, _sheet_id::text) || ' variance');

    SELECT COALESCE(NULLIF(cost_price, 0), NULLIF(purchase_price, 0)) INTO v_cost FROM public.products WHERE id = v_item.product_id;
    IF v_cost IS NOT NULL THEN
      v_value := ABS(v_delta) * v_cost;
      IF v_value > 0 THEN
        v_total_value := v_total_value + v_value;
        IF v_delta > 0 THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_stock_ledger, v_value, 0, v_position);
          v_position := v_position + 1;
          IF v_expense_ledger IS NOT NULL THEN
            INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
            VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_expense_ledger, 0, v_value, v_position);
            v_position := v_position + 1;
          END IF;
        ELSE
          IF v_expense_ledger IS NOT NULL THEN
            INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
            VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_expense_ledger, v_value, 0, v_position);
            v_position := v_position + 1;
          END IF;
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_stock_ledger, 0, v_value, v_position);
          v_position := v_position + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_total_value > 0 THEN
    UPDATE public.vouchers SET total_amount = v_total_value WHERE id = v_voucher;
    UPDATE public.stock_take_sheets SET voucher_id = v_voucher WHERE id = _sheet_id;
  ELSE
    DELETE FROM public.vouchers WHERE id = v_voucher;
  END IF;

  UPDATE public.stock_take_sheets
    SET status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_at = now()
    WHERE id = _sheet_id;
END;
$function$;
