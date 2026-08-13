-- Accounts/Accounting module QA audit fixes (2026-08-12)
--
-- Three gaps found while auditing the voucher/ledger architecture:
--
-- 1. Double-entry balance (Dr = Cr) was enforced only in frontend TS
--    (voucherService.validateVoucher). At least 10 SECURITY DEFINER RPCs
--    (auto_create_sales_voucher, pay_supplier_bills, receive_sales_payment,
--    post_stock_take, create_sales_return, create_purchase_return,
--    create_qc_debit_note, post_sales_return, create_inventory_adjustment,
--    sales_invoice_autopost) insert a voucher header as status='posted'
--    together with its items in a single transaction -- nothing in Postgres
--    verified the two sides matched. A deferred constraint trigger is used
--    (not a simple status-change trigger) because these RPCs set
--    status='posted' on INSERT, before any items exist yet; a same-statement
--    check would always see an empty/partial item set. Deferring to COMMIT
--    lets every item finish inserting first, for both this INSERT-already-
--    posted pattern and the ordinary draft->post UPDATE.
--
-- 2. voucher_items had no role gate -- `vouchers` restricts writes to
--    owner/admin/manager/accountant/salesman via a RESTRICTIVE policy, but
--    voucher_items only checked business membership. A `staff` or `viewer`
--    business member (valid business_role values, both excluded from the
--    vouchers gate) could INSERT/UPDATE/DELETE voucher_items directly via
--    the REST API even though they can't touch the voucher header.
--
-- 3. A posted voucher's line amounts could be altered directly via a raw
--    UPDATE on voucher_items -- voucherService.updateVoucher() only blocks
--    this in application code. The existing balance-sync trigger would
--    silently recompute ledger_accounts.current_balance to match the new
--    amount, corrupting the audit trail with no reversal record. Scoped to
--    UPDATE only (not INSERT/DELETE) since UPDATE always targets a
--    pre-existing row -- this cannot affect the legitimate insert-items-
--    after-posted-header pattern used by the RPCs above, or the explicitly
--    product-decided hard-delete-of-posted-voucher feature.

-- ── 1. Double-entry balance enforcement ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_voucher_balanced(_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_dr numeric;
  v_cr numeric;
BEGIN
  IF _voucher_id IS NULL THEN RETURN; END IF;

  SELECT status INTO v_status FROM public.vouchers WHERE id = _voucher_id;
  IF v_status IS DISTINCT FROM 'posted' THEN RETURN; END IF;

  SELECT COALESCE(SUM(dr_amount), 0), COALESCE(SUM(cr_amount), 0)
    INTO v_dr, v_cr
  FROM public.voucher_items
  WHERE voucher_id = _voucher_id;

  IF ABS(v_dr - v_cr) > 0.01 THEN
    RAISE EXCEPTION 'Voucher % is not balanced: total debit % does not equal total credit %. A posted voucher must have equal debit and credit.', _voucher_id, v_dr, v_cr
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Covers postVoucher(): items already exist from an earlier transaction, so
-- checking immediately on the status UPDATE is sufficient here.
CREATE OR REPLACE FUNCTION public.vouchers_check_balance_on_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
    PERFORM public.assert_voucher_balanced(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vouchers_check_balance_on_post ON public.vouchers;
CREATE TRIGGER trg_vouchers_check_balance_on_post
  BEFORE UPDATE OF status ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.vouchers_check_balance_on_post();

-- Covers the RPCs that INSERT a header as already-posted and add items
-- afterward in the same transaction: deferred to COMMIT so every item has
-- finished inserting before the check runs.
CREATE OR REPLACE FUNCTION public.voucher_items_check_balance_deferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := COALESCE(NEW.voucher_id, OLD.voucher_id);
  PERFORM public.assert_voucher_balanced(v_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_items_check_balance_deferred ON public.voucher_items;
CREATE CONSTRAINT TRIGGER trg_voucher_items_check_balance_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.voucher_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.voucher_items_check_balance_deferred();

-- ── 2. voucher_items role gate (mirrors vouchers_writer_role_gate_*) ────────

DROP POLICY IF EXISTS voucher_items_writer_role_gate_ins ON public.voucher_items;
CREATE POLICY voucher_items_writer_role_gate_ins ON public.voucher_items
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    business_id IS NULL
    OR has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[])
  );

DROP POLICY IF EXISTS voucher_items_writer_role_gate_upd ON public.voucher_items;
CREATE POLICY voucher_items_writer_role_gate_upd ON public.voucher_items
  AS RESTRICTIVE FOR UPDATE
  USING (
    business_id IS NULL
    OR has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[])
  )
  WITH CHECK (
    business_id IS NULL
    OR has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[])
  );

DROP POLICY IF EXISTS voucher_items_writer_role_gate_del ON public.voucher_items;
CREATE POLICY voucher_items_writer_role_gate_del ON public.voucher_items
  AS RESTRICTIVE FOR DELETE
  USING (
    business_id IS NULL
    OR has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[])
  );

-- ── 3. Immutability of posted voucher line amounts ──────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_posted_voucher_item_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.vouchers WHERE id = OLD.voucher_id;
  IF v_status = 'posted' AND (
       NEW.dr_amount IS DISTINCT FROM OLD.dr_amount
    OR NEW.cr_amount IS DISTINCT FROM OLD.cr_amount
    OR NEW.ledger_account_id IS DISTINCT FROM OLD.ledger_account_id
  ) THEN
    RAISE EXCEPTION 'Cannot modify a line of a posted voucher directly. Cancel the voucher and post a reversal/correcting entry instead.'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_voucher_item_edit ON public.voucher_items;
CREATE TRIGGER trg_prevent_posted_voucher_item_edit
  BEFORE UPDATE ON public.voucher_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_voucher_item_edit();
