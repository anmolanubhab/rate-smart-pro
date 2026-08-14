-- Phase 3 (partial), Tally-style voucher lifecycle redesign.
-- Purpose: hard-delete + RBAC, scoped to the concretely-documented bug --
-- deleteVoucher() (src/lib/voucherService.ts) nulls out 7 backreference
-- tables (VOUCHER_BACKREF_TABLES) BEFORE deleting a posted voucher,
-- specifically to defeat the already-existing trg_prevent_posted_voucher_delete
-- guard, which otherwise correctly blocks the delete when a source document
-- still references it. Per explicit product decision (2026-08-14): hard
-- delete must BLOCK when referenced, not silently orphan the source
-- document's voucher_id -- so the fix is to STOP defeating the guard, not to
-- change the guard itself (its block-if-referenced logic was already
-- correct; deleteVoucher() was bypassing it).
--
-- document_dependency_report() mirrors that trigger's own check (read-only,
-- for the pre-flight confirmation dialog) so the UI can show the same
-- "referenced by ..." reasoning before the user even attempts the delete,
-- and never disagree with what the trigger actually enforces.

CREATE OR REPLACE FUNCTION public.document_dependency_report(_doc_type text, _doc_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $fn$
DECLARE
  v_business_id uuid;
  v_status text;
  v_reference_type text;
  v_blocking jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  IF _doc_type <> 'voucher' THEN
    RAISE EXCEPTION 'document_dependency_report: doc_type % not yet supported', _doc_type;
  END IF;

  SELECT business_id, status, reference_type INTO v_business_id, v_status, v_reference_type
  FROM public.vouchers WHERE id = _doc_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_status <> 'posted' THEN
    RETURN jsonb_build_object('can_hard_delete', true, 'blocking', '[]'::jsonb);
  END IF;

  IF v_reference_type IS NOT NULL THEN
    v_blocking := v_blocking || jsonb_build_object(
      'table', v_reference_type, 'message',
      format('This voucher was auto-generated from a %s. Cancel or unlink the source document first.', v_reference_type)
    );
  END IF;

  SELECT count(*) INTO v_count FROM public.sales_invoices WHERE voucher_id = _doc_id;
  IF v_count > 0 THEN v_blocking := v_blocking || jsonb_build_object('table', 'sales_invoices', 'count', v_count, 'message', format('Referenced by %s Sales Invoice(s).', v_count)); END IF;

  SELECT count(*) INTO v_count FROM public.purchase_invoices WHERE voucher_id = _doc_id;
  IF v_count > 0 THEN v_blocking := v_blocking || jsonb_build_object('table', 'purchase_invoices', 'count', v_count, 'message', format('Referenced by %s Purchase Invoice(s).', v_count)); END IF;

  SELECT count(*) INTO v_count FROM public.payment_entries WHERE voucher_id = _doc_id;
  IF v_count > 0 THEN v_blocking := v_blocking || jsonb_build_object('table', 'payment_entries', 'count', v_count, 'message', format('Referenced by %s Payment/Receipt entr(y/ies).', v_count)); END IF;

  SELECT count(*) INTO v_count FROM public.purchase_returns WHERE voucher_id = _doc_id;
  IF v_count > 0 THEN v_blocking := v_blocking || jsonb_build_object('table', 'purchase_returns', 'count', v_count, 'message', format('Referenced by %s Purchase Return(s).', v_count)); END IF;

  SELECT count(*) INTO v_count FROM public.sales_returns WHERE voucher_id = _doc_id;
  IF v_count > 0 THEN v_blocking := v_blocking || jsonb_build_object('table', 'sales_returns', 'count', v_count, 'message', format('Referenced by %s Sales Return(s).', v_count)); END IF;

  SELECT count(*) INTO v_count FROM public.inventory_adjustments WHERE voucher_id = _doc_id;
  IF v_count > 0 THEN v_blocking := v_blocking || jsonb_build_object('table', 'inventory_adjustments', 'count', v_count, 'message', format('Referenced by %s Inventory Adjustment(s).', v_count)); END IF;

  RETURN jsonb_build_object('can_hard_delete', jsonb_array_length(v_blocking) = 0, 'blocking', v_blocking);
END;
$fn$;

REVOKE ALL ON FUNCTION public.document_dependency_report(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.document_dependency_report(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.document_dependency_report IS
  'Read-only pre-flight check mirroring trg_prevent_posted_voucher_delete''s own enforcement logic exactly, so the confirmation dialog and the actual DB guard can never disagree about whether a hard delete will succeed. Currently supports doc_type=''voucher'' only.';
