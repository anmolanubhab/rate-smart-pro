-- Phase 2 — Period Close (accounting-architecture audit follow-up, 2026-08-18):
-- Phase 1 left "Stock-in-Hand" seeded but dormant -- posting real money to it
-- then would have made the Balance Sheet double-count stock, since every
-- report still computed a synthetic "Closing Stock" figure from
-- products.stock at render time. This migration is what Phase 1's own
-- comments promised: close_financial_year() now actually posts a real
-- closing-stock journal, and does so INSIDE the existing financial-year
-- infrastructure (financial_years / year_closing_entries /
-- enforce_financial_year_lock(), all already live -- see
-- 20260810141000_accounting_financial_year_management.sql) rather than a new
-- parallel workflow. That migration's own comment on close_financial_year()
-- said "Never auto-generates a P&L-transfer/closing voucher... purely a
-- lock" -- this migration is exactly that promised follow-up.
--
-- Both financial_years and year_closing_entries have ZERO rows in
-- production today: no business has ever opened or closed a year. That is
-- why the report-side change (src/lib/accounting.ts's new
-- hasRealStockLedger(), wired into BalanceSheet.tsx/ProfitLoss.tsx/
-- BusinessHealthLayer.tsx in this same change) is conditional: the
-- synthetic figure keeps working exactly as today for every business until
-- THAT business actually closes its first period and a real Stock-in-Hand
-- ledger row exists for it. Nothing regresses for anyone who hasn't opted in.
--
-- What close_financial_year() now does, before its existing Trial-Balance
-- check and is_closed flip (both new steps skip posting a ₹0 voucher, same
-- convention used everywhere else in this codebase):
--
--   a) Carry-forward transfer (only if Stock-in-Hand already carries a
--      balance, i.e. a prior period closed before this one):
--        Dr Opening Stock (Direct Expenses)   <- whatever Stock-in-Hand holds
--          Cr Stock-in-Hand (Current Assets)
--      Dated at this FY's start_date. Stock-in-Hand is dormant to every
--      other code path (Phase 1's own guarantee), so whatever balance sits
--      there when a close runs can only be "the previous period's closing
--      figure" -- no separate bookkeeping of "which FY closed last" is
--      needed, the ledger balance IS the source of truth. First-ever close
--      for a business: balance is 0, step is skipped.
--
--   b) This period's own closing entry (only if a fresh valuation is > 0):
--        Dr Stock-in-Hand (Current Assets)
--          Cr Closing Stock (new Direct Income group)
--      Dated at this FY's end_date. Valued via the same shared
--      opening_stock_unit_cost() Phase 1 already wired into
--      create_inventory_adjustment()/post_stock_take() -- purchase_price ->
--      cost_price -> dealer_rate -> mrp -> 0, first positive wins.
--
-- Both post as ordinary vouchers, so they get the standard cancelVoucher()/
-- trg_vouchers_sync_balance_on_status_change reversal machinery for free --
-- no bespoke reversal code (matches the codebase's established lesson from
-- the GRN-cancel double-reversal bug: reversal belongs to exactly one
-- mechanism, never duplicated). Both steps run before is_closed is set to
-- true in the same transaction, so enforce_financial_year_lock() does not
-- block either insert (the FY isn't closed yet when they're dated inside
-- it), and if the existing TB-balance check fails afterward, the whole
-- transaction -- including these two postings -- rolls back atomically.

-- ── 1. Seed "Direct Income" group + "Closing Stock" ledger ─────────────────
-- Direct Income is the income-side mirror of the existing Direct Expenses
-- group (which is why Opening Stock lives there instead of in ordinary P&L
-- expenses): Closing Stock is a Trading-account item, not real revenue
-- (Sales Accounts) or passive income (Other Income), so it gets its own
-- parallel group rather than living in either.

CREATE OR REPLACE FUNCTION public.seed_accounting_defaults(_user_id uuid, _business_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_biz uuid;
  g_assets uuid; g_liab uuid; g_inc uuid; g_exp uuid; g_cap uuid;
  g_cash uuid; g_bank uuid; g_deb uuid; g_stock uuid; g_fixed uuid;
  g_cred uuid; g_loans uuid; g_taxes uuid;
  g_sales uuid; g_oinc uuid; g_dinc uuid;
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
  -- Phase 2: Trading-account income mirror of Direct Expenses. Only ledger
  -- seeded here today is Closing Stock; kept as its own group (not folded
  -- into Other Income) so it stays trivially distinguishable in the Income
  -- statement and Trial Balance, same reasoning as Direct Expenses vs
  -- Indirect Expenses.
  INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type) VALUES (_user_id, v_biz, 'Direct Income', g_inc, 'income', true, 'income') RETURNING id INTO g_dinc;
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
    -- Stock-in-Hand, which stays dormant until a period close posts to it.
    (_user_id, v_biz, 'Stock Adjustment', g_dexp, 'expense', true),
    -- Phase 2: Trading-account credit posted by close_financial_year() at
    -- period close. Stock-in-Hand itself is NOT seeded here -- it is
    -- created for the first time ever by close_financial_year() the moment
    -- a business actually closes a period, pointed at the Stock-in-Hand
    -- group above.
    (_user_id, v_biz, 'Closing Stock', g_dinc, 'income', true),
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

-- Already-seeded businesses early-return out of the function above. Backfill
-- the Direct Income group + Closing Stock ledger for them the same way
-- Phase 1 backfilled Stock Adjustment. Balances stay at 0 -- no report
-- figure moves until this business actually closes a period.
DO $$
DECLARE
  r record;
  g_dinc uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT g.user_id, g.business_id
    FROM public.account_groups g
    WHERE g.name = 'Income' AND g.is_system AND g.business_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.account_groups g2
        WHERE g2.business_id = g.business_id AND g2.name = 'Direct Income' AND g2.is_system
      )
  LOOP
    INSERT INTO public.account_groups (user_id, business_id, name, parent_id, nature, is_system, account_type)
    SELECT r.user_id, r.business_id, 'Direct Income', g.id, 'income', true, 'income'
    FROM public.account_groups g
    WHERE g.business_id = r.business_id AND g.name = 'Income' AND g.is_system
    RETURNING id INTO g_dinc;

    INSERT INTO public.ledger_accounts (user_id, business_id, name, group_id, ledger_type, is_system)
    VALUES (r.user_id, r.business_id, 'Closing Stock', g_dinc, 'income', true)
    ON CONFLICT (business_id, name) DO NOTHING;
  END LOOP;
END $$;

-- ── 2. next_voucher_number(): add the closing_stock prefix branch ──────────

CREATE OR REPLACE FUNCTION public.next_voucher_number(
  _user_id uuid,
  _voucher_type text,
  _business_id uuid DEFAULT NULL
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_biz uuid;
  v_prefix text;
  v_seq integer;
  v_series_id uuid;
  v_series_prefix text;
  v_series_suffix text;
  v_series_padding integer;
  v_reset_yearly boolean;
  v_fy_start_month integer;
  v_fy_token text;
  v_fy_start_year integer;
  v_max_existing integer;
BEGIN
  IF _business_id IS NOT NULL THEN
    v_biz := _business_id;
  ELSE
    BEGIN
      v_biz := public._user_default_business(_user_id);
    EXCEPTION WHEN undefined_function THEN
      v_biz := NULL;
    END;
  END IF;

  IF v_biz IS NOT NULL AND NOT public.is_business_member(v_biz) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  SELECT id, prefix, suffix, padding, reset_yearly, fy_start_month
    INTO v_series_id, v_series_prefix, v_series_suffix, v_series_padding, v_reset_yearly, v_fy_start_month
  FROM public.voucher_number_series
  WHERE user_id = _user_id
    AND lower(voucher_type) = lower(_voucher_type)
    AND business_id IS NOT DISTINCT FROM v_biz
    AND is_default = true
  LIMIT 1;

  IF v_series_id IS NOT NULL THEN
    IF v_reset_yearly THEN
      v_fy_start_year := EXTRACT(YEAR FROM now())::int
        - CASE WHEN EXTRACT(MONTH FROM now())::int >= v_fy_start_month THEN 0 ELSE 1 END;
      v_fy_token := v_fy_start_year::text || '-' || lpad(((v_fy_start_year + 1) % 100)::text, 2, '0');
    ELSE
      v_fy_token := NULL;
    END IF;

    WITH cur AS (
      SELECT next_number, fy_token FROM public.voucher_number_series WHERE id = v_series_id FOR UPDATE
    ), computed AS (
      SELECT CASE
        WHEN v_reset_yearly AND cur.fy_token IS NOT NULL AND cur.fy_token IS DISTINCT FROM v_fy_token
        THEN 1 ELSE cur.next_number END AS v_start
      FROM cur
    )
    UPDATE public.voucher_number_series s
       SET next_number = computed.v_start + 1,
           fy_token = CASE WHEN v_reset_yearly THEN v_fy_token ELSE s.fy_token END
      FROM computed
     WHERE s.id = v_series_id
    RETURNING computed.v_start INTO v_seq;

    RETURN COALESCE(v_series_prefix, '')
        || lpad(v_seq::text, GREATEST(COALESCE(v_series_padding, 4), 1), '0')
        || COALESCE(v_series_suffix, '');
  END IF;

  v_prefix := CASE lower(_voucher_type)
    WHEN 'sales' THEN 'SV' WHEN 'purchase' THEN 'PV' WHEN 'receipt' THEN 'RV'
    WHEN 'payment' THEN 'PMT' WHEN 'contra' THEN 'CV' WHEN 'journal' THEN 'JV'
    WHEN 'debit_note' THEN 'DN' WHEN 'credit_note' THEN 'CN'
    WHEN 'opening_balance' THEN 'OB'
    -- Phase 2: closing-stock journal posted by close_financial_year().
    WHEN 'closing_stock' THEN 'CS'
    ELSE upper(left(_voucher_type, 3)) END;

  SELECT MAX((regexp_match(voucher_number, '(\d+)$'))[1]::int)
    INTO v_max_existing
  FROM public.vouchers
  WHERE business_id IS NOT DISTINCT FROM v_biz
    AND lower(voucher_type::text) = lower(_voucher_type);

  INSERT INTO public.voucher_number_counters (business_id, voucher_type, next_seq)
  VALUES (v_biz, lower(_voucher_type), COALESCE(v_max_existing, 0) + 2)
  ON CONFLICT (business_id, voucher_type) DO UPDATE
    SET next_seq = public.voucher_number_counters.next_seq + 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;

-- ── 3. close_financial_year(): post the two journals before locking ────────

CREATE OR REPLACE FUNCTION public.close_financial_year(_financial_year_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fy record;
  v_tot_dr numeric;
  v_tot_cr numeric;
  v_diff numeric;
  v_stock_group uuid;
  v_stock_ledger uuid;
  v_opening_ledger uuid;
  v_closing_ledger uuid;
  v_prior_balance numeric;
  v_closing_value numeric;
  v_number text;
  v_voucher uuid;
BEGIN
  SELECT * INTO v_fy FROM public.financial_years WHERE id = _financial_year_id;
  IF v_fy IS NULL THEN
    RAISE EXCEPTION 'Financial year not found';
  END IF;
  IF NOT public.has_business_role(v_fy.business_id, ARRAY['owner','admin','manager']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to manage financial years for this business';
  END IF;
  IF v_fy.is_closed THEN
    RAISE EXCEPTION 'Financial year is already closed';
  END IF;

  PERFORM public.seed_accounting_defaults(auth.uid(), v_fy.business_id);

  -- Stock-in-Hand ledger is created here, for the first time ever, pointed
  -- at the group Phase 1 guarantees is already seeded correctly. No other
  -- code path creates this ledger.
  SELECT id INTO v_stock_ledger FROM public.ledger_accounts WHERE business_id = v_fy.business_id AND name = 'Stock-in-Hand' LIMIT 1;
  IF v_stock_ledger IS NULL THEN
    SELECT id INTO v_stock_group FROM public.account_groups WHERE business_id = v_fy.business_id AND name = 'Stock-in-Hand' AND is_system LIMIT 1;
    INSERT INTO public.ledger_accounts (business_id, user_id, name, group_id, ledger_type, is_system)
    SELECT v_fy.business_id, auth.uid(), 'Stock-in-Hand', v_stock_group, 'asset', true
    WHERE NOT EXISTS (SELECT 1 FROM public.ledger_accounts WHERE business_id = v_fy.business_id AND name = 'Stock-in-Hand')
    RETURNING id INTO v_stock_ledger;
  END IF;

  SELECT id INTO v_opening_ledger FROM public.ledger_accounts WHERE business_id = v_fy.business_id AND name = 'Opening Stock' LIMIT 1;
  SELECT id INTO v_closing_ledger FROM public.ledger_accounts WHERE business_id = v_fy.business_id AND name = 'Closing Stock' LIMIT 1;

  -- (a) Carry-forward transfer: whatever Stock-in-Hand currently holds can
  -- only be a prior period's closing figure (Phase 1 keeps it dormant to
  -- every other code path) -- transfer it into this period's Opening Stock
  -- and zero the asset back out, ready to be rebuilt by step (b) below.
  -- Skipped on a business's first-ever close (balance is 0).
  SELECT current_balance INTO v_prior_balance FROM public.ledger_accounts WHERE id = v_stock_ledger;
  v_prior_balance := COALESCE(v_prior_balance, 0);

  IF v_prior_balance > 0 AND v_opening_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(auth.uid(), 'opening_balance', v_fy.business_id);
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (auth.uid(), v_fy.business_id, v_number, 'opening_balance', v_fy.start_date,
      'Opening stock carried forward — ' || v_fy.fy_name, _financial_year_id, 'period_opening_transfer', v_prior_balance, 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (auth.uid(), v_fy.business_id, v_voucher, v_opening_ledger, v_prior_balance, 0, 1),
           (auth.uid(), v_fy.business_id, v_voucher, v_stock_ledger, 0, v_prior_balance, 2);

    INSERT INTO public.year_closing_entries (business_id, financial_year_id, closing_type, voucher_id)
    VALUES (v_fy.business_id, _financial_year_id, 'opening_transfer', v_voucher);
  END IF;

  -- (b) This period's own closing entry, valued fresh via the same shared
  -- cost function every other posting path uses.
  SELECT COALESCE(SUM(p.stock * public.opening_stock_unit_cost(p.purchase_price, p.cost_price, p.dealer_rate, p.mrp)), 0)
    INTO v_closing_value
  FROM public.products p
  WHERE p.business_id = v_fy.business_id AND p.is_deleted IS NOT TRUE AND p.stock > 0;

  IF v_closing_value > 0 AND v_closing_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(auth.uid(), 'closing_stock', v_fy.business_id);
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (auth.uid(), v_fy.business_id, v_number, 'closing_stock', v_fy.end_date,
      'Closing stock — ' || v_fy.fy_name, _financial_year_id, 'period_closing_stock', v_closing_value, 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (auth.uid(), v_fy.business_id, v_voucher, v_stock_ledger, v_closing_value, 0, 1),
           (auth.uid(), v_fy.business_id, v_voucher, v_closing_ledger, 0, v_closing_value, 2);

    INSERT INTO public.year_closing_entries (business_id, financial_year_id, closing_type, voucher_id)
    VALUES (v_fy.business_id, _financial_year_id, 'stock_closing', v_voucher);
  END IF;

  -- Same Trial Balance math as fetchLedgersWithBalance()/TrialBalance.tsx,
  -- now naturally including whatever was just posted above.
  SELECT
    COALESCE(SUM(GREATEST(bal, 0)), 0),
    COALESCE(SUM(GREATEST(-bal, 0)), 0)
  INTO v_tot_dr, v_tot_cr
  FROM (
    SELECT
      (COALESCE(opening_balance, 0) * CASE WHEN opening_balance_type = 'cr' THEN -1 ELSE 1 END)
      + COALESCE(current_balance, 0) AS bal
    FROM public.ledger_accounts
    WHERE business_id = v_fy.business_id
  ) t;

  v_diff := ABS(v_tot_dr - v_tot_cr);
  IF v_diff >= 0.01 THEN
    RAISE EXCEPTION 'Cannot close: Trial Balance is not balanced (Debit % vs Credit %, difference %)', v_tot_dr, v_tot_cr, v_diff;
  END IF;

  UPDATE public.financial_years
  SET is_closed = true, is_current = false, closed_at = now(), closed_by = auth.uid()
  WHERE id = _financial_year_id;

  INSERT INTO public.year_closing_entries (business_id, financial_year_id, closing_type)
  VALUES (v_fy.business_id, _financial_year_id, 'year_end_close');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.close_financial_year(uuid) FROM PUBLIC, anon;

-- ── 4. get_stock_valuation(): same shared cost function everywhere ─────────
-- Was its own COALESCE(purchase_price, cost_price, dealer_rate, 0) -- no mrp
-- fallback, and a stored literal 0 wasn't skipped the way
-- opening_stock_unit_cost() (and computeClosingStockValue() in
-- src/lib/accounting.ts) already treat a 0 price column as "not entered".
-- This is what makes Balance Sheet / Trial Balance / Stock Valuation read
-- the same cost basis everywhere (Phase 2 item 7).

CREATE OR REPLACE FUNCTION public.get_stock_valuation(p_business_id uuid, p_as_of_date date DEFAULT CURRENT_DATE, p_warehouse_id uuid DEFAULT NULL::uuid, p_brand text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(product_id uuid, product_name text, part_number text, brand text, category text, unit text, closing_qty numeric, avg_cost numeric, total_cost numeric, mrp numeric, sale_rate numeric, mrp_value numeric, sale_value numeric, profit_potential numeric, total_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH stock_data AS (
    SELECT
      p.id,
      COALESCE(p.name, p.product_name, p.item_name, p.part_number) AS pname,
      p.part_number,
      p.brand,
      p.category,
      COALESCE(p.unit, u.symbol) AS punit,
      p.stock AS qty,
      public.opening_stock_unit_cost(p.purchase_price, p.cost_price, p.dealer_rate, p.mrp) AS avg_cost,
      p.mrp,
      COALESCE(p.selling_price, p.dealer_rate, p.rate, p.sale_rate, 0) AS sale_rate,
      COUNT(*) OVER() AS total_rows
    FROM products p
    LEFT JOIN units u ON u.id = p.stock_unit_id
    WHERE p.business_id = p_business_id
      AND p.is_deleted IS NOT TRUE
      AND p.stock > 0
      AND (p_brand    IS NULL OR p.brand    ILIKE p_brand)
      AND (p_category IS NULL OR p.category ILIKE p_category)
    ORDER BY pname
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    sd.id                                         AS product_id,
    sd.pname                                      AS product_name,
    sd.part_number,
    sd.brand,
    sd.category,
    sd.punit                                      AS unit,
    sd.qty                                        AS closing_qty,
    sd.avg_cost,
    ROUND(sd.qty * sd.avg_cost, 2)               AS total_cost,
    sd.mrp,
    sd.sale_rate,
    ROUND(sd.qty * COALESCE(sd.mrp, 0), 2)       AS mrp_value,
    ROUND(sd.qty * sd.sale_rate, 2)              AS sale_value,
    ROUND(sd.qty * (sd.sale_rate - sd.avg_cost), 2) AS profit_potential,
    sd.total_rows
  FROM stock_data sd
  ORDER BY sd.pname;
END;
$function$;

NOTIFY pgrst, 'reload schema';
