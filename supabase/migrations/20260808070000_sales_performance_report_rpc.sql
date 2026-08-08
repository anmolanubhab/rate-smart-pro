-- Sales Performance Report: Salesman Group -> Salesman -> Party -> Invoice
-- drill-down, sourced from sales_invoices.salesman_id/salesman_group_id
-- (the invoice-time snapshot added in 20260808060000), never from parties'
-- or salesmen's CURRENT assignment -- that's what keeps a past invoice's
-- reported bucket stable even after a salesman/party gets reassigned later.
--
-- Two levels, same pattern as src/lib/inventoryReports.ts's summary +
-- fetchStockDrillDown split: get_sales_performance_report returns one
-- aggregated row per (group, salesman, party); get_sales_performance_invoices
-- drills one level further into the actual invoices for a chosen
-- group/salesman/party combination. Item-level drill (the last step of the
-- user's requested Group -> Salesman -> Party -> Invoice -> Item chain)
-- reuses the existing fetchInvoiceItems(invoiceId) in src/lib/salesInvoices.ts
-- -- no new RPC needed for that step.
--
-- Aggregation grain is sales_invoice_items (not sales_invoices), so a
-- Product/Segment filter narrows to just the matching line items rather
-- than pulling in a filtered invoice's unrelated lines -- "Bills" still
-- counts DISTINCT invoices, but Qty/Gross/Discount/Taxable/GST/Net only sum
-- the lines that actually matched. sales_returns is invoice-level in this
-- schema (no per-product return attribution), so the Returns figure is
-- computed once per invoice and is intentionally NOT narrowed by the
-- Product/Segment filter.

CREATE OR REPLACE FUNCTION public.get_sales_performance_report(
  p_business_id       uuid,
  p_from_date         date DEFAULT NULL::date,
  p_to_date           date DEFAULT CURRENT_DATE,
  p_salesman_group_id uuid DEFAULT NULL::uuid,
  p_salesman_id       uuid DEFAULT NULL::uuid,
  p_party_id          uuid DEFAULT NULL::uuid,
  p_segment_id        uuid DEFAULT NULL::uuid,
  p_product_id        uuid DEFAULT NULL::uuid,
  p_invoice_status    text DEFAULT NULL::text,
  p_payment_status    text DEFAULT NULL::text
)
RETURNS TABLE(
  salesman_group_id   uuid,
  salesman_group_name text,
  salesman_id         uuid,
  salesman_name       text,
  party_id            uuid,
  party_name          text,
  bills               bigint,
  total_qty           numeric,
  gross_sales         numeric,
  discount            numeric,
  taxable_value       numeric,
  gst                 numeric,
  net_sales           numeric,
  returns             numeric,
  net_revenue         numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_date date;
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_from_date := COALESCE(p_from_date, date_trunc('year', p_to_date)::date);

  RETURN QUERY
  WITH item_agg AS (
    SELECT
      si.id                                   AS invoice_id,
      si.party_id,
      si.salesman_id,
      si.salesman_group_id,
      SUM(sii.qty)                             AS qty,
      SUM(sii.mrp * sii.qty)                   AS gross_sales,
      SUM((sii.mrp - sii.net_rate) * sii.qty)   AS discount,
      SUM(sii.net_rate * sii.qty)               AS taxable_value,
      SUM(COALESCE(sii.cgst_amount,0) + COALESCE(sii.sgst_amount,0) + COALESCE(sii.igst_amount,0)) AS gst
    FROM sales_invoices si
    JOIN sales_invoice_items sii ON sii.invoice_id = si.id
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE si.business_id = p_business_id
      AND COALESCE(si.is_deleted, false) = false
      AND si.invoice_date BETWEEN v_from_date AND p_to_date
      AND (p_invoice_status IS NOT NULL OR si.status <> 'cancelled')
      AND (p_invoice_status IS NULL OR si.status = p_invoice_status)
      AND (p_salesman_group_id IS NULL OR si.salesman_group_id = p_salesman_group_id)
      AND (p_salesman_id IS NULL OR si.salesman_id = p_salesman_id)
      AND (p_party_id IS NULL OR si.party_id = p_party_id)
      AND (p_product_id IS NULL OR sii.product_id = p_product_id)
      AND (p_segment_id IS NULL OR p.segment_id = p_segment_id)
      AND (
        p_payment_status IS NULL
        OR (p_payment_status = 'unpaid'  AND COALESCE(si.paid_amount,0) <= 0)
        OR (p_payment_status = 'partial' AND COALESCE(si.paid_amount,0) > 0 AND COALESCE(si.paid_amount,0) < COALESCE(si.grand_total,0))
        OR (p_payment_status = 'paid'    AND COALESCE(si.grand_total,0) > 0 AND COALESCE(si.paid_amount,0) >= COALESCE(si.grand_total,0))
      )
    GROUP BY si.id, si.party_id, si.salesman_id, si.salesman_group_id
  ),
  returns_agg AS (
    SELECT sr.sales_invoice_id AS invoice_id, SUM(sr.total_amount) AS return_amount
    FROM sales_returns sr
    WHERE sr.business_id = p_business_id
      AND sr.status <> 'cancelled'
    GROUP BY sr.sales_invoice_id
  ),
  combined AS (
    SELECT
      ia.invoice_id, ia.party_id, ia.salesman_id, ia.salesman_group_id,
      ia.qty, ia.gross_sales, ia.discount, ia.taxable_value, ia.gst,
      (ia.taxable_value + ia.gst)      AS net_sales,
      COALESCE(ra.return_amount, 0)    AS return_amount
    FROM item_agg ia
    LEFT JOIN returns_agg ra ON ra.invoice_id = ia.invoice_id
  )
  SELECT
    c.salesman_group_id,
    COALESCE(sg.name, 'Unassigned / Legacy')  AS salesman_group_name,
    c.salesman_id,
    COALESCE(s.name, 'Unassigned / Legacy')   AS salesman_name,
    c.party_id,
    COALESCE(pt.name, 'Unknown Party')        AS party_name,
    COUNT(DISTINCT c.invoice_id)              AS bills,
    SUM(c.qty)                                AS total_qty,
    SUM(c.gross_sales)                        AS gross_sales,
    SUM(c.discount)                           AS discount,
    SUM(c.taxable_value)                      AS taxable_value,
    SUM(c.gst)                                AS gst,
    SUM(c.net_sales)                          AS net_sales,
    SUM(c.return_amount)                      AS returns,
    SUM(c.net_sales) - SUM(c.return_amount)   AS net_revenue
  FROM combined c
  LEFT JOIN salesman_groups sg ON sg.id = c.salesman_group_id
  LEFT JOIN salesmen s ON s.id = c.salesman_id
  LEFT JOIN parties pt ON pt.id = c.party_id
  GROUP BY c.salesman_group_id, sg.name, c.salesman_id, s.name, c.party_id, pt.name
  ORDER BY sg.name NULLS LAST, s.name NULLS LAST, pt.name NULLS LAST;
END;
$function$;

-- Invoice-level drill-down for a chosen group/salesman/party combination
-- (the report UI's expand step, one level below the summary above).
CREATE OR REPLACE FUNCTION public.get_sales_performance_invoices(
  p_business_id       uuid,
  p_from_date         date DEFAULT NULL::date,
  p_to_date           date DEFAULT CURRENT_DATE,
  p_salesman_group_id uuid DEFAULT NULL::uuid,
  p_salesman_id       uuid DEFAULT NULL::uuid,
  p_party_id          uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  invoice_id     uuid,
  invoice_number text,
  invoice_date   date,
  status         text,
  payment_status text,
  qty            numeric,
  taxable_value  numeric,
  gst            numeric,
  net_sales      numeric,
  returns        numeric,
  net_revenue    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_date date;
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_from_date := COALESCE(p_from_date, date_trunc('year', p_to_date)::date);

  RETURN QUERY
  WITH item_agg AS (
    SELECT
      si.id, si.invoice_number, si.invoice_date, si.status, si.paid_amount, si.grand_total,
      SUM(sii.qty)                              AS qty,
      SUM(sii.net_rate * sii.qty)                AS taxable_value,
      SUM(COALESCE(sii.cgst_amount,0) + COALESCE(sii.sgst_amount,0) + COALESCE(sii.igst_amount,0)) AS gst
    FROM sales_invoices si
    JOIN sales_invoice_items sii ON sii.invoice_id = si.id
    WHERE si.business_id = p_business_id
      AND COALESCE(si.is_deleted, false) = false
      AND si.invoice_date BETWEEN v_from_date AND p_to_date
      AND (p_salesman_group_id IS NULL OR si.salesman_group_id = p_salesman_group_id)
      AND (p_salesman_id IS NULL OR si.salesman_id = p_salesman_id)
      AND (p_party_id IS NULL OR si.party_id = p_party_id)
    GROUP BY si.id, si.invoice_number, si.invoice_date, si.status, si.paid_amount, si.grand_total
  ),
  returns_agg AS (
    SELECT sr.sales_invoice_id AS invoice_id, SUM(sr.total_amount) AS return_amount
    FROM sales_returns sr
    WHERE sr.business_id = p_business_id
      AND sr.status <> 'cancelled'
    GROUP BY sr.sales_invoice_id
  )
  SELECT
    ia.id,
    ia.invoice_number,
    ia.invoice_date,
    ia.status,
    CASE
      WHEN COALESCE(ia.paid_amount,0) <= 0 THEN 'unpaid'
      WHEN COALESCE(ia.grand_total,0) > 0 AND ia.paid_amount >= ia.grand_total THEN 'paid'
      ELSE 'partial'
    END AS payment_status,
    ia.qty,
    ia.taxable_value,
    ia.gst,
    (ia.taxable_value + ia.gst)                       AS net_sales,
    COALESCE(ra.return_amount, 0)                     AS returns,
    (ia.taxable_value + ia.gst) - COALESCE(ra.return_amount, 0) AS net_revenue
  FROM item_agg ia
  LEFT JOIN returns_agg ra ON ra.invoice_id = ia.id
  ORDER BY ia.invoice_date DESC, ia.invoice_number DESC;
END;
$function$;

NOTIFY pgrst, 'reload schema';
