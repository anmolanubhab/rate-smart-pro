-- Party Part-wise Sales Report: for a given party (or all parties), how much
-- of each part number was sold, at what rate, with drill-down to the actual
-- invoices. Same two-RPC split as the Sales Performance Report
-- (20260808070000_sales_performance_report_rpc.sql): one summary RPC grouped
-- by part_number, one drill-down RPC listing the invoice lines behind a
-- chosen part. No new tables -- this reads sales_invoices/sales_invoice_items
-- directly, same source data as the Sales Performance Report.
--
-- Grouped by sales_invoice_items.part_number (not product_id) since every
-- line always has a part_number but product_id can be null on older
-- free-text lines -- grouping by part_number keeps historical rows visible
-- instead of silently dropping them from the report.
--
-- avg_mrp/avg_rate/avg_discount_pct/avg_net_rate are qty-weighted averages
-- across all matching lines; distinct_rate_count flags parts sold to this
-- party at more than one net_rate over the period, which the UI uses to
-- surface the "Show Rate History" callout instead of running a second query.

CREATE OR REPLACE FUNCTION public.get_party_part_sales_summary(
  p_business_id    uuid,
  p_from_date      date DEFAULT NULL::date,
  p_to_date        date DEFAULT CURRENT_DATE,
  p_party_id       uuid DEFAULT NULL::uuid,
  p_segment_id     uuid DEFAULT NULL::uuid,
  p_product_id     uuid DEFAULT NULL::uuid,
  p_salesman_id    uuid DEFAULT NULL::uuid,
  p_invoice_status text DEFAULT NULL::text
)
RETURNS TABLE(
  part_number         text,
  description          text,
  product_id           uuid,
  qty                   numeric,
  avg_mrp               numeric,
  avg_rate              numeric,
  avg_discount_pct      numeric,
  avg_net_rate          numeric,
  taxable_value         numeric,
  gst                   numeric,
  total                 numeric,
  distinct_rate_count   bigint
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
  WITH base AS (
    SELECT
      sii.part_number,
      sii.description,
      sii.product_id,
      sii.qty,
      sii.mrp,
      sii.rate,
      sii.discount_pct,
      sii.net_rate,
      (sii.net_rate * sii.qty) AS taxable,
      (COALESCE(sii.cgst_amount,0) + COALESCE(sii.sgst_amount,0) + COALESCE(sii.igst_amount,0)) AS gst_amt
    FROM sales_invoices si
    JOIN sales_invoice_items sii ON sii.invoice_id = si.id
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE si.business_id = p_business_id
      AND COALESCE(si.is_deleted, false) = false
      AND si.invoice_date BETWEEN v_from_date AND p_to_date
      AND (p_party_id IS NULL OR si.party_id = p_party_id)
      AND (p_salesman_id IS NULL OR si.salesman_id = p_salesman_id)
      AND (p_product_id IS NULL OR sii.product_id = p_product_id)
      AND (p_segment_id IS NULL OR p.segment_id = p_segment_id)
      AND (p_invoice_status IS NOT NULL OR si.status <> 'cancelled')
      AND (p_invoice_status IS NULL OR si.status = p_invoice_status)
      AND COALESCE(sii.part_number, '') <> ''
  )
  SELECT
    b.part_number,
    (array_agg(b.description ORDER BY b.taxable DESC))[1]     AS description,
    (array_agg(b.product_id ORDER BY b.taxable DESC))[1]      AS product_id,
    SUM(b.qty)                                                 AS qty,
    SUM(b.mrp * b.qty) / NULLIF(SUM(b.qty), 0)                 AS avg_mrp,
    SUM(b.rate * b.qty) / NULLIF(SUM(b.qty), 0)                AS avg_rate,
    SUM(b.discount_pct * b.qty) / NULLIF(SUM(b.qty), 0)        AS avg_discount_pct,
    SUM(b.net_rate * b.qty) / NULLIF(SUM(b.qty), 0)            AS avg_net_rate,
    SUM(b.taxable)                                             AS taxable_value,
    SUM(b.gst_amt)                                             AS gst,
    SUM(b.taxable + b.gst_amt)                                 AS total,
    COUNT(DISTINCT b.net_rate)                                 AS distinct_rate_count
  FROM base b
  GROUP BY b.part_number
  ORDER BY SUM(b.taxable + b.gst_amt) DESC;
END;
$function$;

-- Invoice-wise drill-down behind one part number for the chosen party (and
-- whatever other filters were active on the summary call).
CREATE OR REPLACE FUNCTION public.get_party_part_sales_invoices(
  p_business_id    uuid,
  p_part_number    text,
  p_from_date      date DEFAULT NULL::date,
  p_to_date        date DEFAULT CURRENT_DATE,
  p_party_id       uuid DEFAULT NULL::uuid,
  p_salesman_id    uuid DEFAULT NULL::uuid,
  p_invoice_status text DEFAULT NULL::text
)
RETURNS TABLE(
  invoice_id     uuid,
  invoice_date   date,
  invoice_number text,
  qty            numeric,
  mrp            numeric,
  rate           numeric,
  discount_pct   numeric,
  net_rate       numeric,
  amount         numeric
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
  SELECT
    si.id, si.invoice_date, si.invoice_number,
    sii.qty, sii.mrp, sii.rate, sii.discount_pct, sii.net_rate,
    (sii.net_rate * sii.qty) AS amount
  FROM sales_invoices si
  JOIN sales_invoice_items sii ON sii.invoice_id = si.id
  WHERE si.business_id = p_business_id
    AND COALESCE(si.is_deleted, false) = false
    AND sii.part_number = p_part_number
    AND si.invoice_date BETWEEN v_from_date AND p_to_date
    AND (p_party_id IS NULL OR si.party_id = p_party_id)
    AND (p_salesman_id IS NULL OR si.salesman_id = p_salesman_id)
    AND (p_invoice_status IS NOT NULL OR si.status <> 'cancelled')
    AND (p_invoice_status IS NULL OR si.status = p_invoice_status)
  ORDER BY si.invoice_date, si.invoice_number;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_party_part_sales_summary(uuid, date, date, uuid, uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_party_part_sales_invoices(uuid, text, date, date, uuid, uuid, text) FROM anon;

NOTIFY pgrst, 'reload schema';
