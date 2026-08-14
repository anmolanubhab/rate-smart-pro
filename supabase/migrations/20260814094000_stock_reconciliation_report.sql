-- Phase 0, Migration 5 of Tally-style voucher lifecycle redesign.
-- Purpose: the pre-rollout proof harness for the effective-stock views, and a
-- permanent operational diagnostic tool. Both functions are read-only.

CREATE OR REPLACE FUNCTION public.reconcile_effective_stock(_business_id uuid)
  RETURNS TABLE(
    product_id uuid,
    product_name text,
    products_stock numeric,
    effective_qty numeric,
    drift numeric,
    cause text
  )
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
  WITH eff AS (
    SELECT esh.product_id, SUM(esh.qty) AS effective_qty
    FROM public.effective_stock_on_hand(_business_id) esh
    GROUP BY esh.product_id
  )
  SELECT
    p.id AS product_id,
    COALESCE(p.name, p.product_name, p.item_name, p.part_number) AS product_name,
    p.stock AS products_stock,
    COALESCE(eff.effective_qty, 0) AS effective_qty,
    p.stock - COALESCE(eff.effective_qty, 0) AS drift,
    CASE
      WHEN p.stock = COALESCE(eff.effective_qty, 0) THEN 'reconciled'
      WHEN p.stock > COALESCE(eff.effective_qty, 0) THEN 'products_stock_overstated_investigate'
      ELSE 'products_stock_understated_investigate'
    END AS cause
  FROM public.products p
  LEFT JOIN eff ON eff.product_id = p.id
  WHERE p.business_id = _business_id
    AND p.is_deleted IS NOT TRUE
    AND p.stock IS DISTINCT FROM COALESCE(eff.effective_qty, 0)
  ORDER BY ABS(p.stock - COALESCE(eff.effective_qty, 0)) DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reconcile_effective_stock(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_effective_stock(uuid) TO authenticated;

COMMENT ON FUNCTION public.reconcile_effective_stock IS
  'Diagnostic: lists every product where products.stock (the legacy denormalized cache) disagrees with effective_stock_on_hand() (the new SSOT). Every row here predates Phase 0 -- this view cannot itself create drift, it can only reveal drift that already existed via inventory_movements rows that were never reconciled. Per the locked project decision, confirmed drift is corrected via an explicit one-time inventory_adjustments voucher per product (auditable), never by silently trusting this function''s output.';

CREATE OR REPLACE FUNCTION public.check_movement_integrity(_business_id uuid)
  RETURNS TABLE(
    movement_id uuid,
    product_id uuid,
    movement_type text,
    source_doc_type text,
    source_doc_id uuid,
    lifecycle_status text,
    issue text
  )
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
    im.id AS movement_id,
    im.product_id,
    im.movement_type,
    im.source_doc_type,
    im.source_doc_id,
    dl.lifecycle_status,
    CASE
      WHEN im.source_doc_type IS NOT NULL AND dl.doc_id IS NULL
        THEN 'source_doc_type_set_but_no_matching_document (stale/orphaned reference, e.g. hard-deleted source)'
      WHEN dl.lifecycle_status = 'draft'
        THEN 'movement_attached_to_a_draft_document (potential posting leak -- investigate the writer)'
      ELSE 'unmapped_reference_type: ' || COALESCE(im.reference_type, '(null)')
    END AS issue
  FROM public.inventory_movements im
  LEFT JOIN public.vw_document_lifecycle_min dl
    ON dl.doc_type = im.source_doc_type AND dl.doc_id = im.source_doc_id
  WHERE im.business_id = _business_id
    AND (
      (im.source_doc_type IS NOT NULL AND dl.doc_id IS NULL)
      OR dl.lifecycle_status = 'draft'
      OR (im.source_doc_type IS NULL AND im.reference_type NOT IN
            ('product_create','stock_import','stock_transfer','data_fix','manual_correction',
             'dispatch_reversal','goods_receipt_reversal'))
    )
  ORDER BY im.created_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.check_movement_integrity(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_movement_integrity(uuid) TO authenticated;

COMMENT ON FUNCTION public.check_movement_integrity IS
  'Diagnostic: flags inventory_movements rows that are (a) tagged with a source document type but no matching document was found (stale/orphaned reference), (b) attached to a document currently in draft status (a potential posting leak -- per project decision this must be fixed at the writer, never silently suppressed in the effective view), or (c) carrying a reference_type this migration series does not yet recognize.';
