-- The last three PostgREST-exposed SECURITY DEFINER functions that neither
-- took a business parameter nor checked membership.
--
-- SECURITY DEFINER means these run with the definer's rights and RLS does not
-- constrain them, so each has to make its own authorization check. None did.
--
--   recalc_po_quantities(_po_id)      HIGH. UPDATEs a purchase order's
--                                     total/received/accepted/pending qty and
--                                     status by raw id. Any authenticated user
--                                     could mutate any company's PO.
--
--   next_packing_slip_number()        The sequence was MAX() over the ENTIRE
--                                     dispatches table with no business filter,
--                                     so every company shared one global
--                                     packing-slip series and one company's
--                                     dispatch volume advanced another's
--                                     numbers (and leaked that volume).
--
--   log_party_activity(_party_id, …)  Derives business from the party, so it
--                                     cannot write into the wrong company's
--                                     log — but with no membership check any
--                                     authenticated user could append activity
--                                     rows against any company's party.
--
-- Verified before applying: purchase_orders, dispatches and party_activity_logs
-- all carry business_id with zero NULLs, so the checks below cannot lock out
-- existing rows.

-- ── recalc_po_quantities: authorize against the PO's own company ────────────
CREATE OR REPLACE FUNCTION public.recalc_po_quantities(_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_received numeric;
  v_accepted numeric;
  v_pending numeric;
  v_status purchase_order_status;
  v_biz uuid;
BEGIN
  IF _po_id IS NULL THEN RETURN; END IF;

  SELECT business_id, status INTO v_biz, v_status
  FROM public.purchase_orders WHERE id = _po_id;
  IF v_status IS NULL THEN RETURN; END IF;

  -- Silent no-op rather than an error: this is also called from internal
  -- recalculation paths, and a caller must not learn whether a foreign id
  -- exists.
  IF v_biz IS NULL OR NOT public.is_business_member(v_biz) THEN RETURN; END IF;

  SELECT COALESCE(SUM(COALESCE(stock_qty, qty)), 0) INTO v_total
  FROM public.purchase_order_items WHERE purchase_order_id = _po_id;

  SELECT COALESCE(SUM(COALESCE(gri.stock_received_qty, gri.received_qty)), 0) INTO v_received
  FROM public.goods_receipt_items gri
  JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
  WHERE gr.purchase_order_id = _po_id AND gr.status = 'received';

  SELECT COALESCE(SUM(gri.accepted_qty), 0) INTO v_accepted
  FROM public.goods_receipt_items gri
  JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
  WHERE gr.purchase_order_id = _po_id AND gr.status = 'received';

  v_pending := GREATEST(v_total - v_accepted, 0);

  UPDATE public.purchase_orders
  SET total_qty = v_total,
      received_qty = v_received,
      accepted_qty = v_accepted,
      pending_qty = v_pending,
      status = CASE
        WHEN v_status IN ('approved','ordered','partially_received','received') THEN
          CASE
            WHEN v_total > 0 AND v_accepted >= v_total THEN 'received'::purchase_order_status
            WHEN v_accepted > 0 THEN 'partially_received'::purchase_order_status
            ELSE 'approved'::purchase_order_status
          END
        ELSE v_status END,
      updated_at = now()
  WHERE id = _po_id;
END;
$function$;

-- ── next_packing_slip_number: per company, not global ───────────────────────
-- New optional parameter so existing callers keep compiling; passing it is what
-- makes the series company-scoped.
CREATE OR REPLACE FUNCTION public.next_packing_slip_number(
  _user_id uuid,
  _business_id uuid DEFAULT NULL
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prefix text := 'PKS-' || to_char(now(), 'YYYYMMDD') || '-';
  next_seq int;
BEGIN
  IF _business_id IS NOT NULL AND NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  SELECT COALESCE(
           MAX(CASE WHEN packing_slip_number IS NOT NULL
                    THEN regexp_replace(packing_slip_number, '^.*-', '')::int
                    ELSE 0 END), 0) + 1
    INTO next_seq
  FROM public.dispatches
  WHERE _business_id IS NULL OR business_id = _business_id;

  RETURN prefix || lpad(next_seq::text, 4, '0');
END;
$function$;

-- ── log_party_activity: only for a company the caller belongs to ────────────
CREATE OR REPLACE FUNCTION public.log_party_activity(
  _party_id uuid,
  _activity_type text,
  _description text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.parties WHERE id = _party_id;
  IF v_business_id IS NULL THEN RETURN; END IF;
  IF NOT public.is_business_member(v_business_id) THEN RETURN; END IF;

  INSERT INTO public.party_activity_logs (party_id, business_id, activity_type, description, created_by)
  VALUES (_party_id, v_business_id, _activity_type, _description, auth.uid());
END;
$function$;
