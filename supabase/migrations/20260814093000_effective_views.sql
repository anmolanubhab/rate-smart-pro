-- Phase 0, Migration 4 of Tally-style voucher lifecycle redesign.
-- Purpose: the single shared "Effective Transaction / Stock Movement / Ledger
-- Posting" mechanism (requirement 7, the keystone). Nothing consumes these yet --
-- they ship dark, verified only via reconcile_effective_stock()/check_movement_integrity()
-- (next migration). Phase 4 (a later session) repoints get_stock_summary(),
-- get_stock_movement_register(), GST reports, etc. onto these views.
--
-- Why this cannot double-reverse and needs no historical data rewrite:
-- the view excludes BOTH an original movement and its compensating reversal for a
-- cancelled document (their source_doc_type/source_doc_id are identical -- see
-- previous migration's backfill). For a correctly-reversed pair today: +150 -150 = 0
-- (unchanged after this view exists). For a pair where the reversal was never
-- written (the ghost-stock bug): today +150, after this view: excluded -> 0.
-- The bug is fixed by exclusion, not by rewriting history.

CREATE VIEW public.vw_effective_stock_movements
WITH (security_invoker = on) AS
SELECT im.*
FROM public.inventory_movements im
LEFT JOIN public.vw_document_lifecycle_min dl
  ON dl.doc_type = im.source_doc_type AND dl.doc_id = im.source_doc_id
WHERE im.movement_type <> 'purchase_grn_hold'  -- non-effective placeholder, per 20260813020000
  AND (dl.doc_id IS NULL OR dl.lifecycle_status = 'posted');

REVOKE ALL ON public.vw_effective_stock_movements FROM anon;
GRANT SELECT ON public.vw_effective_stock_movements TO authenticated;

COMMENT ON VIEW public.vw_effective_stock_movements IS
  'The single source of truth for "does this stock movement currently count?" Excludes movements attached to a draft or cancelled source document. A movement whose source_doc_type is NULL, or whose source document could not be matched, is always effective (identical to pre-Phase-0 behavior -- see 20260814092000). security_invoker=on so RLS on inventory_movements still applies. Reports should read this view, not inventory_movements directly (Phase 4).';

CREATE VIEW public.vw_effective_voucher_postings
WITH (security_invoker = on) AS
SELECT vi.*, v.voucher_date, v.voucher_type, v.voucher_number, v.business_id AS v_business_id
FROM public.voucher_items vi
JOIN public.vouchers v ON v.id = vi.voucher_id
WHERE v.status = 'posted' AND COALESCE(v.is_deleted, false) = false;

REVOKE ALL ON public.vw_effective_voucher_postings FROM anon;
GRANT SELECT ON public.vw_effective_voucher_postings TO authenticated;

COMMENT ON VIEW public.vw_effective_voucher_postings IS
  'The single source of truth for "does this ledger posting currently count?" Mirrors the status=posted filter already used consistently in src/lib/accounting.ts. security_invoker=on so RLS on voucher_items/vouchers still applies.';

-- is_business_member guard, matching the pattern used by every other SECURITY
-- DEFINER inventory RPC in this codebase (see 20260814090000).
CREATE OR REPLACE FUNCTION public.effective_stock_on_hand(
  _business_id uuid,
  _product_id uuid DEFAULT NULL,
  _warehouse_id uuid DEFAULT NULL,
  _as_of date DEFAULT NULL
)
  RETURNS TABLE(product_id uuid, warehouse_id uuid, qty numeric, value numeric)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
BEGIN
  IF NOT is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    im.product_id,
    im.warehouse_id,
    SUM(im.qty) AS qty,
    SUM(COALESCE(im.value, im.qty * COALESCE(im.rate, 0))) AS value
  FROM public.vw_effective_stock_movements im
  WHERE im.business_id = _business_id
    AND (_product_id IS NULL OR im.product_id = _product_id)
    AND (_warehouse_id IS NULL OR im.warehouse_id = _warehouse_id)
    AND (_as_of IS NULL OR im.created_at <= (_as_of + 1)::timestamptz)
  GROUP BY im.product_id, im.warehouse_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.effective_stock_on_hand(uuid, uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.effective_stock_on_hand(uuid, uuid, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.effective_stock_on_hand IS
  'SECURITY DEFINER wrapper over vw_effective_stock_movements (which is itself security_invoker) -- callers still need is_business_member-equivalent access via RLS on the underlying tables. Not yet wired into any UI (Phase 0 ships dark); Phase 4 repoints Inventory.tsx onto this.';
