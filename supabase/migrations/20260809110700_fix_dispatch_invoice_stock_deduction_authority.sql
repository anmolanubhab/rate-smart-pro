-- P0 remediation (3/6): single authoritative stock deduction per transaction.
--
-- Verified root cause (forensic audit, 2026-08-09), from actual trigger
-- source, not inference:
--  - dispatch_items_stock_sync() (AFTER INSERT/UPDATE/DELETE on
--    dispatch_items) deducted products.stock UNCONDITIONALLY, with no
--    awareness of sales_config.stock_reduction_point.
--  - sales_invoice_autopost() (AFTER INSERT/UPDATE OF status on
--    sales_invoices) correctly checks stock_reduction_point = 'invoice'
--    before deducting -- so for a business configured 'invoice', BOTH
--    triggers deducted the same stock: once at dispatch (always, wrongly)
--    and again at invoice (correctly, per config) = confirmed double
--    deduction in live inventory_movements data. For stock_reduction_point
--    = 'dispatch' (the other live business), behavior was already correct
--    and must not change.
--  - sales_invoice_autopost() also had no explicit OLD.status transition
--    guard on the posting block (only an existing-voucher check) -- adding
--    one closes any path where a later UPDATE OF status could re-run
--    posting logic against an invoice that never got its sentinel voucher
--    row created on a prior pass.
--
-- Fix: make dispatch_items_stock_sync() skip its own products.stock /
-- inventory_movements write when the dispatch's business is configured
-- stock_reduction_point = 'invoice' (deduction becomes solely
-- sales_invoice_autopost()'s responsibility, exactly matching the
-- business's own configured intent). Bin resolution/tracking on
-- dispatch_items still happens either way -- only the stock/ledger
-- mutation is conditional. For 'dispatch' (or unset) mode, behavior is
-- byte-for-byte unchanged.

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
        UPDATE public.products SET stock = v_after WHERE id = v_product_id;
        INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
        VALUES (v_user_id, v_product_id, 'dispatch', -v_delta, v_warehouse_id, COALESCE(NEW.bin_id, OLD.bin_id), v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $function$;

-- Idempotency guard: the whole posting block (voucher creation AND stock
-- deduction) now only runs on the transition INTO 'posted', never on a
-- no-op re-save where NEW.status was already 'posted' before this UPDATE.
-- Belt-and-suspenders alongside the existing voucher-exists guard below it.
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
      UPDATE public.products SET stock = v_after WHERE id = r.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (NEW.user_id, v_biz, r.product_id, 'sale', -r.qty, v_before, v_after, NEW.id, 'sales_invoice', 'Invoice ' || NEW.invoice_number);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
