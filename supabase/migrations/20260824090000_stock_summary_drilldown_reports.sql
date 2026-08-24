-- Stock Summary drill-down report: Group -> Product -> Ledger -> Voucher.
--
-- Reuses the existing SSOT (get_stock_summary / vw_effective_stock_movements
-- / get_stock_movement_register) -- no parallel stock-calculation engine.
-- Two changes only:
--
-- 1. get_stock_group_summary was dead/broken: `ss.product_group::uuid AS
--    group_id` tries to cast a category name like "TVS 18%" to uuid and
--    would raise on any real call. It also had no pagination, search, or
--    warehouse filter, so it couldn't back a 30-row drill-down level.
--    Replaced with a version that groups by products.category -- verified
--    live: product_groups has 0 rows and products.product_group is null on
--    every product in this database today, while category is populated on
--    every product, the same call TallyStockSummary.tsx already made
--    client-side (its own audit found the same thing). Gains p_limit/
--    p_offset/p_search/p_warehouse_id and total_rows for server-side
--    pagination.
--
-- 2. get_stock_summary gains a `rack` output column: the product's default
--    put-away/pick bin's rack code (products.default_bin_id -> warehouse_
--    bins -> warehouse_racks.code), the same Zone/Rack/Bin hierarchy GRN/
--    Dispatch/Picking already use. Null when Bin Management is off or the
--    product has no default bin -- never fabricated.

DROP FUNCTION IF EXISTS public.get_stock_group_summary(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_stock_group_summary(
  p_business_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT CURRENT_DATE,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_stock_filter text DEFAULT NULL::text,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  group_key text, group_name text, product_count bigint,
  opening_qty numeric, opening_value numeric,
  inward_qty numeric, inward_value numeric,
  outward_qty numeric, outward_value numeric,
  closing_qty numeric, closing_value numeric,
  avg_rate numeric, total_rows bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH ss AS (
    SELECT * FROM get_stock_summary(
      p_business_id, p_from_date, p_to_date, p_warehouse_id,
      NULL, NULL, NULL, NULL, NULL, p_stock_filter, 100000, 0
    )
  ),
  grouped AS (
    SELECT
      COALESCE(s.category, 'Ungrouped')               AS gkey,
      COALESCE(s.category, 'Ungrouped')                AS gname,
      COUNT(DISTINCT s.product_id)                    AS product_count,
      SUM(s.opening_qty)   AS opening_qty,   SUM(s.opening_value)  AS opening_value,
      SUM(s.inward_qty)    AS inward_qty,    SUM(s.inward_value)   AS inward_value,
      SUM(s.outward_qty)   AS outward_qty,   SUM(s.outward_value)  AS outward_value,
      SUM(s.closing_qty)   AS closing_qty,   SUM(s.closing_value)  AS closing_value
    FROM ss s
    WHERE (p_search IS NULL OR s.category ILIKE '%' || p_search || '%')
    GROUP BY COALESCE(s.category, 'Ungrouped')
  ),
  with_count AS (
    SELECT g.*,
      CASE WHEN g.closing_qty <> 0 THEN ROUND(g.closing_value / g.closing_qty, 4) ELSE 0 END AS avg_rate,
      COUNT(*) OVER() AS total_rows
    FROM grouped g
  )
  SELECT wc.gkey, wc.gname, wc.product_count,
    wc.opening_qty, wc.opening_value, wc.inward_qty, wc.inward_value,
    wc.outward_qty, wc.outward_value, wc.closing_qty, wc.closing_value,
    wc.avg_rate, wc.total_rows
  FROM with_count wc
  ORDER BY wc.gname
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_group_summary(uuid, date, date, uuid, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_stock_group_summary(uuid, date, date, uuid, text, text, integer, integer) TO authenticated;

-- ── get_stock_summary: add `rack` column ────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_stock_summary(uuid, date, date, uuid, text, text, uuid, uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_stock_summary(
  p_business_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT CURRENT_DATE,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_brand text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_group_id uuid DEFAULT NULL::uuid,
  p_segment_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_stock_filter text DEFAULT NULL::text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  product_id uuid, product_name text, part_number text, brand text, category text,
  product_group text, segment text, unit text, warehouse_id uuid, warehouse_name text,
  rack text,
  mrp numeric, sale_rate numeric, purchase_price numeric,
  opening_qty numeric, opening_value numeric, inward_qty numeric, inward_value numeric,
  outward_qty numeric, outward_value numeric, closing_qty numeric, closing_value numeric,
  avg_rate numeric, margin_pct numeric, total_rows bigint
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
  WITH filtered_products AS (
    SELECT
      p.id,
      COALESCE(p.name, p.product_name, p.item_name, p.part_number, 'Unknown') AS pname,
      p.part_number,
      p.brand,
      p.category,
      COALESCE(p.product_group, pg.name)                AS pgroup,
      seg.name                                          AS segment,
      COALESCE(p.unit, u.symbol, u.name)               AS punit,
      rk.code                                           AS rack,
      p.mrp,
      COALESCE(p.selling_price, p.dealer_rate, p.rate, p.sale_rate) AS psale_rate,
      COALESCE(p.purchase_price, p.cost_price, 0)      AS ppurchase_price
    FROM products p
    LEFT JOIN product_groups     pg  ON pg.id = p.group_id
    LEFT JOIN segments           seg ON seg.id = p.segment_id
    LEFT JOIN units              u   ON u.id = p.stock_unit_id
    LEFT JOIN warehouse_bins     wb  ON wb.id = p.default_bin_id
    LEFT JOIN warehouse_racks    rk  ON rk.id = wb.rack_id
    WHERE p.business_id = p_business_id
      AND (p.is_deleted IS NOT TRUE)
      AND (p_brand      IS NULL OR p.brand    ILIKE p_brand)
      AND (p_category   IS NULL OR p.category ILIKE p_category)
      AND (p_group_id   IS NULL OR p.group_id = p_group_id)
      AND (p_segment_id IS NULL OR p.segment_id = p_segment_id)
      AND (p_search     IS NULL OR
           COALESCE(p.name,'') || ' ' || COALESCE(p.product_name,'') || ' ' ||
           COALESCE(p.part_number,'') ILIKE '%' || p_search || '%')
  ),
  opening AS (
    SELECT
      im.product_id,
      im.warehouse_id,
      SUM(CASE WHEN im.qty > 0 THEN im.qty  ELSE 0 END) AS open_in_qty,
      SUM(CASE WHEN im.qty > 0 THEN COALESCE(im.value, im.qty * COALESCE(im.rate, 0)) ELSE 0 END) AS open_in_val,
      SUM(CASE WHEN im.qty < 0 THEN ABS(im.qty) ELSE 0 END) AS open_out_qty,
      SUM(CASE WHEN im.qty < 0 THEN ABS(COALESCE(im.value, im.qty * COALESCE(im.rate, 0))) ELSE 0 END) AS open_out_val
    FROM public.vw_effective_stock_movements im
    WHERE im.business_id = p_business_id
      AND im.created_at < v_from_date::timestamptz
      AND (p_warehouse_id IS NULL OR im.warehouse_id = p_warehouse_id)
    GROUP BY im.product_id, im.warehouse_id
  ),
  period AS (
    SELECT
      im.product_id,
      im.warehouse_id,
      SUM(CASE WHEN im.qty > 0 THEN im.qty  ELSE 0 END) AS period_in_qty,
      SUM(CASE WHEN im.qty > 0 THEN COALESCE(im.value, im.qty * COALESCE(im.rate, 0)) ELSE 0 END) AS period_in_val,
      SUM(CASE WHEN im.qty < 0 THEN ABS(im.qty) ELSE 0 END) AS period_out_qty,
      SUM(CASE WHEN im.qty < 0 THEN ABS(COALESCE(im.value, im.qty * COALESCE(im.rate, 0))) ELSE 0 END) AS period_out_val
    FROM public.vw_effective_stock_movements im
    WHERE im.business_id = p_business_id
      AND im.created_at >= v_from_date::timestamptz
      AND im.created_at <= (p_to_date + 1)::timestamptz
      AND (p_warehouse_id IS NULL OR im.warehouse_id = p_warehouse_id)
    GROUP BY im.product_id, im.warehouse_id
  ),
  combined AS (
    SELECT
      fp.id                                              AS product_id,
      fp.pname                                          AS product_name,
      fp.part_number,
      fp.brand,
      fp.category,
      fp.pgroup                                         AS product_group,
      fp.segment,
      fp.punit                                          AS unit,
      fp.rack,
      COALESCE(o.warehouse_id, per.warehouse_id)        AS warehouse_id,
      COALESCE(o.open_in_qty,  0) - COALESCE(o.open_out_qty,  0) AS opening_qty,
      COALESCE(o.open_in_val,  0) - COALESCE(o.open_out_val,  0) AS opening_value,
      COALESCE(per.period_in_qty, 0)   AS inward_qty,
      COALESCE(per.period_in_val, 0)   AS inward_value,
      COALESCE(per.period_out_qty, 0)  AS outward_qty,
      COALESCE(per.period_out_val, 0)  AS outward_value,
      fp.mrp,
      fp.psale_rate                                     AS sale_rate,
      fp.ppurchase_price                                AS purchase_price
    FROM filtered_products fp
    LEFT JOIN opening o   ON o.product_id   = fp.id
    LEFT JOIN period  per ON per.product_id = fp.id
                         AND (o.warehouse_id IS NULL OR per.warehouse_id = o.warehouse_id)
  ),
  aggregated AS (
    SELECT
      c.product_id,
      c.product_name,
      c.part_number,
      c.brand,
      c.category,
      c.product_group,
      c.segment,
      c.unit,
      c.warehouse_id,
      NULL::text                                        AS warehouse_name,
      c.rack,
      c.mrp,
      c.sale_rate,
      c.purchase_price,
      c.opening_qty,
      c.opening_value,
      c.inward_qty,
      c.inward_value,
      c.outward_qty,
      c.outward_value,
      (c.opening_qty + c.inward_qty - c.outward_qty)   AS closing_qty,
      (c.opening_value + c.inward_value - c.outward_value) AS closing_value,
      CASE WHEN (c.opening_qty + c.inward_qty - c.outward_qty) <> 0
           THEN ROUND((c.opening_value + c.inward_value - c.outward_value) /
                      (c.opening_qty + c.inward_qty - c.outward_qty), 4)
           ELSE COALESCE(c.purchase_price, 0)
      END AS avg_rate,
      CASE WHEN COALESCE(c.sale_rate, 0) > 0 AND COALESCE(c.purchase_price, 0) > 0
           THEN ROUND(((c.sale_rate - c.purchase_price) / c.sale_rate) * 100, 2)
           ELSE 0
      END AS margin_pct
    FROM combined c
  ),
  filtered_stock AS (
    SELECT a.*
    FROM aggregated a
    WHERE (p_stock_filter IS NULL OR p_stock_filter = 'all'
      OR (p_stock_filter = 'positive' AND a.closing_qty > 0)
      OR (p_stock_filter = 'negative' AND a.closing_qty < 0)
      OR (p_stock_filter = 'zero'     AND a.closing_qty = 0)
    )
  ),
  with_count AS (
    SELECT *, COUNT(*) OVER() AS total_rows FROM filtered_stock
  )
  SELECT
    wc.product_id, wc.product_name, wc.part_number, wc.brand, wc.category,
    wc.product_group, wc.segment, wc.unit, wc.warehouse_id, w.warehouse_name,
    wc.rack,
    wc.mrp, wc.sale_rate, wc.purchase_price,
    wc.opening_qty, wc.opening_value, wc.inward_qty, wc.inward_value,
    wc.outward_qty, wc.outward_value, wc.closing_qty, wc.closing_value,
    wc.avg_rate, wc.margin_pct, wc.total_rows
  FROM with_count wc
  LEFT JOIN warehouses w ON w.id = wc.warehouse_id
  ORDER BY wc.product_name
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_summary(uuid, date, date, uuid, text, text, uuid, uuid, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_stock_summary(uuid, date, date, uuid, text, text, uuid, uuid, text, text, integer, integer) TO authenticated;
