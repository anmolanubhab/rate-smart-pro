-- Phase 0, Migration 2 of Tally-style voucher lifecycle redesign.
-- Purpose: reconcile the 6+ incompatible per-table status vocabularies into ONE
-- normalized 'draft' | 'posted' | 'cancelled' view. Nothing is added to source
-- tables here -- vocabularies are reconciled in the view, not duplicated.
--
-- Draft-suppression is deliberately conservative: only sales_invoice maps
-- draft -> draft (its autopost trigger provably guards
-- `IF NEW.status <> 'posted' THEN RETURN`). For dispatch/goods_receipt/etc,
-- blanket draft-suppression risks erasing live stock if their own draft
-- semantics differ from sales_invoice's -- instead, check_movement_integrity()
-- (next migration) detects any leak at the writer rather than papering over it here.

CREATE VIEW public.vw_document_lifecycle
WITH (security_invoker = on) AS
SELECT 'sales_invoice'::text AS doc_type, si.id AS doc_id, si.business_id,
       si.invoice_number AS doc_number, si.invoice_date AS doc_date,
       CASE
         WHEN COALESCE(si.is_deleted, false) OR si.status = 'cancelled' THEN 'cancelled'
         WHEN si.status = 'draft' THEN 'draft'
         ELSE 'posted'
       END AS lifecycle_status,
       si.voucher_id, si.party_id,
       si.cancelled_at, si.cancelled_by, si.cancelled_reason
FROM public.sales_invoices si

UNION ALL
SELECT 'purchase_invoice', pi.id, pi.business_id,
       pi.invoice_number, pi.invoice_date,
       CASE WHEN pi.status = 'cancelled' THEN 'cancelled' ELSE 'posted' END,
       -- purchase_invoices has no draft state and no is_deleted column today;
       -- status is unpaid/partially_paid/paid/cancelled (payment status, not lifecycle).
       pi.voucher_id, pi.supplier_id,
       NULL::timestamptz, NULL::uuid, NULL::text
FROM public.purchase_invoices pi

UNION ALL
SELECT 'sales_return', sr.id, sr.business_id,
       sr.return_number, sr.return_date,
       CASE
         WHEN sr.status = 'cancelled' THEN 'cancelled'
         WHEN sr.status = 'draft' THEN 'draft'
         ELSE 'posted'
       END,
       sr.voucher_id, sr.party_id,
       sr.cancelled_at, sr.cancelled_by, sr.cancelled_reason
FROM public.sales_returns sr

UNION ALL
SELECT 'purchase_return', pr.id, pr.business_id,
       pr.return_number, pr.return_date,
       CASE
         WHEN lower(trim(pr.status)) = 'cancelled' THEN 'cancelled'
         WHEN lower(trim(pr.status)) = 'draft' THEN 'draft'
         ELSE 'posted'
       END,
       pr.voucher_id, pr.supplier_id,
       NULL::timestamptz, NULL::uuid, NULL::text
FROM public.purchase_returns pr

UNION ALL
SELECT 'payment_entry', pe.id, pe.business_id,
       COALESCE(pe.reference_number, pe.id::text), pe.payment_date::date,
       CASE WHEN COALESCE(pe.is_reversed, false) THEN 'cancelled' ELSE 'posted' END,
       pe.voucher_id, pe.party_id,
       pe.reversed_at, pe.reversed_by, pe.reversed_reason
FROM public.payment_entries pe

UNION ALL
SELECT 'supplier_payment', sp.id, sp.business_id,
       COALESCE(sp.payment_ref, sp.id::text), sp.payment_date,
       'posted', -- supplier_payments has no status/reversal column at all today
       NULL::uuid, sp.supplier_id,
       NULL::timestamptz, NULL::uuid, NULL::text
FROM public.supplier_payments sp

UNION ALL
SELECT 'dispatch', d.id, d.business_id,
       d.dispatch_number, d.dispatch_date,
       CASE
         WHEN COALESCE(d.is_deleted, false) OR d.status = 'cancelled' THEN 'cancelled'
         ELSE 'posted'
       END,
       NULL::uuid, d.party_id,
       d.cancelled_at, d.cancelled_by, d.cancelled_reason
FROM public.dispatches d

UNION ALL
SELECT 'goods_receipt', gr.id, gr.business_id,
       gr.grn_number::text, gr.grn_date,
       CASE WHEN gr.status::text = 'cancelled' THEN 'cancelled' ELSE 'posted' END,
       NULL::uuid, gr.supplier_id,
       NULL::timestamptz, NULL::uuid, NULL::text
FROM public.goods_receipts gr

UNION ALL
SELECT 'inventory_adjustment', ia.id, ia.business_id,
       ia.adjustment_number, ia.created_at::date,
       CASE
         WHEN COALESCE(ia.is_deleted, false) OR ia.status = 'cancelled' THEN 'cancelled'
         WHEN ia.status = 'draft' THEN 'draft'
         ELSE 'posted'
       END,
       ia.voucher_id, NULL::uuid,
       ia.cancelled_at, ia.cancelled_by, ia.cancelled_reason
FROM public.inventory_adjustments ia

UNION ALL
SELECT 'stock_take_sheet', sts.id, sts.business_id,
       sts.sheet_no, sts.count_date,
       CASE
         WHEN sts.status = 'cancelled' THEN 'cancelled'
         WHEN sts.status = 'draft' THEN 'draft'
         ELSE 'posted'
       END,
       sts.voucher_id, NULL::uuid,
       NULL::timestamptz, NULL::uuid, NULL::text
FROM public.stock_take_sheets sts

UNION ALL
SELECT 'voucher', v.id, v.business_id,
       v.voucher_number, v.voucher_date,
       CASE
         WHEN COALESCE(v.is_deleted, false) THEN 'cancelled'
         WHEN v.status = 'cancelled' THEN 'cancelled'
         WHEN v.status = 'draft' THEN 'draft'
         ELSE 'posted'
       END,
       v.id, NULL::uuid,
       v.cancelled_at, v.cancelled_by, v.cancelled_reason
FROM public.vouchers v;

REVOKE ALL ON public.vw_document_lifecycle FROM anon;
GRANT SELECT ON public.vw_document_lifecycle TO authenticated;

-- Narrow companion for hot joins (used by vw_effective_stock_movements next migration).
CREATE VIEW public.vw_document_lifecycle_min
WITH (security_invoker = on) AS
SELECT doc_type, doc_id, business_id, lifecycle_status
FROM public.vw_document_lifecycle;

REVOKE ALL ON public.vw_document_lifecycle_min FROM anon;
GRANT SELECT ON public.vw_document_lifecycle_min TO authenticated;

CREATE OR REPLACE FUNCTION public.document_lifecycle_status(_doc_type text, _doc_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  SELECT lifecycle_status
  FROM public.vw_document_lifecycle_min
  WHERE doc_type = _doc_type AND doc_id = _doc_id
$$;

REVOKE ALL ON FUNCTION public.document_lifecycle_status(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.document_lifecycle_status(text, uuid) TO authenticated;

COMMENT ON VIEW public.vw_document_lifecycle IS
  'Single source of truth for document lifecycle status (draft/posted/cancelled), normalized across sales_invoices, purchase_invoices, sales_returns, purchase_returns, payment_entries, supplier_payments, dispatches, goods_receipts, inventory_adjustments, stock_take_sheets, vouchers. Do not add new per-report status filters -- extend this view instead. security_invoker=on so RLS on source tables still applies.';
