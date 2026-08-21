-- Regression fix: the Tally-hierarchy reshape (2026-08-20/21, see
-- account_groups_reshape_tally_default_hierarchy) renamed the "Bank" system
-- group to "Bank Accounts" (and reparented it under Current Assets).
-- add_bank_account() still looked up the OLD name literally, so
-- v_bank_group resolved to NULL and every new bank account's ledger row
-- violated ledger_accounts_group_id_not_null -- "Add Bank Account" was
-- broken for every business until this fix. A full-repo grep before the
-- rename only checked supabase/migrations and src/ and missed this RPC's
-- live definition (it wasn't tracked in a migration file in this repo at
-- all); confirmed via pg_get_functiondef that it was the only remaining
-- function still keyed on the old 'Bank'/'Cash'/'Loans'/'Capital' names.

CREATE OR REPLACE FUNCTION public.add_bank_account(
  _business_id uuid,
  _account_name text,
  _bank_name text,
  _account_number text DEFAULT NULL::text,
  _ifsc_code text DEFAULT NULL::text,
  _opening_balance numeric DEFAULT 0
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bank_group uuid;
  v_ledger_id uuid;
  v_account_id uuid;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','manager','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to add bank accounts for this company';
  END IF;

  PERFORM public.seed_accounting_defaults(auth.uid(), _business_id);

  SELECT id INTO v_bank_group FROM public.account_groups
   WHERE business_id = _business_id AND name = 'Bank Accounts' LIMIT 1;

  INSERT INTO public.ledger_accounts (business_id, user_id, name, ledger_type, group_id, opening_balance, status)
  VALUES (_business_id, auth.uid(), _account_name, 'bank', v_bank_group, _opening_balance, 'active')
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.bank_accounts (business_id, account_name, bank_name, account_number, ifsc_code, opening_balance, current_balance, ledger_account_id)
  VALUES (_business_id, _account_name, _bank_name, _account_number, _ifsc_code, _opening_balance, _opening_balance, v_ledger_id)
  RETURNING id INTO v_account_id;

  RETURN v_account_id;
END;
$function$;
