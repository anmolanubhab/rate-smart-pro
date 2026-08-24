-- Stock Summary Report Configuration (Tally-style F12 panel) backend support.
-- New migration -- 20260824090000_stock_summary_drilldown_reports.sql is
-- already applied, so this extends get_stock_summary / get_stock_group_summary
-- / get_stock_movement_register with new trailing, defaulted parameters
-- rather than editing that file. All existing callers (named-param via
-- supabase-js, and get_stock_group_summary's internal positional call into
-- get_stock_summary) remain valid unchanged.
--
-- What's added, all server-side (no client-side filtering/sorting of full
-- product lists):
--   p_include_zero_balance  -- "Show Stock Items with zero Quantity" config.
--                               Only applies when p_stock_filter is NULL/'all'
--                               -- an explicit p_stock_filter='zero' request
--                               always wins (see stock_summary_config.ts).
--   p_exclude_no_transactions -- "Exclude Items With no transactions": a
--                               product with zero inward AND zero outward in
--                               the selected period is excluded, regardless
--                               of its opening/closing balance (opening-only
--                               is not "a transaction in this context").
--   p_sort_by / p_sort_dir   -- "Sorting Method" / "Sort By". CASE-gated
--                               ORDER BY (only one branch non-null per row),
--                               defaults ('name'/'asc') reproduce the exact
--                               previous hardcoded ordering.
--   p_rack (get_stock_summary only) -- lets Level 2 filter by the rack the
--                               user drilled into when grouping="rack".
--   p_grouping (get_stock_group_summary only) -- "Type of Grouping":
--                               category (default) / brand / warehouse / rack,
--                               all real populated columns already returned
--                               by get_stock_summary -- no fake grouping.
--   Alternate-unit columns (get_stock_summary) -- alt_unit_symbol / alt_qty,
--                               sourced from the existing product_units
--                               "Measurement Engine" (src/lib/units.ts) via
--                               the product's first non-stock mapped unit.
--                               Null when the product has no such mapping
--                               (true for every product today -- product_units
--                               has 0 rows in this database -- so this reads
--                               as "unmapped", never a fabricated value).
--   p_search (get_stock_movement_register only) -- voucher/party search at
--                               the Ledger level.

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
  p_offset integer DEFAULT 0,
  p_rack text DEFAULT NULL::text,
  p_include_zero_balance boolean DEFAULT true,
  p_exclude_no_transactions boolean DEFAULT false,
  p_sort_by text DEFAULT 'name',
  p_sort_dir text DEFAULT 'asc'
)
RETURNS TABLE(
  product_id uuid, product_name text, part_number text, brand text, category text,
  product_group text, segment text, unit text, warehouse_id uuid, warehouse_name text,
  rack text,
  alt_unit_symbol text, alt_qty numeric,
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
      alt.symbol                                        AS alt_symbol,
      alt.conversion_factor                             AS alt_factor,
      p.mrp,
      COALESCE(p.selling_price, p.dealer_rate, p.rate, p.sale_rate) AS psale_rate,
      COALESCE(p.purchase_price, p.cost_price, 0)      AS ppurchase_price
    FROM products p
    LEFT JOIN product_groups     pg  ON pg.id = p.group_id
    LEFT JOIN segments           seg ON seg.id = p.segment_id
    LEFT JOIN units              u   ON u.id = p.stock_unit_id
    LEFT JOIN warehouse_bins     wb  ON wb.id = p.default_bin_id
    LEFT JOIN warehouse_racks    rk  ON rk.id = wb.rack_id
    LEFT JOIN LATERAL (
      SELECT u2.symbol, pu.conversion_factor
      FROM product_units pu
      JOIN units u2 ON u2.id = pu.unit_id
      WHERE pu.product_id = p.id AND pu.is_stock IS NOT TRUE
      ORDER BY pu.created_at
      LIMIT 1
    ) alt ON true
    WHERE p.business_id = p_business_id
      AND (p.is_deleted IS NOT TRUE)
      AND (p_brand      IS NULL OR p.brand    ILIKE p_brand)
      AND (p_category   IS NULL OR p.category ILIKE p_category)
      AND (p_group_id   IS NULL OR p.group_id = p_group_id)
      AND (p_segment_id IS NULL OR p.segment_id = p_segment_id)
      AND (p_rack       IS NULL OR rk.code ILIKE p_rack)
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
      fp.alt_symbol,
      fp.alt_factor,
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
      c.alt_symbol,
      c.alt_factor,
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
    AND (
      p_stock_filter = 'zero'      -- explicit ask always wins over the config
      OR p_include_zero_balance
      OR a.closing_qty <> 0
    )
    AND (
      NOT p_exclude_no_transactions
      OR a.inward_qty <> 0 OR a.outward_qty <> 0
    )
  ),
  with_count AS (
    SELECT *, COUNT(*) OVER() AS total_rows FROM filtered_stock
  )
  SELECT
    wc.product_id, wc.product_name, wc.part_number, wc.brand, wc.category,
    wc.product_group, wc.segment, wc.unit, wc.warehouse_id, w.warehouse_name,
    wc.rack,
    wc.alt_symbol,
    CASE WHEN COALESCE(wc.alt_factor, 0) > 0 THEN ROUND(wc.closing_qty / wc.alt_factor, 4) ELSE NULL END AS alt_qty,
    wc.mrp, wc.sale_rate, wc.purchase_price,
    wc.opening_qty, wc.opening_value, wc.inward_qty, wc.inward_value,
    wc.outward_qty, wc.outward_value, wc.closing_qty, wc.closing_value,
    wc.avg_rate, wc.margin_pct, wc.total_rows
  FROM with_count wc
  LEFT JOIN warehouses w ON w.id = wc.warehouse_id
  ORDER BY
    CASE WHEN p_sort_by = 'name'          AND p_sort_dir = 'asc'  THEN wc.product_name END ASC,
    CASE WHEN p_sort_by = 'name'          AND p_sort_dir = 'desc' THEN wc.product_name END DESC,
    CASE WHEN p_sort_by = 'closing_qty'   AND p_sort_dir = 'asc'  THEN wc.closing_qty END ASC,
    CASE WHEN p_sort_by = 'closing_qty'   AND p_sort_dir = 'desc' THEN wc.closing_qty END DESC,
    CASE WHEN p_sort_by = 'closing_value' AND p_sort_dir = 'asc'  THEN wc.closing_value END ASC,
    CASE WHEN p_sort_by = 'closing_value' AND p_sort_dir = 'desc' THEN wc.closing_value END DESC,
    CASE WHEN p_sort_by = 'opening_qty'   AND p_sort_dir = 'asc'  THEN wc.opening_qty END ASC,
    CASE WHEN p_sort_by = 'opening_qty'   AND p_sort_dir = 'desc' THEN wc.opening_qty END DESC,
    CASE WHEN p_sort_by = 'opening_value' AND p_sort_dir = 'asc'  THEN wc.opening_value END ASC,
    CASE WHEN p_sort_by = 'opening_value' AND p_sort_dir = 'desc' THEN wc.opening_value END DESC,
    CASE WHEN p_sort_by = 'inward_qty'    AND p_sort_dir = 'asc'  THEN wc.inward_qty END ASC,
    CASE WHEN p_sort_by = 'inward_qty'    AND p_sort_dir = 'desc' THEN wc.inward_qty END DESC,
    CASE WHEN p_sort_by = 'outward_qty'   AND p_sort_dir = 'asc'  THEN wc.outward_qty END ASC,
    CASE WHEN p_sort_by = 'outward_qty'   AND p_sort_dir = 'desc' THEN wc.outward_qty END DESC,
    CASE WHEN p_sort_by = 'rate'          AND p_sort_dir = 'asc'  THEN wc.avg_rate END ASC,
    CASE WHEN p_sort_by = 'rate'          AND p_sort_dir = 'desc' THEN wc.avg_rate END DESC,
    wc.product_name ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_summary(uuid, date, date, uuid, text, text, uuid, uuid, text, text, integer, integer, text, boolean, boolean, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_stock_summary(uuid, date, date, uuid, text, text, uuid, uuid, text, text, integer, integer, text, boolean, boolean, text, text) TO authenticated;

-- ── get_stock_group_summary: configurable grouping/sort/zero/no-txn ────────
DROP FUNCTION IF EXISTS public.get_stock_group_summary(uuid, date, date, uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_stock_group_summary(
  p_business_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT CURRENT_DATE,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_stock_filter text DEFAULT NULL::text,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_grouping text DEFAULT 'category',
  p_include_zero_balance boolean DEFAULT true,
  p_exclude_no_transactions boolean DEFAULT false,
  p_sort_by text DEFAULT 'name',
  p_sort_dir text DEFAULT 'asc'
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
      NULL, NULL, NULL, NULL, NULL, p_stock_filter, 100000, 0,
      NULL, p_include_zero_balance, p_exclude_no_transactions, 'name', 'asc'
    )
  ),
  grouped AS (
    SELECT
      CASE p_grouping
        WHEN 'brand'     THEN COALESCE(s.brand, 'Ungrouped')
        WHEN 'warehouse' THEN COALESCE(s.warehouse_name, 'Unassigned')
        WHEN 'rack'      THEN COALESCE(s.rack, 'Unassigned')
        ELSE                  COALESCE(s.category, 'Ungrouped')
      END                                              AS gkey,
      CASE p_grouping
        WHEN 'brand'     THEN COALESCE(s.brand, 'Ungrouped')
        WHEN 'warehouse' THEN COALESCE(s.warehouse_name, 'Unassigned')
        WHEN 'rack'      THEN COALESCE(s.rack, 'Unassigned')
        ELSE                  COALESCE(s.category, 'Ungrouped')
      END                                              AS gname,
      COUNT(DISTINCT s.product_id)                    AS product_count,
      SUM(s.opening_qty)   AS opening_qty,   SUM(s.opening_value)  AS opening_value,
      SUM(s.inward_qty)    AS inward_qty,    SUM(s.inward_value)   AS inward_value,
      SUM(s.outward_qty)   AS outward_qty,   SUM(s.outward_value)  AS outward_value,
      SUM(s.closing_qty)   AS closing_qty,   SUM(s.closing_value)  AS closing_value
    FROM ss s
    WHERE (p_search IS NULL OR (
      CASE p_grouping
        WHEN 'brand'     THEN s.brand
        WHEN 'warehouse' THEN s.warehouse_name
        WHEN 'rack'      THEN s.rack
        ELSE                  s.category
      END
    ) ILIKE '%' || p_search || '%')
    GROUP BY 1
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
  ORDER BY
    CASE WHEN p_sort_by = 'name'          AND p_sort_dir = 'asc'  THEN wc.gname END ASC,
    CASE WHEN p_sort_by = 'name'          AND p_sort_dir = 'desc' THEN wc.gname END DESC,
    CASE WHEN p_sort_by = 'closing_qty'   AND p_sort_dir = 'asc'  THEN wc.closing_qty END ASC,
    CASE WHEN p_sort_by = 'closing_qty'   AND p_sort_dir = 'desc' THEN wc.closing_qty END DESC,
    CASE WHEN p_sort_by = 'closing_value' AND p_sort_dir = 'asc'  THEN wc.closing_value END ASC,
    CASE WHEN p_sort_by = 'closing_value' AND p_sort_dir = 'desc' THEN wc.closing_value END DESC,
    CASE WHEN p_sort_by = 'opening_qty'   AND p_sort_dir = 'asc'  THEN wc.opening_qty END ASC,
    CASE WHEN p_sort_by = 'opening_qty'   AND p_sort_dir = 'desc' THEN wc.opening_qty END DESC,
    CASE WHEN p_sort_by = 'opening_value' AND p_sort_dir = 'asc'  THEN wc.opening_value END ASC,
    CASE WHEN p_sort_by = 'opening_value' AND p_sort_dir = 'desc' THEN wc.opening_value END DESC,
    CASE WHEN p_sort_by = 'inward_qty'    AND p_sort_dir = 'asc'  THEN wc.inward_qty END ASC,
    CASE WHEN p_sort_by = 'inward_qty'    AND p_sort_dir = 'desc' THEN wc.inward_qty END DESC,
    CASE WHEN p_sort_by = 'outward_qty'   AND p_sort_dir = 'asc'  THEN wc.outward_qty END ASC,
    CASE WHEN p_sort_by = 'outward_qty'   AND p_sort_dir = 'desc' THEN wc.outward_qty END DESC,
    wc.gname ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_group_summary(uuid, date, date, uuid, text, text, integer, integer, text, boolean, boolean, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_stock_group_summary(uuid, date, date, uuid, text, text, integer, integer, text, boolean, boolean, text, text) TO authenticated;

-- ── get_stock_movement_register: add p_search (Ledger-level search) ────────
DROP FUNCTION IF EXISTS public.get_stock_movement_register(uuid, date, date, uuid, uuid, text, integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.get_stock_movement_register(
  p_business_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT CURRENT_DATE,
  p_product_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_movement_type text DEFAULT NULL::text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0,
  p_include_cancelled boolean DEFAULT false,
  p_search text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, movement_date date, product_id uuid, product_name text, part_number text, movement_type text, reference_type text, reference_id uuid, voucher_number text, party_name text, warehouse_id uuid, warehouse_name text, inward_qty numeric, outward_qty numeric, rate numeric, value numeric, stock_before numeric, stock_after numeric, notes text, lifecycle_status text, total_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_include_cancelled THEN
    RETURN QUERY
    WITH movements AS (
      SELECT
        im.id,
        COALESCE(im.movement_date, im.created_at::date) AS mvt_date,
        im.product_id,
        COALESCE(p.name, p.product_name, p.item_name, p.part_number) AS pname,
        p.part_number,
        im.movement_type,
        im.reference_type,
        im.reference_id,
        COALESCE(im.voucher_number, im.notes)  AS voucher_number,
        COALESCE(im.party_name, '')            AS party_name,
        im.warehouse_id,
        w.warehouse_name,
        CASE WHEN im.movement_type = 'purchase_grn_hold' THEN 0
             WHEN im.qty > 0 THEN im.qty ELSE 0 END       AS inward_qty,
        CASE WHEN im.movement_type = 'purchase_grn_hold' THEN 0
             WHEN im.qty < 0 THEN ABS(im.qty) ELSE 0 END  AS outward_qty,
        COALESCE(im.rate, 0)                               AS rate,
        COALESCE(im.value, im.qty * COALESCE(im.rate, 0)) AS value,
        COALESCE(im.stock_before, 0)                       AS stock_before,
        COALESCE(im.stock_after, 0)                        AS stock_after,
        COALESCE(im.notes, im.remarks, '')                 AS notes,
        COALESCE(dl.lifecycle_status, 'posted')             AS lifecycle_status,
        COUNT(*) OVER()                                    AS total_rows
      FROM inventory_movements im
      JOIN products p ON p.id = im.product_id
      LEFT JOIN warehouses w ON w.id = im.warehouse_id
      LEFT JOIN public.vw_document_lifecycle_min dl
        ON dl.doc_type = im.source_doc_type AND dl.doc_id = im.source_doc_id
      WHERE im.business_id = p_business_id
        AND (p_product_id    IS NULL OR im.product_id   = p_product_id)
        AND (p_warehouse_id  IS NULL OR im.warehouse_id = p_warehouse_id)
        AND (p_movement_type IS NULL OR im.movement_type = p_movement_type)
        AND (p_from_date IS NULL OR im.created_at >= p_from_date::timestamptz)
        AND im.created_at <= (p_to_date + 1)::timestamptz
        AND (p_search IS NULL OR
             COALESCE(im.voucher_number,'') || ' ' || COALESCE(im.party_name,'') || ' ' || COALESCE(im.notes,'')
             ILIKE '%' || p_search || '%')
      ORDER BY mvt_date DESC, im.created_at DESC
      LIMIT p_limit OFFSET p_offset
    )
    SELECT * FROM movements;
  ELSE
    RETURN QUERY
    WITH movements AS (
      SELECT
        im.id,
        COALESCE(im.movement_date, im.created_at::date) AS mvt_date,
        im.product_id,
        COALESCE(p.name, p.product_name, p.item_name, p.part_number) AS pname,
        p.part_number,
        im.movement_type,
        im.reference_type,
        im.reference_id,
        COALESCE(im.voucher_number, im.notes)  AS voucher_number,
        COALESCE(im.party_name, '')            AS party_name,
        im.warehouse_id,
        w.warehouse_name,
        CASE WHEN im.qty > 0 THEN im.qty ELSE 0 END        AS inward_qty,
        CASE WHEN im.qty < 0 THEN ABS(im.qty) ELSE 0 END   AS outward_qty,
        COALESCE(im.rate, 0)                               AS rate,
        COALESCE(im.value, im.qty * COALESCE(im.rate, 0)) AS value,
        COALESCE(im.stock_before, 0)                       AS stock_before,
        COALESCE(im.stock_after, 0)                        AS stock_after,
        COALESCE(im.notes, im.remarks, '')                 AS notes,
        'posted'::text                                     AS lifecycle_status,
        COUNT(*) OVER()                                    AS total_rows
      FROM public.vw_effective_stock_movements im
      JOIN products p ON p.id = im.product_id
      LEFT JOIN warehouses w ON w.id = im.warehouse_id
      WHERE im.business_id = p_business_id
        AND (p_product_id    IS NULL OR im.product_id   = p_product_id)
        AND (p_warehouse_id  IS NULL OR im.warehouse_id = p_warehouse_id)
        AND (p_movement_type IS NULL OR im.movement_type = p_movement_type)
        AND (p_from_date IS NULL OR im.created_at >= p_from_date::timestamptz)
        AND im.created_at <= (p_to_date + 1)::timestamptz
        AND (p_search IS NULL OR
             COALESCE(im.voucher_number,'') || ' ' || COALESCE(im.party_name,'') || ' ' || COALESCE(im.notes,'')
             ILIKE '%' || p_search || '%')
      ORDER BY mvt_date DESC, im.created_at DESC
      LIMIT p_limit OFFSET p_offset
    )
    SELECT * FROM movements;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_movement_register(uuid, date, date, uuid, uuid, text, integer, integer, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_stock_movement_register(uuid, date, date, uuid, uuid, text, integer, integer, boolean, text) TO authenticated;
