-- P1 fix (RD-Pro workflow audit, 2026-08-10): accounting_settings.allow_negative_stock
-- was enforced only inside dispatch_stock_transfer() and had no UI control
-- anywhere -- every other stock-decreasing path (sales_invoice_autopost,
-- dispatch_items_stock_sync, create_inventory_adjustment's decrease branch,
-- create_purchase_return) could drive products.stock negative unconditionally.
--
-- Fix: a small shared helper mirroring the check already proven in
-- dispatch_stock_transfer, applied consistently to every other
-- stock-decreasing write path. Default remains false (unchanged), and it is
-- now user-editable via Settings -> Inventory Settings (src/pages/settings/InventorySettings.tsx).

CREATE OR REPLACE FUNCTION public.stock_negative_allowed(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(allow_negative_stock, false) FROM public.accounting_settings WHERE business_id = _business_id;
$$;

-- ── sales_invoice_autopost: stock decrease when stock_reduction_point='invoice' ──
CREATE OR REPLACE FUNCTION public.sales_invoice_autopost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_party_ledger uuid;
  v_sales uuid;
  v_cgst_out uuid;
  v_sgst_out uuid;
  v_igst_out uuid;
  v_gst_out_legacy uuid;
  v_round_off_ledger uuid;
  v_voucher uuid;
  v_number text;
  v_taxable numeric;
  v_reduce text;
  v_biz uuid;
  r record;
  v_before numeric;
  v_after numeric;
  v_gst_total numeric;
  v_round_off numeric;
  v_split record;
  v_seller_gstin text;
  v_buyer_gstin text;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN RETURN NEW; END IF;
  IF NEW.party_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE user_id = NEW.user_id AND reference_type = 'sales_invoice' AND reference_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_biz := COALESCE(NEW.business_id, public._user_default_business(NEW.user_id));

  PERFORM public.seed_accounting_defaults(NEW.user_id, v_biz);
  v_party_ledger := public.ensure_party_ledger(NEW.user_id, NEW.party_id, v_biz);

  IF v_party_ledger IS NOT NULL THEN
    SELECT id INTO v_sales FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'Sales Account' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_cgst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'CGST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_sgst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'SGST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_igst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'IGST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_gst_out_legacy FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'GST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_round_off_ledger FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'Round Off' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;

    v_number := public.next_voucher_number(NEW.user_id, 'sales');
    v_gst_total := COALESCE(NEW.gst_total, 0);
    v_round_off := COALESCE(NEW.round_off_amount, 0);
    v_taxable := COALESCE(NEW.grand_total, 0) - v_gst_total - v_round_off;

    SELECT gst_number INTO v_seller_gstin FROM public.businesses WHERE id = v_biz;
    SELECT gst INTO v_buyer_gstin FROM public.parties WHERE id = NEW.party_id;
    SELECT * INTO v_split FROM public.gst_split_amounts(v_seller_gstin, v_buyer_gstin, v_gst_total);

    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (NEW.user_id, v_biz, v_number, 'sales', COALESCE(NEW.invoice_date, CURRENT_DATE),
      'Auto-posted from invoice ' || NEW.invoice_number, NEW.id, 'sales_invoice', COALESCE(NEW.grand_total, 0), 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_biz, v_voucher, v_party_ledger, COALESCE(NEW.grand_total, 0), 0, 1);

    IF v_sales IS NOT NULL AND v_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (NEW.user_id, v_biz, v_voucher, v_sales, 0, v_taxable, 2);
    END IF;

    IF v_gst_total > 0 THEN
      IF v_split.is_interstate AND v_igst_out IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_igst_out, 0, v_split.igst, 3);
      ELSIF NOT v_split.is_interstate AND v_cgst_out IS NOT NULL AND v_sgst_out IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_cgst_out, 0, v_split.cgst, 3);
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_sgst_out, 0, v_split.sgst, 4);
      ELSIF v_gst_out_legacy IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_gst_out_legacy, 0, v_gst_total, 3);
      END IF;
    END IF;

    IF v_round_off_ledger IS NOT NULL AND v_round_off <> 0 THEN
      IF v_round_off > 0 THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_round_off_ledger, 0, v_round_off, 5);
      ELSE
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_round_off_ledger, -v_round_off, 0, 5);
      END IF;
    END IF;

    UPDATE public.sales_invoices SET voucher_id = v_voucher WHERE id = NEW.id;
  END IF;

  SELECT stock_reduction_point INTO v_reduce FROM public.sales_config WHERE business_id = v_biz;
  IF v_reduce = 'invoice' THEN
    FOR r IN SELECT product_id, qty FROM public.sales_invoice_items WHERE invoice_id = NEW.id AND product_id IS NOT NULL LOOP
      SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = r.product_id;
      v_after := v_before - r.qty;
      IF NOT public.stock_negative_allowed(v_biz) AND v_after < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product % (available %, requested %)', r.product_id, v_before, r.qty;
      END IF;
      UPDATE public.products SET stock = v_after WHERE id = r.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (NEW.user_id, v_biz, r.product_id, 'sale', -r.qty, v_before, v_after, NEW.id, 'sales_invoice', 'Invoice ' || NEW.invoice_number);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── dispatch_items_stock_sync: stock decrease when stock_reduction_point='dispatch' ──
CREATE OR REPLACE FUNCTION public.dispatch_items_stock_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id uuid;
  v_user_id uuid;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_qty numeric;
  v_old_qty numeric;
  v_warehouse_id uuid;
  v_business_id uuid;
  v_bin_id uuid;
  v_reduce_point text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = NEW.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_bin_id := public.resolve_dispatch_bin(v_product_id, v_warehouse_id, NEW.bin_id);
      IF NEW.bin_id IS DISTINCT FROM v_bin_id THEN
        UPDATE public.dispatch_items SET bin_id = v_bin_id WHERE id = NEW.id;
      END IF;

      SELECT stock_reduction_point INTO v_reduce_point FROM public.sales_config WHERE business_id = v_business_id;
      IF v_reduce_point IS DISTINCT FROM 'invoice' THEN
        v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
        SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
        v_after := v_before - v_qty;
        IF NOT public.stock_negative_allowed(v_business_id) AND v_after < 0 THEN
          RAISE EXCEPTION 'Insufficient stock for product % (available %, requested %)', v_product_id, v_before, v_qty;
        END IF;
        UPDATE public.products SET stock = v_after WHERE id = v_product_id;
        INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
        VALUES (v_user_id, v_product_id, 'dispatch', -v_qty, v_warehouse_id, v_bin_id, v_before, v_after, NEW.dispatch_id, 'dispatch', NULL);
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = OLD.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = OLD.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));

      SELECT stock_reduction_point INTO v_reduce_point FROM public.sales_config WHERE business_id = v_business_id;
      IF v_reduce_point IS DISTINCT FROM 'invoice' THEN
        v_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
        SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
        v_after := v_before + v_qty;
        UPDATE public.products SET stock = v_after WHERE id = v_product_id;
        INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
        VALUES (v_user_id, v_product_id, 'return', v_qty, v_warehouse_id, OLD.bin_id, v_before, v_after, OLD.dispatch_id, 'dispatch_reversal', 'Dispatch reversed');
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND (OLD.dispatched_qty <> NEW.dispatched_qty OR COALESCE(OLD.stock_dispatched_qty,-1) <> COALESCE(NEW.stock_dispatched_qty,-1)) THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT d.warehouse_id, d.business_id INTO v_warehouse_id, v_business_id FROM public.dispatches d WHERE d.id = NEW.dispatch_id;
      v_warehouse_id := COALESCE(v_warehouse_id, public.get_default_warehouse_id(v_business_id));

      SELECT stock_reduction_point INTO v_reduce_point FROM public.sales_config WHERE business_id = v_business_id;
      IF v_reduce_point IS DISTINCT FROM 'invoice' THEN
        v_qty := COALESCE(NEW.stock_dispatched_qty, NEW.dispatched_qty);
        v_old_qty := COALESCE(OLD.stock_dispatched_qty, OLD.dispatched_qty);
        v_delta := v_qty - v_old_qty;
        SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
        v_after := v_before - v_delta;
        IF NOT public.stock_negative_allowed(v_business_id) AND v_after < 0 THEN
          RAISE EXCEPTION 'Insufficient stock for product % (available %, requested %)', v_product_id, v_before, v_delta;
        END IF;
        UPDATE public.products SET stock = v_after WHERE id = v_product_id;
        INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
        VALUES (v_user_id, v_product_id, 'dispatch', -v_delta, v_warehouse_id, COALESCE(NEW.bin_id, OLD.bin_id), v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $function$;

-- ── create_inventory_adjustment: stock decrease branch ──
CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(_business_id uuid, _product_id uuid, _adjustment_type text, _qty numeric, _reason text, _warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_number text;
  v_before numeric;
  v_after numeric;
  v_cost numeric;
  v_value numeric;
  v_stock_ledger uuid;
  v_expense_ledger uuid;
  v_voucher uuid;
  v_warehouse_id uuid;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not authorized';
  end if;
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  if _adjustment_type not in ('increase', 'decrease') then
    raise exception 'adjustment_type must be increase or decrease';
  end if;

  v_warehouse_id := coalesce(_warehouse_id, public.get_default_warehouse_id(_business_id));

  select coalesce(stock, 0), nullif(cost_price, 0), nullif(purchase_price, 0)
    into v_before, v_cost, v_cost
  from public.products where id = _product_id and business_id = _business_id;
  if v_before is null then
    raise exception 'Product not found for this business';
  end if;
  select coalesce(nullif(cost_price, 0), nullif(purchase_price, 0)) into v_cost
  from public.products where id = _product_id;

  v_after := case when _adjustment_type = 'increase' then v_before + _qty else v_before - _qty end;

  if _adjustment_type = 'decrease' and not public.stock_negative_allowed(_business_id) and v_after < 0 then
    raise exception 'Insufficient stock for product % (available %, requested decrease %)', _product_id, v_before, _qty;
  end if;

  v_number := public.next_adjustment_number(_business_id);
  v_value := case when v_cost is not null then v_cost * _qty else null end;

  insert into public.inventory_adjustments
    (business_id, user_id, product_id, adjustment_type, qty, reason, adjustment_number, unit_cost, value_impact, status, warehouse_id)
  values
    (_business_id, auth.uid(), _product_id, _adjustment_type, _qty, _reason, v_number, v_cost, v_value, 'posted', v_warehouse_id)
  returning id into v_id;

  update public.products set stock = v_after where id = _product_id;
  insert into public.inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, stock_before, stock_after, reference_id, reference_type, notes)
  values (auth.uid(), _business_id, _product_id,
    case when _adjustment_type = 'increase' then 'adjustment_in' else 'adjustment_out' end,
    case when _adjustment_type = 'increase' then _qty else -_qty end,
    v_warehouse_id, v_before, v_after, v_id, 'inventory_adjustment', coalesce(_reason, v_number));

  -- Only post a Stock Journal voucher when we have a real cost to value
  -- it with -- never fabricate a ₹0 ledger entry.
  if v_cost is not null and v_value > 0 then
    perform public.seed_accounting_defaults(auth.uid(), _business_id);
    select id into v_stock_ledger from public.ledger_accounts where business_id = _business_id and name = 'Stock-in-Hand' limit 1;
    if v_stock_ledger is null then
      insert into public.ledger_accounts (business_id, user_id, name, ledger_type, is_system)
      select _business_id, auth.uid(), 'Stock-in-Hand', 'asset', true
      where not exists (select 1 from public.ledger_accounts where business_id = _business_id and name = 'Stock-in-Hand')
      returning id into v_stock_ledger;
    end if;
    select id into v_expense_ledger from public.ledger_accounts where business_id = _business_id and name = 'Miscellaneous Expense' limit 1;

    v_number := public.next_voucher_number(auth.uid(), 'stock_journal');
    insert into public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    values (auth.uid(), _business_id, v_number, 'stock_journal', current_date,
      'Stock ' || _adjustment_type || ' — ' || coalesce(_reason, v_number), v_id, 'inventory_adjustment', v_value, 'posted')
    returning id into v_voucher;

    if _adjustment_type = 'increase' then
      insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      values (auth.uid(), _business_id, v_voucher, v_stock_ledger, v_value, 0, 1);
      if v_expense_ledger is not null then
        insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        values (auth.uid(), _business_id, v_voucher, v_expense_ledger, 0, v_value, 2);
      end if;
    else
      if v_expense_ledger is not null then
        insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        values (auth.uid(), _business_id, v_voucher, v_expense_ledger, v_value, 0, 1);
      end if;
      insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      values (auth.uid(), _business_id, v_voucher, v_stock_ledger, 0, v_value, 2);
    end if;

    update public.inventory_adjustments set voucher_id = v_voucher where id = v_id;
  end if;

  return v_id;
end;
$function$;

-- ── create_purchase_return: stock decrease (goods physically leaving for the supplier) ──
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

NOTIFY pgrst, 'reload schema';
