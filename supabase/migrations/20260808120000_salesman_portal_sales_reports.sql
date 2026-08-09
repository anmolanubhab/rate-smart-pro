-- ═══════════════════════════════════════════════════════════════
-- Salesman Portal — Phase 5: Sales report + Party-wise Product Sales
--
-- Sibling RPCs to the existing admin drill-down reports
-- (get_sales_performance_report/invoices, get_party_part_sales_summary/
-- invoices — supabase/migrations/20260808070000_*, 20260808080000_*).
-- Same proven query bodies, but:
--   - no p_business_id / p_salesman_id params — both are derived
--     internally from the portal identity (get_current_portal_salesman_*),
--     so a client can never request another salesman's numbers
--   - gated on the portal identity existing, not is_business_member
-- The existing admin RPCs are untouched — zero risk to those already-
-- shipped reports.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_salesman_portal_sales_report(
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT CURRENT_DATE,
  p_party_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_invoice_status text DEFAULT NULL,
  p_payment_status text DEFAULT NULL
)
RETURNS TABLE(
  party_id uuid, party_name text, bills bigint, total_qty numeric,
  gross_sales numeric, discount numeric, taxable_value numeric, gst numeric,
  net_sales numeric, returns numeric, net_revenue numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_salesman_id uuid := public.get_current_portal_salesman_id();
  v_business_id uuid := public.get_current_portal_salesman_business_id();
  v_from_date   date;
BEGIN
  IF v_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Not a salesman portal identity';
  END IF;
  v_from_date := COALESCE(p_from_date, date_trunc('year', p_to_date)::date);

  RETURN QUERY
  WITH item_agg AS (
    SELECT
      si.id AS invoice_id, si.party_id,
      SUM(sii.qty) AS qty,
      SUM(sii.mrp * sii.qty) AS gross_sales,
      SUM((sii.mrp - sii.net_rate) * sii.qty) AS discount,
      SUM(sii.net_rate * sii.qty) AS taxable_value,
      SUM(COALESCE(sii.cgst_amount,0) + COALESCE(sii.sgst_amount,0) + COALESCE(sii.igst_amount,0)) AS gst
    FROM sales_invoices si
    JOIN sales_invoice_items sii ON sii.invoice_id = si.id
    WHERE si.business_id = v_business_id
      AND si.salesman_id = v_salesman_id
      AND COALESCE(si.is_deleted, false) = false
      AND si.invoice_date BETWEEN v_from_date AND p_to_date
      AND (p_invoice_status IS NOT NULL OR si.status <> 'cancelled')
      AND (p_invoice_status IS NULL OR si.status = p_invoice_status)
      AND (p_party_id IS NULL OR si.party_id = p_party_id)
      AND (p_product_id IS NULL OR sii.product_id = p_product_id)
      AND (
        p_payment_status IS NULL
        OR (p_payment_status = 'unpaid'  AND COALESCE(si.paid_amount,0) <= 0)
        OR (p_payment_status = 'partial' AND COALESCE(si.paid_amount,0) > 0 AND COALESCE(si.paid_amount,0) < COALESCE(si.grand_total,0))
        OR (p_payment_status = 'paid'    AND COALESCE(si.grand_total,0) > 0 AND COALESCE(si.paid_amount,0) >= COALESCE(si.grand_total,0))
      )
    GROUP BY si.id, si.party_id
  ),
  returns_agg AS (
    SELECT sr.sales_invoice_id AS invoice_id, SUM(sr.total_amount) AS return_amount
    FROM sales_returns sr
    WHERE sr.business_id = v_business_id AND sr.status <> 'cancelled'
    GROUP BY sr.sales_invoice_id
  ),
  combined AS (
    SELECT
      ia.invoice_id, ia.party_id, ia.qty, ia.gross_sales, ia.discount, ia.taxable_value, ia.gst,
      (ia.taxable_value + ia.gst) AS net_sales,
      COALESCE(ra.return_amount, 0) AS return_amount
    FROM item_agg ia
    LEFT JOIN returns_agg ra ON ra.invoice_id = ia.invoice_id
  )
  SELECT
    c.party_id,
    COALESCE(pt.name, 'Unknown Party') AS party_name,
    COUNT(DISTINCT c.invoice_id) AS bills,
    SUM(c.qty) AS total_qty,
    SUM(c.gross_sales) AS gross_sales,
    SUM(c.discount) AS discount,
    SUM(c.taxable_value) AS taxable_value,
    SUM(c.gst) AS gst,
    SUM(c.net_sales) AS net_sales,
    SUM(c.return_amount) AS returns,
    SUM(c.net_sales) - SUM(c.return_amount) AS net_revenue
  FROM combined c
  LEFT JOIN parties pt ON pt.id = c.party_id
  GROUP BY c.party_id, pt.name
  ORDER BY pt.name NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_salesman_portal_sales_invoices(
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT CURRENT_DATE,
  p_party_id uuid DEFAULT NULL
)
RETURNS TABLE(
  invoice_id uuid, invoice_number text, invoice_date date, status text,
  payment_status text, qty numeric, taxable_value numeric, gst numeric,
  net_sales numeric, returns numeric, net_revenue numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_salesman_id uuid := public.get_current_portal_salesman_id();
  v_business_id uuid := public.get_current_portal_salesman_business_id();
  v_from_date   date;
BEGIN
  IF v_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Not a salesman portal identity';
  END IF;
  v_from_date := COALESCE(p_from_date, date_trunc('year', p_to_date)::date);

  RETURN QUERY
  WITH item_agg AS (
    SELECT
      si.id, si.invoice_number, si.invoice_date, si.status, si.paid_amount, si.grand_total,
      SUM(sii.qty) AS qty,
      SUM(sii.net_rate * sii.qty) AS taxable_value,
      SUM(COALESCE(sii.cgst_amount,0) + COALESCE(sii.sgst_amount,0) + COALESCE(sii.igst_amount,0)) AS gst
    FROM sales_invoices si
    JOIN sales_invoice_items sii ON sii.invoice_id = si.id
    WHERE si.business_id = v_business_id
      AND si.salesman_id = v_salesman_id
      AND COALESCE(si.is_deleted, false) = false
      AND si.invoice_date BETWEEN v_from_date AND p_to_date
      AND (p_party_id IS NULL OR si.party_id = p_party_id)
    GROUP BY si.id, si.invoice_number, si.invoice_date, si.status, si.paid_amount, si.grand_total
  ),
  returns_agg AS (
    SELECT sr.sales_invoice_id AS invoice_id, SUM(sr.total_amount) AS return_amount
    FROM sales_returns sr
    WHERE sr.business_id = v_business_id AND sr.status <> 'cancelled'
    GROUP BY sr.sales_invoice_id
  )
  SELECT
    ia.id, ia.invoice_number, ia.invoice_date, ia.status,
    CASE
      WHEN COALESCE(ia.paid_amount,0) <= 0 THEN 'unpaid'
      WHEN COALESCE(ia.grand_total,0) > 0 AND ia.paid_amount >= ia.grand_total THEN 'paid'
      ELSE 'partial'
    END AS payment_status,
    ia.qty, ia.taxable_value, ia.gst,
    (ia.taxable_value + ia.gst) AS net_sales,
    COALESCE(ra.return_amount, 0) AS returns,
    (ia.taxable_value + ia.gst) - COALESCE(ra.return_amount, 0) AS net_revenue
  FROM item_agg ia
  LEFT JOIN returns_agg ra ON ra.invoice_id = ia.id
  ORDER BY ia.invoice_date DESC, ia.invoice_number DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_salesman_portal_party_part_sales(
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT CURRENT_DATE,
  p_party_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_invoice_status text DEFAULT NULL
)
RETURNS TABLE(
  part_number text, description text, product_id uuid, qty numeric,
  avg_mrp numeric, avg_rate numeric, avg_discount_pct numeric, avg_net_rate numeric,
  taxable_value numeric, gst numeric, total numeric, distinct_rate_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_salesman_id uuid := public.get_current_portal_salesman_id();
  v_business_id uuid := public.get_current_portal_salesman_business_id();
  v_from_date   date;
BEGIN
  IF v_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Not a salesman portal identity';
  END IF;
  v_from_date := COALESCE(p_from_date, date_trunc('year', p_to_date)::date);

  RETURN QUERY
  WITH base AS (
    SELECT
      sii.part_number, sii.description, sii.product_id, sii.qty, sii.mrp, sii.rate,
      sii.discount_pct, sii.net_rate,
      (sii.net_rate * sii.qty) AS taxable,
      (COALESCE(sii.cgst_amount,0) + COALESCE(sii.sgst_amount,0) + COALESCE(sii.igst_amount,0)) AS gst_amt
    FROM sales_invoices si
    JOIN sales_invoice_items sii ON sii.invoice_id = si.id
    WHERE si.business_id = v_business_id
      AND si.salesman_id = v_salesman_id
      AND COALESCE(si.is_deleted, false) = false
      AND si.invoice_date BETWEEN v_from_date AND p_to_date
      AND (p_party_id IS NULL OR si.party_id = p_party_id)
      AND (p_product_id IS NULL OR sii.product_id = p_product_id)
      AND (p_invoice_status IS NOT NULL OR si.status <> 'cancelled')
      AND (p_invoice_status IS NULL OR si.status = p_invoice_status)
      AND COALESCE(sii.part_number, '') <> ''
  )
  SELECT
    b.part_number,
    (array_agg(b.description ORDER BY b.taxable DESC))[1] AS description,
    (array_agg(b.product_id ORDER BY b.taxable DESC))[1]  AS product_id,
    SUM(b.qty) AS qty,
    SUM(b.mrp * b.qty) / NULLIF(SUM(b.qty), 0) AS avg_mrp,
    SUM(b.rate * b.qty) / NULLIF(SUM(b.qty), 0) AS avg_rate,
    SUM(b.discount_pct * b.qty) / NULLIF(SUM(b.qty), 0) AS avg_discount_pct,
    SUM(b.net_rate * b.qty) / NULLIF(SUM(b.qty), 0) AS avg_net_rate,
    SUM(b.taxable) AS taxable_value,
    SUM(b.gst_amt) AS gst,
    SUM(b.taxable + b.gst_amt) AS total,
    COUNT(DISTINCT b.net_rate) AS distinct_rate_count
  FROM base b
  GROUP BY b.part_number
  ORDER BY SUM(b.taxable + b.gst_amt) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_salesman_portal_party_part_invoices(
  p_part_number text,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT CURRENT_DATE,
  p_party_id uuid DEFAULT NULL,
  p_invoice_status text DEFAULT NULL
)
RETURNS TABLE(
  invoice_id uuid, invoice_date date, invoice_number text, qty numeric,
  mrp numeric, rate numeric, discount_pct numeric, net_rate numeric, amount numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_salesman_id uuid := public.get_current_portal_salesman_id();
  v_business_id uuid := public.get_current_portal_salesman_business_id();
  v_from_date   date;
BEGIN
  IF v_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Not a salesman portal identity';
  END IF;
  v_from_date := COALESCE(p_from_date, date_trunc('year', p_to_date)::date);

  RETURN QUERY
  SELECT
    si.id, si.invoice_date, si.invoice_number,
    sii.qty, sii.mrp, sii.rate, sii.discount_pct, sii.net_rate,
    (sii.net_rate * sii.qty) AS amount
  FROM sales_invoices si
  JOIN sales_invoice_items sii ON sii.invoice_id = si.id
  WHERE si.business_id = v_business_id
    AND si.salesman_id = v_salesman_id
    AND COALESCE(si.is_deleted, false) = false
    AND sii.part_number = p_part_number
    AND si.invoice_date BETWEEN v_from_date AND p_to_date
    AND (p_party_id IS NULL OR si.party_id = p_party_id)
    AND (p_invoice_status IS NOT NULL OR si.status <> 'cancelled')
    AND (p_invoice_status IS NULL OR si.status = p_invoice_status)
  ORDER BY si.invoice_date, si.invoice_number;
END;
$$;

REVOKE ALL ON FUNCTION public.get_salesman_portal_sales_report(date, date, uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_salesman_portal_sales_invoices(date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_salesman_portal_party_part_sales(date, date, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_salesman_portal_party_part_invoices(text, date, date, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_salesman_portal_sales_report(date, date, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salesman_portal_sales_invoices(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salesman_portal_party_part_sales(date, date, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salesman_portal_party_part_invoices(text, date, date, uuid, text) TO authenticated;
