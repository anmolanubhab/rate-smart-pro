-- Found while live-testing VoucherForm.tsx's new customer-scoped Receipt
-- Voucher dropdown: it showed all 536 parties, not just the classified
-- customers. Root cause: ensure_party_ledger()'s ELSE branch defaulted
-- EVERY non-supplier-only party (including the ~531 still-unclassified
-- ones) into Sundry Debtors -- so ensurePartyLedgers() (called on every
-- VoucherForm page load, for every party) was silently re-creating the
-- exact "everyone dumped into one group" bug for parties with no
-- preferred_customer/preferred_supplier flag at all.
--
-- Also found while investigating: 3 real parties (Azim Enterprise, Radarsh
-- Multiauto Services, A.K Auto) have genuine historical vouchers (sales/
-- receipt/payment) but were missed by the previous migration's backfill,
-- which only looked at orders/sales_invoices/purchase_orders/
-- purchase_invoices -- these parties were transacted with via a Journal/
-- Payment/Receipt voucher directly, with no order/invoice row at all.
-- Broadening the backfill to also read voucher_items -> ledger_accounts.

-- 1. Broaden party classification to also catch voucher-only history.
WITH voucher_customer_ids AS (
  SELECT DISTINCT la.party_id AS id
  FROM public.voucher_items vi
  JOIN public.vouchers v ON v.id = vi.voucher_id
  JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
  WHERE la.party_id IS NOT NULL AND v.voucher_type IN ('sales', 'receipt', 'credit_note')
),
voucher_supplier_ids AS (
  SELECT DISTINCT la.party_id AS id
  FROM public.voucher_items vi
  JOIN public.vouchers v ON v.id = vi.voucher_id
  JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
  WHERE la.party_id IS NOT NULL AND v.voucher_type IN ('purchase', 'payment', 'debit_note')
)
UPDATE public.parties p
SET preferred_supplier = preferred_supplier OR (p.id IN (SELECT id FROM voucher_supplier_ids)),
    preferred_customer = preferred_customer OR (p.id IN (SELECT id FROM voucher_customer_ids));

-- 2. Fix ensure_party_ledger(): only create a party ledger once the party
-- is actually classified. Unclassified parties get no ledger at all
-- (rather than being silently dumped into Sundry Debtors) until tagged on
-- the Parties page or picked up by a future transaction.
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
  ELSIF v_is_customer THEN
    v_group_name := 'Sundry Debtors';
    v_ledger_type := 'customer';
  ELSE
    -- Not classified as either -- don't create a ledger yet.
    RETURN NULL;
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

-- 3. Clean up ledger_accounts rows spuriously created (by testing this
-- exact bug, and by any earlier ensurePartyLedgers() call) for parties
-- that are still unclassified after the broadened backfill above -- safe
-- to remove: this migration's own step 1 already re-checked every source
-- of real history, so anything still unclassified here has never actually
-- been used in a transaction.
DELETE FROM public.ledger_accounts la
USING public.parties p
WHERE la.party_id = p.id
  AND COALESCE(p.preferred_customer, false) = false
  AND COALESCE(p.preferred_supplier, false) = false
  AND NOT EXISTS (SELECT 1 FROM public.voucher_items vi WHERE vi.ledger_account_id = la.id);
