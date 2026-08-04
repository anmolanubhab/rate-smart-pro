-- Fixes a real multi-tenancy bug: seed_accounting_defaults()'s "already
-- seeded" guard was scoped by (user_id, business_id), but is_system
-- account_groups/ledger_accounts are meant to be shared across every member
-- of a business (RLS already treats them that way). The first time a SECOND
-- team member of an existing business loaded a ledger-touching screen, the
-- guard found no rows for *their* user_id and happily re-seeded a whole
-- second copy of the chart of accounts under their own user_id, in the same
-- business. That's why "Sundry Creditors", "Sales Accounts", etc. show up
-- twice in the ledger group dropdown.
--
-- This migration: (1) merges every duplicate system account_groups row per
-- business into the oldest one, repointing every FK that pointed at a
-- duplicate first; (2) adds a unique index so it's structurally impossible
-- to happen again; (3) fixes the seed function's guard to be business-scoped
-- (falling back to the old user-scoped behavior only for legacy rows with no
-- business_id, so solo/no-business accounts keep working exactly as before).

-- ── 1. Merge duplicate system account_groups (per business_id, per name) ──

CREATE TEMP TABLE _group_merge ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    business_id,
    name,
    row_number() OVER (PARTITION BY business_id, name ORDER BY created_at ASC, id ASC) AS rn,
    first_value(id) OVER (PARTITION BY business_id, name ORDER BY created_at ASC, id ASC) AS canonical_id
  FROM public.account_groups
  WHERE is_system = true
)
SELECT id AS dup_id, canonical_id
FROM ranked
WHERE rn > 1;

-- Repoint every ledger that was filed under a duplicate group.
UPDATE public.ledger_accounts la
SET group_id = m.canonical_id
FROM _group_merge m
WHERE la.group_id = m.dup_id;

-- Repoint any child group (e.g. "Cash" under a duplicate "Assets") to the
-- canonical parent before the duplicate parent is deleted.
UPDATE public.account_groups ag
SET parent_id = m.canonical_id
FROM _group_merge m
WHERE ag.parent_id = m.dup_id;

-- Now safe to remove the duplicates -- nothing references them anymore.
DELETE FROM public.account_groups ag
USING _group_merge m
WHERE ag.id = m.dup_id;

-- Self-check: fail loudly instead of silently leaving bad data if anything
-- above didn't fully clean up (e.g. an FK this migration didn't know about).
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT business_id, name
    FROM public.account_groups
    WHERE is_system = true
    GROUP BY business_id, name
    HAVING count(*) > 1
  ) x;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'account_groups cleanup incomplete: % duplicate system group name(s) remain', dup_count;
  END IF;
END $$;

-- ── 2. Prevent recurrence: one system group per (business_id, name) ───────
-- NULLs never conflict in a unique index, so this only constrains businesses
-- that actually have a business_id -- legacy solo accounts (business_id
-- NULL) are unaffected, matching their existing per-user behavior.

CREATE UNIQUE INDEX IF NOT EXISTS account_groups_system_name_per_business_uidx
  ON public.account_groups (business_id, name)
  WHERE is_system = true;

-- ── 3. Fix the root cause: business-scoped idempotency guard ──────────────

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

  -- Shared, business-wide chart of accounts: any member having already
  -- seeded it is enough. Only fall back to a per-user check for legacy rows
  -- with no business_id at all (pre-multi-business accounts).
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
  ON CONFLICT (user_id, name) DO NOTHING;
END
$function$;
