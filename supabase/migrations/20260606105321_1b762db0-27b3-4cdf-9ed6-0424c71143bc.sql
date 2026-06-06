
CREATE INDEX IF NOT EXISTS idx_orders_business ON public.orders(business_id);
CREATE INDEX IF NOT EXISTS idx_order_items_business ON public.order_items(business_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_business ON public.dispatches(business_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_business ON public.dispatch_items(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_parties_business ON public.parties(business_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_business ON public.vouchers(business_id);
CREATE INDEX IF NOT EXISTS idx_voucher_items_business ON public.voucher_items(business_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_business ON public.ledger_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_account_groups_business ON public.account_groups(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_business ON public.inventory_movements(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_business ON public.sales_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_business ON public.sales_invoice_items(business_id);

-- RLS replacements --------------------------------------------------------
DROP POLICY IF EXISTS orders_select_own ON public.orders;
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS orders_update_own ON public.orders;
DROP POLICY IF EXISTS orders_delete_own ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY orders_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY orders_update ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY orders_delete ON public.orders FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS order_items_select_own ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_own ON public.order_items;
DROP POLICY IF EXISTS order_items_update_own ON public.order_items;
DROP POLICY IF EXISTS order_items_delete_own ON public.order_items;
CREATE POLICY oi_select ON public.order_items FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY oi_insert ON public.order_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY oi_update ON public.order_items FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY oi_delete ON public.order_items FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS dispatches_select_own ON public.dispatches;
DROP POLICY IF EXISTS dispatches_insert_own ON public.dispatches;
DROP POLICY IF EXISTS dispatches_update_own ON public.dispatches;
DROP POLICY IF EXISTS dispatches_delete_own ON public.dispatches;
CREATE POLICY d_select ON public.dispatches FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY d_insert ON public.dispatches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY d_update ON public.dispatches FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY d_delete ON public.dispatches FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS dispatch_items_select_own ON public.dispatch_items;
DROP POLICY IF EXISTS dispatch_items_insert_own ON public.dispatch_items;
DROP POLICY IF EXISTS dispatch_items_update_own ON public.dispatch_items;
DROP POLICY IF EXISTS dispatch_items_delete_own ON public.dispatch_items;
CREATE POLICY di_select ON public.dispatch_items FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY di_insert ON public.dispatch_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY di_update ON public.dispatch_items FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY di_delete ON public.dispatch_items FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS products_select_own ON public.products;
DROP POLICY IF EXISTS products_insert_own ON public.products;
DROP POLICY IF EXISTS products_update_own ON public.products;
DROP POLICY IF EXISTS products_delete_own ON public.products;
CREATE POLICY p_select ON public.products FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY p_insert ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY p_update ON public.products FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY p_delete ON public.products FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS "Users view own parties" ON public.parties;
DROP POLICY IF EXISTS "Users insert own parties" ON public.parties;
DROP POLICY IF EXISTS "Users update own parties" ON public.parties;
DROP POLICY IF EXISTS "Users delete own parties" ON public.parties;
CREATE POLICY pt_select ON public.parties FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY pt_insert ON public.parties FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY pt_update ON public.parties FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY pt_delete ON public.parties FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS vch_select_own ON public.vouchers;
DROP POLICY IF EXISTS vch_insert_own ON public.vouchers;
DROP POLICY IF EXISTS vch_update_own ON public.vouchers;
DROP POLICY IF EXISTS vch_delete_own ON public.vouchers;
CREATE POLICY v_select ON public.vouchers FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY v_insert ON public.vouchers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY v_update ON public.vouchers FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY v_delete ON public.vouchers FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS vi_select_own ON public.voucher_items;
DROP POLICY IF EXISTS vi_insert_own ON public.voucher_items;
DROP POLICY IF EXISTS vi_update_own ON public.voucher_items;
DROP POLICY IF EXISTS vi_delete_own ON public.voucher_items;
CREATE POLICY vi_select ON public.voucher_items FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY vi_insert ON public.voucher_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY vi_update ON public.voucher_items FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY vi_delete ON public.voucher_items FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS la_select_own ON public.ledger_accounts;
DROP POLICY IF EXISTS la_insert_own ON public.ledger_accounts;
DROP POLICY IF EXISTS la_update_own ON public.ledger_accounts;
DROP POLICY IF EXISTS la_delete_own ON public.ledger_accounts;
CREATE POLICY la_select ON public.ledger_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY la_insert ON public.ledger_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY la_update ON public.ledger_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY la_delete ON public.ledger_accounts FOR DELETE TO authenticated USING ((auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id))) AND is_system = false);

DROP POLICY IF EXISTS ag_select_own ON public.account_groups;
DROP POLICY IF EXISTS ag_insert_own ON public.account_groups;
DROP POLICY IF EXISTS ag_update_own ON public.account_groups;
DROP POLICY IF EXISTS ag_delete_own ON public.account_groups;
CREATE POLICY ag_select ON public.account_groups FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY ag_insert ON public.account_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY ag_update ON public.account_groups FOR UPDATE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY ag_delete ON public.account_groups FOR DELETE TO authenticated USING ((auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id))) AND is_system = false);

DROP POLICY IF EXISTS im_select_own ON public.inventory_movements;
DROP POLICY IF EXISTS im_insert_own ON public.inventory_movements;
DROP POLICY IF EXISTS im_delete_own ON public.inventory_movements;
CREATE POLICY im_select ON public.inventory_movements FOR SELECT TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY im_insert ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY im_delete ON public.inventory_movements FOR DELETE TO authenticated USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

-- Triggers / RPCs ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_accounting_defaults(_user_id uuid, _business_id uuid DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_biz uuid;
  g_assets uuid; g_liab uuid; g_inc uuid; g_exp uuid; g_cap uuid;
  g_cash uuid; g_bank uuid; g_deb uuid; g_stock uuid; g_fixed uuid;
  g_cred uuid; g_loans uuid; g_taxes uuid;
  g_sales uuid; g_oinc uuid;
  g_pur uuid; g_dexp uuid; g_iexp uuid;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));
  IF EXISTS (SELECT 1 FROM public.account_groups WHERE user_id = _user_id AND is_system AND business_id IS NOT DISTINCT FROM v_biz) THEN
    RETURN;
  END IF;

  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system) VALUES (_user_id, v_biz, 'Assets', 'asset', true) RETURNING id INTO g_assets;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system) VALUES (_user_id, v_biz, 'Liabilities', 'liability', true) RETURNING id INTO g_liab;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system) VALUES (_user_id, v_biz, 'Income', 'income', true) RETURNING id INTO g_inc;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system) VALUES (_user_id, v_biz, 'Expenses', 'expense', true) RETURNING id INTO g_exp;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system) VALUES (_user_id, v_biz, 'Capital', 'capital', true) RETURNING id INTO g_cap;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Cash', g_assets, 'asset', true) RETURNING id INTO g_cash;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Bank', g_assets, 'asset', true) RETURNING id INTO g_bank;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Sundry Debtors', g_assets, 'asset', true) RETURNING id INTO g_deb;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Stock-in-Hand', g_assets, 'asset', true) RETURNING id INTO g_stock;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Fixed Assets', g_assets, 'asset', true) RETURNING id INTO g_fixed;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Sundry Creditors', g_liab, 'liability', true) RETURNING id INTO g_cred;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Loans', g_liab, 'liability', true) RETURNING id INTO g_loans;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Duties & Taxes', g_liab, 'liability', true) RETURNING id INTO g_taxes;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Sales Accounts', g_inc, 'income', true) RETURNING id INTO g_sales;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Other Income', g_inc, 'income', true) RETURNING id INTO g_oinc;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Purchase Accounts', g_exp, 'expense', true) RETURNING id INTO g_pur;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Direct Expenses', g_exp, 'expense', true) RETURNING id INTO g_dexp;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system) VALUES (_user_id, v_biz, 'Indirect Expenses', g_exp, 'expense', true) RETURNING id INTO g_iexp;

  INSERT INTO public.ledger_accounts (user_id, business_id, name, group_id, ledger_type, is_system) VALUES
    (_user_id, v_biz, 'Cash Account', g_cash, 'cash', true),
    (_user_id, v_biz, 'Sales Account', g_sales, 'income', true),
    (_user_id, v_biz, 'Purchase Account', g_pur, 'expense', true),
    (_user_id, v_biz, 'CGST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'SGST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'IGST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'CGST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'SGST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'IGST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'GST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'GST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'Round Off', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Capital Account', g_cap, 'capital', true)
  ON CONFLICT (user_id, name) DO NOTHING;
END $function$;

CREATE OR REPLACE FUNCTION public.ensure_party_ledger(_user_id uuid, _party_id uuid, _business_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_id uuid; v_name text; v_group uuid; v_biz uuid;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));
  PERFORM public.seed_accounting_defaults(_user_id, v_biz);
  SELECT id INTO v_id FROM public.ledger_accounts
   WHERE user_id = _user_id AND party_id = _party_id
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT name INTO v_name FROM public.parties WHERE id = _party_id;
  IF v_name IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_group FROM public.account_groups
   WHERE user_id = _user_id AND name = 'Sundry Debtors' AND is_system
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  INSERT INTO public.ledger_accounts (user_id, business_id, name, group_id, ledger_type, party_id)
  VALUES (_user_id, v_biz, v_name, v_group, 'customer', _party_id)
  ON CONFLICT (user_id, name) DO UPDATE SET party_id = EXCLUDED.party_id
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.parties_create_ledger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  PERFORM public.ensure_party_ledger(NEW.user_id, NEW.id, NEW.business_id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.orders_autopost_sales()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_party_ledger uuid; v_sales uuid; v_gst_out uuid;
  v_voucher uuid; v_number text; v_taxable numeric; v_biz uuid;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.party_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE user_id = NEW.user_id
              AND reference_type = 'order' AND reference_id = NEW.id) THEN RETURN NEW; END IF;
  v_biz := COALESCE(NEW.business_id, public._user_default_business(NEW.user_id));
  PERFORM public.seed_accounting_defaults(NEW.user_id, v_biz);
  v_party_ledger := public.ensure_party_ledger(NEW.user_id, NEW.party_id, v_biz);
  IF v_party_ledger IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_sales FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'Sales Account' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  SELECT id INTO v_gst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'GST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  v_number := public.next_voucher_number(NEW.user_id, 'sales');
  v_taxable := COALESCE(NEW.grand_total,0) - COALESCE(NEW.gst_total,0);
  INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
  VALUES (NEW.user_id, v_biz, v_number, 'sales', COALESCE(NEW.order_date, CURRENT_DATE),
    'Auto-posted from order ' || NEW.order_number, NEW.id, 'order', COALESCE(NEW.grand_total,0), 'posted')
  RETURNING id INTO v_voucher;
  INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
  VALUES (NEW.user_id, v_biz, v_voucher, v_party_ledger, COALESCE(NEW.grand_total,0), 0, 1);
  IF v_sales IS NOT NULL AND v_taxable > 0 THEN
    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_biz, v_voucher, v_sales, 0, v_taxable, 2);
  END IF;
  IF v_gst_out IS NOT NULL AND COALESCE(NEW.gst_total,0) > 0 THEN
    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_biz, v_voucher, v_gst_out, 0, COALESCE(NEW.gst_total,0), 3);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sales_invoice_autopost()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_party_ledger uuid; v_sales uuid; v_gst_out uuid;
  v_voucher uuid; v_number text; v_taxable numeric;
  v_reduce text; v_biz uuid; r record; v_before numeric; v_after numeric;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  IF NEW.party_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE user_id = NEW.user_id
              AND reference_type = 'sales_invoice' AND reference_id = NEW.id) THEN RETURN NEW; END IF;
  v_biz := COALESCE(NEW.business_id, public._user_default_business(NEW.user_id));
  PERFORM public.seed_accounting_defaults(NEW.user_id, v_biz);
  v_party_ledger := public.ensure_party_ledger(NEW.user_id, NEW.party_id, v_biz);
  IF v_party_ledger IS NOT NULL THEN
    SELECT id INTO v_sales FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'Sales Account' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_gst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'GST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    v_number := public.next_voucher_number(NEW.user_id, 'sales');
    v_taxable := COALESCE(NEW.grand_total,0) - COALESCE(NEW.gst_total,0);
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date,
      narration, reference_id, reference_type, total_amount, status)
    VALUES (NEW.user_id, v_biz, v_number, 'sales', COALESCE(NEW.invoice_date, CURRENT_DATE),
      'Auto-posted from invoice ' || NEW.invoice_number, NEW.id, 'sales_invoice',
      COALESCE(NEW.grand_total,0), 'posted')
    RETURNING id INTO v_voucher;
    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_biz, v_voucher, v_party_ledger, COALESCE(NEW.grand_total,0), 0, 1);
    IF v_sales IS NOT NULL AND v_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
      VALUES (NEW.user_id, v_biz, v_voucher, v_sales, 0, v_taxable, 2);
    END IF;
    IF v_gst_out IS NOT NULL AND COALESCE(NEW.gst_total,0) > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
      VALUES (NEW.user_id, v_biz, v_voucher, v_gst_out, 0, COALESCE(NEW.gst_total,0), 3);
    END IF;
    UPDATE public.sales_invoices SET voucher_id = v_voucher WHERE id = NEW.id;
  END IF;
  SELECT stock_reduction_point INTO v_reduce FROM public.sales_config WHERE business_id = v_biz;
  IF v_reduce = 'invoice' THEN
    FOR r IN SELECT product_id, qty FROM public.sales_invoice_items WHERE invoice_id = NEW.id AND product_id IS NOT NULL LOOP
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = r.product_id;
      v_after := v_before - r.qty;
      UPDATE public.products SET stock = v_after WHERE id = r.product_id;
      INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (NEW.user_id, v_biz, r.product_id, 'sale', -r.qty, v_before, v_after, NEW.id, 'sales_invoice', 'Invoice ' || NEW.invoice_number);
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.dispatch_items_stock_sync()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_product_id uuid; v_user_id uuid; v_biz uuid;
  v_before numeric; v_after numeric; v_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT product_id, user_id, business_id INTO v_product_id, v_user_id, v_biz FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - NEW.dispatched_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_biz, v_product_id, 'dispatch', -NEW.dispatched_qty, v_before, v_after, NEW.dispatch_id, 'dispatch', NULL);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT product_id, user_id, business_id INTO v_product_id, v_user_id, v_biz FROM public.order_items WHERE id = OLD.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before + OLD.dispatched_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_biz, v_product_id, 'return', OLD.dispatched_qty, v_before, v_after, OLD.dispatch_id, 'dispatch_reversal', 'Dispatch reversed');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.dispatched_qty <> NEW.dispatched_qty THEN
    SELECT product_id, user_id, business_id INTO v_product_id, v_user_id, v_biz FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      v_delta := NEW.dispatched_qty - OLD.dispatched_qty;
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - v_delta;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_biz, v_product_id, 'dispatch', -v_delta, v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
    END IF;
  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.products_initial_movement()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
  VALUES (NEW.user_id, NEW.business_id, NEW.id, 'initial', COALESCE(NEW.stock,0), 0, COALESCE(NEW.stock,0), NEW.id, 'product_create', 'Product created');
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.archive_business(_business_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role]) THEN
    RAISE EXCEPTION 'only owner can archive';
  END IF;
  UPDATE public.businesses SET archived_at = now() WHERE id = _business_id;
END $function$;

CREATE OR REPLACE FUNCTION public.unarchive_business(_business_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role]) THEN
    RAISE EXCEPTION 'only owner can unarchive';
  END IF;
  UPDATE public.businesses SET archived_at = NULL WHERE id = _business_id;
END $function$;

CREATE OR REPLACE FUNCTION public.business_transaction_count(_business_id uuid)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT (
    (SELECT COUNT(*) FROM public.orders WHERE business_id = _business_id) +
    (SELECT COUNT(*) FROM public.vouchers WHERE business_id = _business_id) +
    (SELECT COUNT(*) FROM public.sales_invoices WHERE business_id = _business_id) +
    (SELECT COUNT(*) FROM public.dispatches WHERE business_id = _business_id)
  )::integer
$function$;
