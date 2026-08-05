-- HSN Compliance Engine — order_items.hsn was a dead, unpopulated column
-- (found during Phase 1 research, not written by saveOrder() until the
-- matching src/lib/orders.ts fix). Sales Order isn't a locked tax document
-- so this isn't required for the "HSN Lock" invariant, but the column sits
-- there unused and CreateOrder.tsx already displays a product's HSN in the
-- grid — backfilling makes existing orders consistent with new ones instead
-- of leaving old rows permanently blank.
UPDATE public.order_items oi
SET hsn = pr.hsn_code
FROM public.products pr
WHERE oi.product_id = pr.id
  AND oi.hsn IS NULL
  AND pr.hsn_code IS NOT NULL;
