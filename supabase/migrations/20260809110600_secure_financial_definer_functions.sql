-- P0 remediation (2/6): secure two financial functions callable with no auth.
--
-- Verified live defects (forensic audit, 2026-08-09):
--  - apply_ledger_balance_delta(): SECURITY DEFINER, no auth check at all,
--    EXECUTE granted to PUBLIC/anon -- because it's DEFINER it bypasses RLS
--    entirely, so an unauthenticated caller could mutate any business's
--    ledger_accounts.current_balance / party_balance_summary / parties
--    .outstanding_balance directly via /rest/v1/rpc/apply_ledger_balance_delta.
--    Legitimate callers are exactly two triggers on voucher_items/vouchers
--    (voucher_items_balance_trigger, vouchers_sync_balance_on_status_change).
--  - post_purchase_invoice(): SECURITY INVOKER (not DEFINER), EXECUTE also
--    granted to PUBLIC/anon. Its INSERT INTO vouchers happens to be
--    constrained by the caller's own vouchers RLS today, but with no
--    explicit business-membership check inside the function itself, and no
--    revoke of the anon grant. Confirmed dead code (zero call sites in
--    src/), also carries a latent status='POSTED' vs the 'posted' every
--    reader expects (voucher_items_balance_trigger), and was missing a
--    pinned search_path (flagged separately by the Supabase security
--    advisor) -- both fixed here as one-line corrections to the same
--    function body, not a separate scope expansion.

CREATE OR REPLACE FUNCTION public.apply_ledger_balance_delta(_ledger_account_id uuid, _dr_delta numeric, _cr_delta numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_party_id uuid;
  v_business_id uuid;
  v_net numeric;
BEGIN
  IF _ledger_account_id IS NULL THEN RETURN; END IF;

  -- pg_trigger_depth() = 0 means "called directly via RPC/API, not from
  -- within a trigger" -- every legitimate call (from the two triggers
  -- above) is exempt and behaves exactly as before; only a direct
  -- anon/non-member RPC call is newly blocked.
  IF pg_trigger_depth() = 0 THEN
    SELECT business_id INTO v_business_id FROM public.ledger_accounts WHERE id = _ledger_account_id;
    IF v_business_id IS NULL OR NOT public.is_business_member(v_business_id) THEN
      RAISE EXCEPTION 'Not authorized to modify this ledger account';
    END IF;
  END IF;

  UPDATE public.ledger_accounts
  SET current_balance = COALESCE(current_balance, 0) + _dr_delta - _cr_delta,
      updated_at = now()
  WHERE id = _ledger_account_id
  RETURNING party_id, business_id INTO v_party_id, v_business_id;

  IF v_party_id IS NULL OR v_business_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.party_balance_summary (party_id, business_id, total_dr, total_cr, current_balance, last_voucher_at)
  VALUES (v_party_id, v_business_id, GREATEST(_dr_delta, 0), GREATEST(_cr_delta, 0), _dr_delta - _cr_delta, now())
  ON CONFLICT (party_id) DO UPDATE SET
    total_dr = public.party_balance_summary.total_dr + GREATEST(_dr_delta, 0),
    total_cr = public.party_balance_summary.total_cr + GREATEST(_cr_delta, 0),
    current_balance = public.party_balance_summary.current_balance + _dr_delta - _cr_delta,
    last_voucher_at = now(),
    updated_at = now()
  RETURNING current_balance INTO v_net;

  UPDATE public.parties SET outstanding_balance = v_net WHERE id = v_party_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_ledger_balance_delta(uuid, numeric, numeric) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_invoice purchase_invoices%ROWTYPE;
    v_purchase_ledger uuid;
    v_supplier_ledger uuid;
    v_voucher uuid;
BEGIN
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase Invoice Not Found';
    END IF;

    IF NOT public.is_business_member(v_invoice.business_id) THEN
        RAISE EXCEPTION 'Not authorized to post this purchase invoice';
    END IF;

    IF v_invoice.voucher_id IS NOT NULL THEN
        RETURN v_invoice.voucher_id;
    END IF;

    SELECT id INTO v_purchase_ledger FROM ledger_accounts
     WHERE business_id = v_invoice.business_id AND ledger_type = 'PURCHASE' LIMIT 1;

    SELECT id INTO v_supplier_ledger FROM ledger_accounts
     WHERE business_id = v_invoice.business_id AND party_id = v_invoice.supplier_id LIMIT 1;

    INSERT INTO vouchers(
        business_id, voucher_number, voucher_type, voucher_date, narration,
        total_amount, status, reference_id, reference_type, created_by
    ) VALUES (
        v_invoice.business_id, 'PUR-'||to_char(now(),'YYYYMMDDHH24MISS'), 'PURCHASE',
        v_invoice.invoice_date, 'Purchase Invoice', v_invoice.grand_total, 'posted',
        v_invoice.id, 'PURCHASE_INVOICE', v_invoice.created_by
    ) RETURNING id INTO v_voucher;

    INSERT INTO voucher_items(voucher_id, business_id, ledger_account_id, dr_amount, cr_amount, amount, entry_type, narration)
    VALUES (v_voucher, v_invoice.business_id, v_purchase_ledger, v_invoice.grand_total, 0, v_invoice.grand_total, 'DEBIT', 'Purchase');

    INSERT INTO voucher_items(voucher_id, business_id, ledger_account_id, dr_amount, cr_amount, amount, entry_type, narration)
    VALUES (v_voucher, v_invoice.business_id, v_supplier_ledger, 0, v_invoice.grand_total, v_invoice.grand_total, 'CREDIT', 'Supplier');

    UPDATE purchase_invoices SET voucher_id = v_voucher WHERE id = v_invoice.id;

    RETURN v_voucher;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) FROM PUBLIC, anon;
