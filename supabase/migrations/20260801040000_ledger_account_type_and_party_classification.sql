-- Ledger/Party Type architecture, so voucher entry dropdowns can finally be
-- context-aware (Purchase -> Suppliers only, Sales -> Customers only, Bank
-- entry -> Bank accounts only, Contra -> Cash/Bank only, etc), matching
-- Tally/Busy-style ERP behavior.
--
-- Root cause fixed here: ensure_party_ledger() unconditionally filed EVERY
-- party's ledger under 'Sundry Debtors' with ledger_type = 'customer',
-- regardless of whether the party was actually a supplier -- verified even
-- for confirmed suppliers via later QC-debit-note/GST-milestone migrations
-- that still call this same function unchanged. parties.preferred_customer/
-- preferred_supplier already existed with a UI toggle in Parties.tsx but
-- were never read anywhere -- pure dead columns until this migration.

-- ── 1. account_groups.account_type — group-level classification ──────────
-- Authoritative for LEDGER-ACCOUNT dropdowns (VoucherForm.tsx's generic
-- Dr/Cr picker, Contra's cash/bank picker, Expense/Income voucher heads).
-- Reliable immediately: these are business-wide system ledgers, not
-- per-party, so no backfill ambiguity like the party side has.

ALTER TABLE public.account_groups ADD COLUMN IF NOT EXISTS account_type text;

UPDATE public.account_groups SET account_type = CASE name
  WHEN 'Sundry Debtors'     THEN 'customer'
  WHEN 'Sundry Creditors'   THEN 'supplier'
  WHEN 'Bank'               THEN 'bank'
  WHEN 'Cash'               THEN 'cash'
  WHEN 'Purchase Accounts'  THEN 'purchase'
  WHEN 'Sales Accounts'     THEN 'sales'
  WHEN 'Direct Expenses'    THEN 'expense'
  WHEN 'Indirect Expenses'  THEN 'expense'
  WHEN 'Other Income'       THEN 'income'
  WHEN 'Duties & Taxes'     THEN 'tax'
  WHEN 'Fixed Assets'       THEN 'asset'
  WHEN 'Stock-in-Hand'      THEN 'asset'
  WHEN 'Loans'              THEN 'liability'
  WHEN 'Capital'            THEN 'equity'
  WHEN 'Assets'             THEN 'asset'
  WHEN 'Liabilities'        THEN 'liability'
  WHEN 'Income'             THEN 'income'
  WHEN 'Expenses'           THEN 'expense'
  ELSE account_type
END
WHERE account_type IS NULL;

-- Keep future businesses' seeded chart of accounts correctly typed too
-- (seed_accounting_defaults only runs once per business, on first use).
CREATE OR REPLACE FUNCTION public.seed_accounting_defaults(_user_id uuid, _business_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Phase 9: standard expense ledgers
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
    -- Phase 9: standard income ledgers
    (_user_id, v_biz, 'Interest Received', g_oinc, 'income', true),
    (_user_id, v_biz, 'Commission Received', g_oinc, 'income', true),
    (_user_id, v_biz, 'Discount Received', g_oinc, 'income', true)
  ON CONFLICT (user_id, name) DO NOTHING;
END $function$;

-- ── 2. parties.preferred_customer/preferred_supplier — party-level type ──
-- Backfilled from actual transaction history only (per explicit decision):
-- sales-only -> customer, purchase-only -> supplier, both -> both, zero
-- history -> neither (those are unused legacy/imported records, handled by
-- a separate user-triggered cleanup tool, not by this migration).

WITH supplier_ids AS (
  SELECT supplier_id AS id FROM public.purchase_orders WHERE supplier_id IS NOT NULL
  UNION
  SELECT supplier_id FROM public.purchase_invoices WHERE supplier_id IS NOT NULL
),
customer_ids AS (
  SELECT party_id AS id FROM public.orders WHERE party_id IS NOT NULL
  UNION
  SELECT party_id FROM public.sales_invoices WHERE party_id IS NOT NULL
)
UPDATE public.parties p
SET preferred_supplier = (p.id IN (SELECT id FROM supplier_ids)),
    preferred_customer = (p.id IN (SELECT id FROM customer_ids));

-- ── 3. Fix ensure_party_ledger() to assign the correct group/ledger_type ──
-- Supplier-only parties now file under Sundry Creditors; everyone else
-- (customer, both-role, or still-unclassified) keeps the original Sundry
-- Debtors default that was previously hardcoded for every party regardless
-- of actual role. Existing party ledgers are reclassified below too, so
-- Trial Balance / Balance Sheet / Ledger Statements become correct as well,
-- not just dropdown filtering.

CREATE OR REPLACE FUNCTION public.ensure_party_ledger(_user_id uuid, _party_id uuid, _business_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_name text; v_group uuid; v_biz uuid;
  v_is_supplier boolean; v_is_customer boolean;
  v_group_name text; v_ledger_type text;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));
  PERFORM public.seed_accounting_defaults(_user_id, v_biz);
  SELECT id INTO v_id FROM public.ledger_accounts
   WHERE user_id = _user_id AND party_id = _party_id
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT name, COALESCE(preferred_supplier, false), COALESCE(preferred_customer, false)
    INTO v_name, v_is_supplier, v_is_customer
    FROM public.parties WHERE id = _party_id;
  IF v_name IS NULL THEN RETURN NULL; END IF;

  IF v_is_supplier AND NOT v_is_customer THEN
    v_group_name := 'Sundry Creditors';
    v_ledger_type := 'supplier';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_ledger_type := 'customer';
  END IF;

  SELECT id INTO v_group FROM public.account_groups
   WHERE user_id = _user_id AND name = v_group_name AND is_system
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  INSERT INTO public.ledger_accounts (user_id, business_id, name, group_id, ledger_type, party_id)
  VALUES (_user_id, v_biz, v_name, v_group, v_ledger_type, _party_id)
  ON CONFLICT (user_id, name) DO UPDATE SET party_id = EXCLUDED.party_id
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- Reclassify already-existing party ledgers for supplier-only parties that
-- were wrongly filed under Sundry Debtors by the old unconditional logic.
UPDATE public.ledger_accounts la
SET group_id = cred.id,
    ledger_type = 'supplier'
FROM public.parties p,
     public.account_groups cred
WHERE la.party_id = p.id
  AND cred.name = 'Sundry Creditors' AND cred.is_system
  AND cred.user_id = la.user_id
  AND cred.business_id IS NOT DISTINCT FROM la.business_id
  AND COALESCE(p.preferred_supplier, false) = true
  AND COALESCE(p.preferred_customer, false) = false;

-- ── 4. Backend validation — reject a cross-type save even if some future
-- UI path forgets to filter (same BEFORE INSERT/UPDATE ... RAISE EXCEPTION
-- pattern used throughout this session's other data-integrity triggers).

CREATE OR REPLACE FUNCTION public.validate_supplier_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(preferred_supplier, false) INTO v_ok FROM public.parties WHERE id = NEW.supplier_id;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'Selected party is not marked as a Supplier. Tag it as a Supplier on the Parties page first.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_supplier_party ON public.purchase_orders;
CREATE TRIGGER trg_validate_supplier_party
  BEFORE INSERT OR UPDATE OF supplier_id ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_party();

DROP TRIGGER IF EXISTS trg_validate_supplier_party ON public.purchase_invoices;
CREATE TRIGGER trg_validate_supplier_party
  BEFORE INSERT OR UPDATE OF supplier_id ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_party();

CREATE OR REPLACE FUNCTION public.validate_customer_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.party_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(preferred_customer, false) INTO v_ok FROM public.parties WHERE id = NEW.party_id;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'Selected party is not marked as a Customer. Tag it as a Customer on the Parties page first.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_customer_party ON public.orders;
CREATE TRIGGER trg_validate_customer_party
  BEFORE INSERT OR UPDATE OF party_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_party();

DROP TRIGGER IF EXISTS trg_validate_customer_party ON public.sales_invoices;
CREATE TRIGGER trg_validate_customer_party
  BEFORE INSERT OR UPDATE OF party_id ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_party();
