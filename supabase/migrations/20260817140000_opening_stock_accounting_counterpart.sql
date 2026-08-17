-- Opening stock entered no accounting entry at all.
--
-- products_initial_movement() (see
-- supabase/migrations/20260606105321_*.sql) fired AFTER INSERT ON products
-- and wrote exactly one inventory_movements row -- movement_type 'initial',
-- reference_type 'product_create', and rate/value left at 0. No voucher, no
-- voucher_items, no ledger touched. So a product created with opening stock
-- put units into inventory entirely OUTSIDE double entry.
--
-- That is not a cosmetic gap. BalanceSheet.tsx / ProfitLoss.tsx /
-- BusinessHealthLayer.tsx all add computeClosingStockValue(products) as a
-- synthetic Closing Stock figure, and netProfitWithInventory() counts it as
-- income. With no opposing entry anywhere in the books, the whole value of
-- that stock surfaced as Net Profit -- shown under the "Capital" group on
-- the Balance Sheet, which is what made it look like a Capital Account
-- balance even though that ledger was genuinely 0/0. Confirmed live on
-- BOOTSTRAP FIX VERIFY TEST: every voucher cancelled, every ledger
-- current_balance 0, one product at 100 units, and a ₹18,000 "Capital"
-- figure with nothing behind it.
--
-- Treatment: the same one a purchase already gets. Opening stock is a
-- Trading-account debit funded by the owner --
--
--   Dr  Opening Stock   (Direct Expenses)   <- cost value of the stock
--     Cr  Capital Account (Capital)
--
-- In the P&L that Opening Stock expense cancels against the Closing Stock
-- income the reports already synthesise, so Net Profit returns to 0; on the
-- Balance Sheet the stock asset is now matched by real Capital. No change
-- to how any report aggregates -- BalanceSheet/ProfitLoss keep passing
-- openingStock = 0 to computeInventoryAdjustedProfitLoss, because this
-- posts a real expense *ledger* that computeProfitLoss already picks up;
-- routing it through that parameter as well would double-count it.
--
-- Cost basis matches computeClosingStockValue()'s (first positive of
-- purchase_price, cost_price, dealer_rate, mrp) so the opening debit and
-- the closing-stock credit are always the same number and net to exactly
-- zero. Valuing the debit at cost while the reports valued closing stock at
-- dealer_rate would have left the margin behind as phantom profit -- the
-- two halves of this fix only work together.
--
-- FIX-FORWARD ONLY. No backfill: businesses that already carry
-- counterpart-less opening stock keep their current books untouched, and
-- their owners can post the opening entry themselves. The only thing this
-- migration writes to existing businesses is the Opening Stock ledger row
-- itself, at zero balance -- no voucher, no balance, no report figure moves.

-- ── 1. Seed the Opening Stock ledger for new businesses ───────────────────
-- Rewritten wholesale (not ALTERed) because seed_accounting_defaults() is a
-- single monolithic function; only the ledger_accounts VALUES list changes,
-- and it early-returns on already-seeded businesses exactly as before.

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

-- ── 2. Give already-seeded businesses the same ledger ─────────────────────
-- seed_accounting_defaults() early-returns for them, so they would never
-- get it and the trigger below would have nothing to debit. This adds the
-- ledger row only -- opening_balance and current_balance are left at their
-- 0 defaults, so no existing report figure changes.

INSERT INTO public.ledger_accounts (user_id, business_id, name, group_id, ledger_type, is_system)
SELECT g.user_id, g.business_id, 'Opening Stock', g.id, 'expense', true
FROM public.account_groups g
WHERE g.name = 'Direct Expenses' AND g.is_system AND g.business_id IS NOT NULL
ON CONFLICT (business_id, name) DO NOTHING;

-- ── 3. Post the counterpart voucher alongside the initial movement ────────

CREATE OR REPLACE FUNCTION public.products_initial_movement()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_cost numeric;
  v_value numeric;
  v_opening_ledger uuid;
  v_capital_ledger uuid;
  v_voucher_id uuid;
  v_voucher_no text;
BEGIN
  INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes, rate, value)
  VALUES (NEW.user_id, NEW.business_id, NEW.id, 'initial', COALESCE(NEW.stock,0), 0, COALESCE(NEW.stock,0), NEW.id, 'product_create', 'Product created',
          COALESCE(NULLIF(NEW.purchase_price,0), NULLIF(NEW.cost_price,0), NULLIF(NEW.dealer_rate,0), NULLIF(NEW.mrp,0), 0),
          ROUND(COALESCE(NEW.stock,0) * COALESCE(NULLIF(NEW.purchase_price,0), NULLIF(NEW.cost_price,0), NULLIF(NEW.dealer_rate,0), NULLIF(NEW.mrp,0), 0), 2));

  IF NEW.business_id IS NULL OR COALESCE(NEW.stock,0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Same chain as computeClosingStockValue()'s unitCost(): first POSITIVE
  -- value, because a 0 in a price column means "not entered" here, not a
  -- genuine ₹0 cost.
  v_cost := COALESCE(NULLIF(NEW.purchase_price,0), NULLIF(NEW.cost_price,0), NULLIF(NEW.dealer_rate,0), NULLIF(NEW.mrp,0), 0);
  v_value := ROUND(COALESCE(NEW.stock,0) * v_cost, 2);
  IF v_value <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_opening_ledger FROM public.ledger_accounts
   WHERE business_id = NEW.business_id AND name = 'Opening Stock' LIMIT 1;
  SELECT id INTO v_capital_ledger FROM public.ledger_accounts
   WHERE business_id = NEW.business_id AND name = 'Capital Account' LIMIT 1;

  -- Never block product creation on something this posting can't do. Two
  -- cases, both falling back to "behave exactly as before this migration"
  -- rather than to a worse state:
  --
  --  a) chart of accounts out of reach -- a business with no Direct
  --     Expenses group, or one whose Capital Account was renamed.
  --  b) no authenticated business member -- a service-role or migration
  --     context has auth.uid() = NULL, and next_voucher_number() raises
  --     'Not authorized' on its is_business_member() check. Letting that
  --     propagate would make this trigger break admin/back-office product
  --     inserts that work fine today.
  IF v_opening_ledger IS NULL OR v_capital_ledger IS NULL OR NOT public.is_business_member(NEW.business_id) THEN
    RAISE WARNING 'products_initial_movement: opening stock for product % (business %) left unposted -- missing Opening Stock/Capital Account ledger, or no authenticated business member', NEW.id, NEW.business_id;
    RETURN NEW;
  END IF;

  v_voucher_no := public.next_voucher_number(NEW.user_id, 'opening_balance', NEW.business_id);

  -- Header first, already status='posted', then items -- the order
  -- voucher_items_balance_trigger() requires to apply the ledger delta (it
  -- reads the parent voucher's status per item; see
  -- 20260804120000_fix_ledger_balance_trigger_and_status_sync.sql). Same
  -- shape as the five existing SQL auto-post paths.
  INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, total_amount, status, reference_type, reference_id, created_by)
  VALUES (NEW.user_id, NEW.business_id, v_voucher_no, 'opening_balance', CURRENT_DATE,
          'Opening stock: ' || COALESCE(NEW.name, NEW.part_number, 'product') || ' — ' || COALESCE(NEW.stock,0) || ' @ ' || v_cost,
          v_value, 'posted', 'product_opening_stock', NEW.id, NEW.user_id)
  RETURNING id INTO v_voucher_id;

  INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
  VALUES (NEW.user_id, NEW.business_id, v_voucher_id, v_opening_ledger, v_value, 0, 1),
         (NEW.user_id, NEW.business_id, v_voucher_id, v_capital_ledger, 0, v_value, 2);

  RETURN NEW;
END $function$;
