-- Security hardening (phase 2): close authorization gaps found while
-- re-auditing the SECURITY DEFINER surface after the P0/P1 forensic-audit
-- fixes (apply_ledger_balance_delta, post_purchase_invoice, warehouse/bin
-- RPCs, vw_ledger_statement, mv_sales_summary -- all already fixed in prior
-- migrations, verified live). No accounting formula, stock calculation,
-- invoice total, GRN logic, or sales/purchase workflow changes -- every
-- fix below only adds an authorization gate in front of existing logic.
--
-- 1) accept_invitation_on_signup(_user_id, _email, _mobile): took an
--    arbitrary _user_id with no check that it belonged to the caller, and
--    no check that _email/_mobile matched the caller's own auth identity
--    (unlike its sibling submit_dealer_application, which already does
--    this). Any authenticated caller could pass a different user's id
--    together with an email/mobile they knew was on a pending business
--    invitation, and grant that arbitrary user_id active membership +
--    role on the target business -- a privilege-escalation primitive.
--    Fix: require auth.uid() = _user_id, matching the existing
--    next_order_number()-style pattern already used elsewhere in this
--    codebase.
--
-- 2) get_effective_party_rules(_party_id): returned a party's commercial
--    terms (rd/cd %, credit limit, price list, scheme, territory...) for
--    any _party_id with no business-membership check at all -- cross-
--    tenant leak of pricing/credit terms. Fix: derive the party's
--    business_id and require membership before returning anything.
--
-- 3) resolve_dispatch_bin(_product_id, _warehouse_id, _requested_bin_id):
--    no membership check on _warehouse_id -- let any caller probe bin
--    lock status and product default-bin assignment across businesses.
--    Fix: require membership on the warehouse's business up front.
--
-- 4) next_po_number / next_adjustment_number / next_purchase_return_number
--    / next_sales_return_number / next_stock_take_number /
--    next_stock_transfer_number / next_supplier_payment_ref: all took
--    _business_id with zero membership check -- any caller could read
--    (and, for the two below, mutate) another business's document
--    numbering sequence. Fix: require is_business_member(_business_id).
--
-- 5) next_invoice_number / next_dispatch_number: same gap, plus they also
--    take _user_id and next_invoice_number persists state
--    (voucher_number_series.next_number += 1) -- so an unauthorized caller
--    could burn/skew another user's invoice series with no invoice ever
--    created. Fix: require auth.uid() = _user_id (matching the existing
--    next_order_number pattern) AND is_business_member on the resolved
--    business id.

CREATE OR REPLACE FUNCTION public.accept_invitation_on_signup(_user_id uuid, _email text, _mobile text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN
    SELECT * FROM public.business_user_invitations
    WHERE status = 'pending'
      AND ((email IS NOT NULL AND lower(email) = lower(_email)) OR (_mobile IS NOT NULL AND mobile = _mobile))
  LOOP
    INSERT INTO public.business_users (business_id, user_id, role, status, email, mobile, department, notes)
    VALUES (r.business_id, _user_id, r.role, 'active', r.email, r.mobile, r.department, r.notes)
    ON CONFLICT (business_id, user_id) DO NOTHING;

    UPDATE public.business_user_invitations
    SET status = 'accepted', accepted_at = now(), accepted_user_id = _user_id
    WHERE id = r.id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_party_rules(_party_id uuid)
 RETURNS TABLE(rd_pct numeric, cd_pct numeric, credit_days integer, credit_limit numeric, price_list_id uuid, scheme_id uuid, gst_type text, payment_terms text, territory text, zone text, route text, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_party record;
  v_group record;
  v_parent record;
BEGIN
  SELECT * INTO v_party FROM public.parties WHERE id = _party_id;
  IF v_party IS NULL THEN RETURN; END IF;

  IF NOT public.is_business_member(v_party.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT v_party.use_group_defaults OR v_party.party_group_id IS NULL THEN
    RETURN QUERY SELECT
      COALESCE(v_party.rd_percent, 0), COALESCE(v_party.cd_percent, 0),
      v_party.credit_days, v_party.credit_limit,
      NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      'party_override'::text;
    RETURN;
  END IF;

  SELECT * INTO v_group FROM public.party_groups WHERE id = v_party.party_group_id;
  IF v_group.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.party_groups WHERE id = v_group.parent_id;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_group.default_rd_pct, v_parent.default_rd_pct, 0),
    COALESCE(v_group.default_cd_pct, v_parent.default_cd_pct, 0),
    COALESCE(v_group.default_credit_days, v_parent.default_credit_days),
    COALESCE(v_group.default_credit_limit, v_parent.default_credit_limit),
    COALESCE(v_group.default_price_list_id, v_parent.default_price_list_id),
    COALESCE(v_group.default_scheme_id, v_parent.default_scheme_id),
    COALESCE(v_group.gst_type_default, v_parent.gst_type_default),
    COALESCE(v_group.payment_terms, v_parent.payment_terms),
    COALESCE(v_group.territory, v_parent.territory),
    COALESCE(v_group.zone, v_parent.zone),
    COALESCE(v_group.route, v_parent.route),
    'group:' || v_group.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_dispatch_bin(_product_id uuid, _warehouse_id uuid, _requested_bin_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bin_id uuid;
  v_bin_warehouse_id uuid;
  v_bin_locked boolean;
  v_business_id uuid;
BEGIN
  IF pg_trigger_depth() = 0 THEN
    SELECT business_id INTO v_business_id FROM public.warehouses WHERE id = _warehouse_id;
    IF v_business_id IS NULL OR NOT public.is_business_member(v_business_id) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  IF _requested_bin_id IS NOT NULL THEN
    SELECT is_locked INTO v_bin_locked FROM public.warehouse_bins WHERE id = _requested_bin_id;
    IF v_bin_locked THEN
      RAISE EXCEPTION 'Bin is locked (physical count in progress) and cannot be picked from right now';
    END IF;
    RETURN _requested_bin_id;
  END IF;

  SELECT p.default_bin_id, z.warehouse_id
    INTO v_bin_id, v_bin_warehouse_id
  FROM public.products p
  LEFT JOIN public.warehouse_bins wb ON wb.id = p.default_bin_id
  LEFT JOIN public.warehouse_racks r ON r.id = wb.rack_id
  LEFT JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE p.id = _product_id;

  IF v_bin_id IS NULL OR v_bin_warehouse_id IS DISTINCT FROM _warehouse_id THEN
    v_bin_id := public.seed_unassigned_bin_for_warehouse(_warehouse_id);
  END IF;

  RETURN v_bin_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_po_number(_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_number text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) + 1 INTO v_count
  FROM public.purchase_orders
  WHERE business_id = _business_id;

  v_number := 'PO-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');

  WHILE EXISTS (
    SELECT 1 FROM public.purchase_orders
    WHERE business_id = _business_id AND po_number = v_number
  ) LOOP
    v_count := v_count + 1;
    v_number := 'PO-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;

  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_adjustment_number(_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int; v_number text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) + 1 INTO v_count FROM public.inventory_adjustments WHERE business_id = _business_id;
  v_number := 'ADJ-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.inventory_adjustments WHERE business_id = _business_id AND adjustment_number = v_number) LOOP
    v_count := v_count + 1;
    v_number := 'ADJ-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;
  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_purchase_return_number(_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int; v_number text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) + 1 INTO v_count FROM public.purchase_returns WHERE business_id = _business_id;
  v_number := 'PR-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.purchase_returns WHERE business_id = _business_id AND return_number = v_number) LOOP
    v_count := v_count + 1;
    v_number := 'PR-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;
  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_sales_return_number(_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int; v_number text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) + 1 INTO v_count FROM public.sales_returns WHERE business_id = _business_id;
  v_number := 'CN-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.sales_returns WHERE business_id = _business_id AND return_number = v_number) LOOP
    v_count := v_count + 1;
    v_number := 'CN-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;
  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_stock_take_number(_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
  v_number text;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not authorized';
  end if;

  select count(*) + 1 into v_count
  from public.stock_take_sheets
  where business_id = _business_id;

  v_number := 'SC-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');

  while exists (
    select 1 from public.stock_take_sheets
    where business_id = _business_id and sheet_no = v_number
  ) loop
    v_count := v_count + 1;
    v_number := 'SC-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');
  end loop;

  return v_number;
end;
$function$;

CREATE OR REPLACE FUNCTION public.next_stock_transfer_number(_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
  v_number text;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not authorized';
  end if;

  select count(*) + 1 into v_count
  from public.stock_transfers
  where business_id = _business_id;

  v_number := 'ST-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');

  while exists (
    select 1 from public.stock_transfers
    where business_id = _business_id and transfer_no = v_number
  ) loop
    v_count := v_count + 1;
    v_number := 'ST-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');
  end loop;

  return v_number;
end;
$function$;

CREATE OR REPLACE FUNCTION public.next_supplier_payment_ref(_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_ref text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) + 1 INTO v_count
  FROM public.supplier_payments
  WHERE business_id = _business_id;

  v_ref := 'SPMT-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');

  WHILE EXISTS (
    SELECT 1 FROM public.supplier_payments
    WHERE business_id = _business_id AND payment_ref = v_ref
  ) LOOP
    v_count := v_count + 1;
    v_ref := 'SPMT-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;

  RETURN v_ref;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_dispatch_number(_user_id uuid, _business_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_biz uuid;
  v_next int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));

  IF v_biz IS NOT NULL AND NOT public.is_business_member(v_biz) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- No dispatch-specific series exists in this schema variant,
  -- so fall back to dispatch table max+1 numbering.
  SELECT COALESCE(MAX(NULLIF(regexp_replace(dispatch_number, '[^0-9]', '', 'g'), '')::int), 0) + 1
    INTO v_next
  FROM public.dispatches
  WHERE user_id = _user_id
    AND business_id IS NOT DISTINCT FROM v_biz;

  RETURN 'DSP-' || LPAD(v_next::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(_user_id uuid, _business_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_biz uuid;
  v_series record;
  v_prefix text;
  v_pad int;
  v_next int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));

  IF v_biz IS NOT NULL AND NOT public.is_business_member(v_biz) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT prefix, padding, next_number
    INTO v_series
  FROM public.voucher_number_series
  WHERE user_id = _user_id
    AND voucher_type::text = 'sales'
    AND business_id IS NOT DISTINCT FROM v_biz
  LIMIT 1;

  IF FOUND THEN
    v_prefix := COALESCE(v_series.prefix, 'INV-');
    v_pad    := COALESCE(v_series.padding, 4);
    v_next   := COALESCE(v_series.next_number, 1);

    UPDATE public.voucher_number_series
       SET next_number = v_next + 1
     WHERE user_id = _user_id
       AND voucher_type::text = 'sales'
       AND business_id IS NOT DISTINCT FROM v_biz;

    RETURN v_prefix || LPAD(v_next::text, v_pad, '0');
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '')::int), 0) + 1
    INTO v_next
  FROM public.sales_invoices
  WHERE user_id = _user_id
    AND business_id IS NOT DISTINCT FROM v_biz;

  RETURN 'INV-' || LPAD(v_next::text, 4, '0');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation_on_signup(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_party_rules(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_dispatch_bin(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_po_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_adjustment_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_purchase_return_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_sales_return_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_stock_take_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_stock_transfer_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_supplier_payment_ref(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_dispatch_number(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid, uuid) FROM PUBLIC, anon;
