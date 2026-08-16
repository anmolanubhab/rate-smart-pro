-- Phase 1: give existing business-owned rows their business_id, so Phase 2 can
-- remove the `business_id IS NULL` authorization escape without making
-- legitimate historical rows unreachable.
--
-- Only deterministic ownership is backfilled here. Where the parent that would
-- prove ownership no longer exists, the row is deliberately left alone and
-- reported rather than guessed at.
--
--   sales_invoice_items  1 NULL / 1 resolvable via sales_invoices.business_id.
--                        generateInvoiceFromOrder/FromDispatch set business_id
--                        on the invoice header but never on the item rows, so
--                        EVERY invoice line ever written is NULL. Combined with
--                        the `business_id IS NULL OR has_business_role(...)`
--                        writer gates, invoice lines sat outside role
--                        enforcement entirely.
--
--   inventory_movements  81 NULL / 67 resolvable via products.business_id
--                        (all 37 'dispatch' + 25 'dispatch_reversal' rows, plus
--                        5 'product_create'). The remaining 14 'product_create'
--                        rows reference products that no longer exist; their
--                        owning business is not derivable and they are left as
--                        NULL.
--
--   order_activity_logs  302 NULL, 0 resolvable -- every row's order_id points
--                        at a deleted order. Ownership is NOT derivable, and
--                        deriving it from user_id would be a guess (the primary
--                        user owns three businesses). Left untouched by design.
--                        These are audit rows for orders that no longer exist;
--                        their RLS is user-scoped (auth.uid() = user_id), not
--                        one of the business_id-NULL writer gates, so they are
--                        not an authorization bypass.

UPDATE public.sales_invoice_items sii
SET business_id = si.business_id
FROM public.sales_invoices si
WHERE si.id = sii.invoice_id
  AND sii.business_id IS NULL
  AND si.business_id IS NOT NULL;

UPDATE public.inventory_movements m
SET business_id = p.business_id
FROM public.products p
WHERE p.id = m.product_id
  AND m.business_id IS NULL
  AND p.business_id IS NOT NULL;

-- Guard: a backfill must never invent cross-business ownership.
DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM public.sales_invoice_items sii
  JOIN public.sales_invoices si ON si.id = sii.invoice_id
  WHERE sii.business_id IS DISTINCT FROM si.business_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'sales_invoice_items business_id disagrees with parent invoice on % row(s)', bad;
  END IF;

  SELECT count(*) INTO bad
  FROM public.inventory_movements m
  JOIN public.products p ON p.id = m.product_id
  WHERE m.business_id IS NOT NULL
    AND p.business_id IS NOT NULL
    AND m.business_id IS DISTINCT FROM p.business_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'inventory_movements business_id disagrees with product owner on % row(s)', bad;
  END IF;
END
$$;

-- Invoice lines are always read and written through their parent invoice, so
-- index the column the new RLS/queries will filter on.
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_business_id
  ON public.sales_invoice_items (business_id);
