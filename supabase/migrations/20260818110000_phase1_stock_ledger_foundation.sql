-- Phase 1 — Foundation (accounting-architecture audit, "Where the stock
-- value actually lives", 2026-08-18): RD Pro runs a hybrid inventory model.
-- Purchases/sales are periodic (stock never touches a ledger; unsold-goods
-- value is injected into reports only at render time via a synthetic
-- "Closing Stock" figure computed from products.stock). But
-- create_inventory_adjustment() and post_stock_take() are perpetual: they
-- post real Dr/Cr entries to a "Stock-in-Hand" ledger that both functions
-- create ad hoc with group_id left NULL. A group-less ledger has no
-- `nature`, so it's invisible to the Balance Sheet/P&L's group-nature
-- filters but visible to the Trial Balance (which filters on nothing) --
-- the moment that ledger carries a balance, Assets = Liabilities + Capital +
-- Profit breaks by exactly that amount (finding F1). Separately,
-- seed_accounting_defaults() already seeds a correctly-grouped
-- "Stock-in-Hand" account_groups row (Current Assets) that nothing ever
-- pointed a ledger at.
--
-- This migration does NOT build the real Stock-in-Hand ledger usage --
-- that's Phase 2, alongside a period-close "Dr Stock-in-Hand / Cr Closing
-- Stock" journal and removing the synthetic Closing Stock figure. Doing
-- Phase 1's ledger-grouping fix alone, while adjustments keep posting real
-- money to that asset ledger, would make the Balance Sheet double-count
-- stock (synthetic Closing Stock + real Stock-in-Hand balance, same physical
-- goods) -- finding F2. So Phase 1 leaves Stock-in-Hand seeded and dormant,
-- and re-routes inventory-adjustment/stock-take accounting through a new
-- "Stock Adjustment" expense ledger contra'd against Purchase Account
-- instead: decrease (shrinkage/damage) = Dr Stock Adjustment / Cr Purchase
-- Account (lowers periodic COGS, which is Opening + Purchases − Closing);
-- increase (found stock) = Dr Purchase Account / Cr Stock Adjustment. This
-- also fixes F5 (previously an *increase* posted a bare credit to
-- Miscellaneous Expense -- an expense ledger on its non-natural side with no
-- contra reasoning -- and mixed shrinkage with unrelated office costs).
--
-- Also folded in here, same root cause class (both RPCs were written before
-- their sibling call-sites were fixed for the same bug elsewhere):
--   F6 -- both RPCs call next_voucher_number(auth.uid(), 'stock_journal')
--   with no _business_id, so numbering falls back to the caller's *first*
--   business (_user_default_business), not the business being posted to.
--   Every other RPC caller was already fixed to pass _business_id explicitly
--   in 20260816160000_business_scoped_voucher_numbering.sql; these two were
--   missed.
--   F7 -- both RPCs compute unit cost as
--   COALESCE(NULLIF(cost_price,0), NULLIF(purchase_price,0)), reversed order
--   and missing the dealer_rate/mrp fallback vs. the shared
--   opening_stock_unit_cost() (purchase_price -> cost_price -> dealer_rate ->
--   mrp -> 0) used everywhere else in the codebase (opening stock, closing
--   stock valuation). A product priced only by MRP got a valued opening
--   entry but a silently unvalued adjustment.

-- ── A. Backfill NULL group_id on ledger_accounts ───────────────────────────
-- Name-match every orphaned ledger (incl. the 2 known ad-hoc Stock-in-Hand
-- rows below, both zero-balance) to the same-named system group in its
-- business. Anything left NULL afterward is a genuine oddity (custom ledger
-- with no matching group name) -- surfaced via NOTICE, not guessed at.
UPDATE public.ledger_accounts la
SET group_id = g.id
FROM public.account_groups g
WHERE la.group_id IS NULL
  AND g.business_id IS NOT DISTINCT FROM la.business_id
  AND g.is_system = true
  AND g.name = la.name;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, business_id, name FROM public.ledger_accounts WHERE group_id IS NULL LOOP
    RAISE NOTICE 'ledger_accounts % (business %, name %) still has NULL group_id after name-match backfill -- needs manual triage before the group_id guard constraint can be added', r.id, r.business_id, r.name;
  END LOOP;
END $$;

-- ── B. Seed the "Stock Adjustment" ledger (Direct Expenses) ────────────────
-- Same treatment as Opening Stock in 20260817140000: rewrite
-- seed_accounting_defaults() wholesale for new businesses, plus a one-off
-- backfill INSERT for already-seeded ones (which early-return out of the
-- function entirely).

CREATE OR REPLACE FUNCTION public.seed_accounting_defaults(_user_id uuid, _business_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_biz uuid;
  g_assets uuid; g_liab uuid; g_inc uuid; g_exp uuid; g_cap uuid;
  g_cash uuid; g_bank uuid; g_deb uuid; g_stock uuid; g_fixed uuid;
  g_cred uuid; g_loans uuid; g_taxes uuid;
  g_sales uuid; g_oinc uuid;
  g_pur uuid; g_dexp uuid; g_iexp uuid;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));

  IF v_biz IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.account_groups WHERE is_system AND business_id = v_biz) THEN
      RETURN;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.account_groups WHERE user_id = _user_id AND is_system AND business_id IS NULL) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Assets', 'asset', true, 'asset') RETURNING id INTO g_assets;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Liabilities', 'liability', true, 'liability') RETURNING id INTO g_liab;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Income', 'income', true, 'income') RETURNING id INTO g_inc;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Expenses', 'expense', true, 'expense') RETURNING id INTO g_exp;
  INSERT INTO public.account_groups (user_id, business_id, name, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Capital', 'capital', true, 'equity') RETURNING id INTO g_cap;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Cash', g_assets, 'asset', true, 'cash') RETURNING id INTO g_cash;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Bank', g_assets, 'asset', true, 'bank') RETURNING id INTO g_bank;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Sundry Debtors', g_assets, 'asset', true, 'customer') RETURNING id INTO g_deb;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Stock-in-Hand', g_assets, 'asset', true, 'asset') RETURNING id INTO g_stock;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Fixed Assets', g_assets, 'asset', true, 'asset') RETURNING id INTO g_fixed;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Sundry Creditors', g_liab, 'liability', true, 'supplier') RETURNING id INTO g_cred;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Loans', g_liab, 'liability', true, 'liability') RETURNING id INTO g_loans;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Duties & Taxes', g_liab, 'liability', true, 'tax') RETURNING id INTO g_taxes;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Sales Accounts', g_inc, 'income', true, 'sales') RETURNING id INTO g_sales;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Other Income', g_inc, 'income', true, 'income') RETURNING id INTO g_oinc;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Purchase Accounts', g_exp, 'expense', true, 'purchase') RETURNING id INTO g_pur;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Direct Expenses', g_exp, 'expense', true, 'expense') RETURNING id INTO g_dexp;
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Indirect Expenses', g_exp, 'expense', true, 'expense') RETURNING id INTO g_iexp;

  INSERT INTO public.ledger_accounts (user_id, business_id, name, group_id, ledger_type, is_system) VALUES
    (_user_id, v_biz, 'Cash Account', g_cash, 'cash', true),
    (_user_id, v_biz, 'Sales Account', g_sales, 'income', true),
    (_user_id, v_biz, 'Purchase Account', g_pur, 'expense', true),
    -- Trading-account debit for stock a business starts out holding. Direct
    -- Expenses (not Stock-in-Hand) because it is the Opening Stock *charge*,
    -- and the reports' synthetic Closing Stock line is its credit side.
    (_user_id, v_biz, 'Opening Stock', g_dexp, 'expense', true),
    -- Phase 1 (F1/F2/F5): dedicated contra for inventory-adjustment/
    -- stock-take variances, against Purchase Account -- never against
    -- Stock-in-Hand, which stays dormant until the Phase 2 period-close
    -- journal exists to source it correctly.
    (_user_id, v_biz, 'Stock Adjustment', g_dexp, 'expense', true),
    (_user_id, v_biz, 'CGST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'SGST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'IGST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'CGST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'SGST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'IGST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'GST Output', g_taxes, 'gst_output', true),
    (_user_id, v_biz, 'GST Input', g_taxes, 'gst_input', true),
    (_user_id, v_biz, 'Round Off', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Capital Account', g_cap, 'capital', true),
    (_user_id, v_biz, 'Salary Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Rent Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Electricity Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Fuel Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Courier Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Office Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Advertisement Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Printing & Stationery', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Internet Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Repairs & Maintenance', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Bank Charges', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Miscellaneous Expense', g_iexp, 'expense', true),
    (_user_id, v_biz, 'Interest Received', g_oinc, 'income', true),
    (_user_id, v_biz, 'Commission Received', g_oinc, 'income', true),
    (_user_id, v_biz, 'Discount Received', g_oinc, 'income', true)
  ON CONFLICT (business_id, name) DO NOTHING;
END
$function$;

-- Already-seeded businesses early-return out of the function above, so they
-- never get the new ledger from it. Opening_balance/current_balance are left
-- at their 0 defaults -- no existing report figure moves.
INSERT INTO public.ledger_accounts (user_id, business_id, name, group_id, ledger_type, is_system)
SELECT g.user_id, g.business_id, 'Stock Adjustment', g.id, 'expense', true
FROM public.account_groups g
WHERE g.name = 'Direct Expenses' AND g.is_system AND g.business_id IS NOT NULL
ON CONFLICT (business_id, name) DO NOTHING;

-- ── C. create_inventory_adjustment(): drop Stock-in-Hand posting, fix F5/F6/F7 ──

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
  v_purchase_ledger uuid;
  v_adj_ledger uuid;
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

  select coalesce(stock, 0) into v_before
  from public.products where id = _product_id and business_id = _business_id;
  if v_before is null then
    raise exception 'Product not found for this business';
  end if;

  -- F7: shared cost basis (purchase_price -> cost_price -> dealer_rate ->
  -- mrp -> 0), same function opening stock and closing-stock valuation use.
  -- opening_stock_unit_cost() returns 0 (not NULL) when nothing is set;
  -- translate back to NULL to preserve this RPC's existing "no value to
  -- post, skip the stock journal" behavior.
  select public.opening_stock_unit_cost(purchase_price, cost_price, dealer_rate, mrp) into v_cost
  from public.products where id = _product_id and business_id = _business_id;
  if v_cost = 0 then
    v_cost := null;
  end if;

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

  -- Only post a Stock Journal voucher when we have a real cost to value it
  -- with -- never fabricate a ₹0 ledger entry.
  --
  -- Phase 1 (F1/F2/F5): contra against Purchase Account, never
  -- Stock-in-Hand. Decrease (shrinkage/damage) = Dr Stock Adjustment / Cr
  -- Purchase Account, lowering periodic COGS (Opening + Purchases -
  -- Closing). Increase (found stock) mirrors it. Stock-in-Hand stays
  -- seeded-but-dormant until Phase 2's period-close journal exists to
  -- source it correctly -- posting real money to it here would make the
  -- Balance Sheet double-count stock against the synthetic Closing Stock
  -- figure it already adds.
  if v_cost is not null and v_value > 0 then
    perform public.seed_accounting_defaults(auth.uid(), _business_id);
    select id into v_purchase_ledger from public.ledger_accounts where business_id = _business_id and name = 'Purchase Account' limit 1;
    select id into v_adj_ledger from public.ledger_accounts where business_id = _business_id and name = 'Stock Adjustment' limit 1;

    v_number := public.next_voucher_number(auth.uid(), 'stock_journal', _business_id);
    insert into public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    values (auth.uid(), _business_id, v_number, 'stock_journal', current_date,
      'Stock ' || _adjustment_type || ' — ' || coalesce(_reason, v_number), v_id, 'inventory_adjustment', v_value, 'posted')
    returning id into v_voucher;

    if _adjustment_type = 'decrease' then
      insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      values (auth.uid(), _business_id, v_voucher, v_adj_ledger, v_value, 0, 1);
      if v_purchase_ledger is not null then
        insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        values (auth.uid(), _business_id, v_voucher, v_purchase_ledger, 0, v_value, 2);
      end if;
    else
      if v_purchase_ledger is not null then
        insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        values (auth.uid(), _business_id, v_voucher, v_purchase_ledger, v_value, 0, 1);
      end if;
      insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      values (auth.uid(), _business_id, v_voucher, v_adj_ledger, 0, v_value, 2);
    end if;

    update public.inventory_adjustments set voucher_id = v_voucher where id = v_id;
  end if;

  return v_id;
end;
$function$;

-- ── D. post_stock_take(): same journal/numbering/cost fix as C ─────────────

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
  v_purchase_ledger uuid;
  v_adj_ledger uuid;
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
  SELECT id INTO v_purchase_ledger FROM public.ledger_accounts WHERE business_id = v_sheet.business_id AND name = 'Purchase Account' LIMIT 1;
  SELECT id INTO v_adj_ledger FROM public.ledger_accounts WHERE business_id = v_sheet.business_id AND name = 'Stock Adjustment' LIMIT 1;

  v_number := public.next_voucher_number(auth.uid(), 'stock_journal', v_sheet.business_id);
  INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
  VALUES (auth.uid(), v_sheet.business_id, v_number, 'stock_journal', COALESCE(v_sheet.count_date, CURRENT_DATE),
    'Stock take variance — ' || COALESCE(v_sheet.sheet_no, _sheet_id::text), _sheet_id, 'stock_take', 0, 'draft')
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

    -- F7: shared cost basis, see create_inventory_adjustment() above.
    SELECT public.opening_stock_unit_cost(purchase_price, cost_price, dealer_rate, mrp) INTO v_cost
    FROM public.products WHERE id = v_item.product_id;
    IF v_cost = 0 THEN
      v_cost := NULL;
    END IF;

    IF v_cost IS NOT NULL THEN
      v_value := ABS(v_delta) * v_cost;
      IF v_value > 0 THEN
        v_total_value := v_total_value + v_value;
        -- Phase 1 (F1/F2/F5): contra against Purchase Account, never
        -- Stock-in-Hand -- see create_inventory_adjustment() above for the
        -- full reasoning.
        IF v_delta > 0 THEN
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_purchase_ledger, v_value, 0, v_position);
          v_position := v_position + 1;
          IF v_adj_ledger IS NOT NULL THEN
            INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
            VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_adj_ledger, 0, v_value, v_position);
            v_position := v_position + 1;
          END IF;
        ELSE
          IF v_adj_ledger IS NOT NULL THEN
            INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
            VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_adj_ledger, v_value, 0, v_position);
            v_position := v_position + 1;
          END IF;
          INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
          VALUES (auth.uid(), v_sheet.business_id, v_voucher, v_purchase_ledger, 0, v_value, v_position);
          v_position := v_position + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_total_value > 0 THEN
    UPDATE public.vouchers SET total_amount = v_total_value, status = 'posted' WHERE id = v_voucher;
    UPDATE public.stock_take_sheets SET voucher_id = v_voucher WHERE id = _sheet_id;
  ELSE
    DELETE FROM public.vouchers WHERE id = v_voucher;
  END IF;

  UPDATE public.stock_take_sheets
    SET status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_at = now()
    WHERE id = _sheet_id;
END;
$function$;

-- ── E. Guard: no NULL group_id, added only if step A left none ─────────────
-- CHECK (not a column NOT NULL rewrite) so it can be added NOT VALID then
-- VALIDATEd without a long table lock. Conditional so this migration can't
-- fail to apply in production just because some unrelated legacy row is
-- still NULL after the name-match backfill -- that case surfaces via the
-- NOTICEs in step A instead, as a trigger for manual follow-up.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ledger_accounts WHERE group_id IS NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_accounts_group_id_not_null') THEN
      ALTER TABLE public.ledger_accounts
        ADD CONSTRAINT ledger_accounts_group_id_not_null CHECK (group_id IS NOT NULL) NOT VALID;
      ALTER TABLE public.ledger_accounts VALIDATE CONSTRAINT ledger_accounts_group_id_not_null;
    END IF;
  ELSE
    RAISE NOTICE 'Skipping ledger_accounts group_id NOT NULL guard: NULL rows remain after backfill, see prior NOTICEs';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
