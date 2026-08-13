-- Root cause (Stock Summary/Stock Ledger not reconciling with the
-- Inventory screen's products.stock): grn_item_apply_hold_stock() correctly
-- keeps held/damaged/shortage GRN quantity OUT of products.stock (it goes
-- into products.stock_on_hold instead, a separate column, and the
-- 'purchase_grn_hold' inventory_movements row it writes is a pure audit
-- record with stock_before = stock_after -- confirmed on every one of the
-- 27 such rows in production; only the *accepted* portion gets a real
-- 'purchase_grn' movement with a genuine stock_before/after delta).
--
-- get_stock_summary()/get_stock_movement_register() sum inventory_movements
-- .qty directly, with no notion of "this row didn't actually touch
-- available stock" -- so a held-but-not-yet-accepted GRN quantity gets
-- counted as Inward/Closing stock in every report, while the Inventory
-- screen (driven by the real products.stock counter) correctly never
-- counted it. That's the entire gap between Stock Summary and the
-- Inventory screen for GRN-heavy products.
--
-- Not fixed by substituting SUM(qty) with SUM(stock_after - stock_before)
-- everywhere: that delta is against the GLOBAL (warehouse-agnostic)
-- products.stock counter, so a transfer_in/transfer_out pair correctly
-- shows stock_before = stock_after (moving stock between warehouses
-- doesn't change the business-wide total) even though it IS a real
-- movement at the warehouse level that a warehouse-filtered report must
-- still show. Blanket-switching to delta would silently erase warehouse
-- transfers instead. The precise fix is to exclude the one movement_type
-- that's confirmed (by every single row of it) to be a non-effective
-- placeholder: 'purchase_grn_hold'.

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
      p.mrp,
      COALESCE(p.selling_price, p.dealer_rate, p.rate, p.sale_rate) AS psale_rate,
      COALESCE(p.purchase_price, p.cost_price, 0)      AS ppurchase_price
    FROM products p
    LEFT JOIN product_groups     pg  ON pg.id = p.group_id
    LEFT JOIN segments           seg ON seg.id = p.segment_id
    LEFT JOIN units              u   ON u.id = p.stock_unit_id
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
    FROM inventory_movements im
    WHERE im.business_id = p_business_id
      AND im.movement_type <> 'purchase_grn_hold'
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
    FROM inventory_movements im
    WHERE im.business_id = p_business_id
      AND im.movement_type <> 'purchase_grn_hold'
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

-- get_stock_movement_register() feeds the Stock Ledger's running balance
-- (stock_before/stock_after, both real, unaffected by this exclusion) and
-- its own Inward/Outward columns -- exclude the same non-effective rows
-- from Inward/Outward there too so Stock Ledger and Stock Summary can never
-- disagree about what counts as effective movement, while still LISTING
-- the hold event (Qty 0 in/out, so it's visibly a no-effect row rather than
-- silently vanishing from the ledger's audit trail).
CREATE OR REPLACE FUNCTION public.get_stock_movement_register(
  p_business_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT CURRENT_DATE,
  p_product_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_movement_type text DEFAULT NULL::text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, movement_date date, product_id uuid, product_name text, part_number text, movement_type text, reference_type text, reference_id uuid, voucher_number text, party_name text, warehouse_id uuid, warehouse_name text, inward_qty numeric, outward_qty numeric, rate numeric, value numeric, stock_before numeric, stock_after numeric, notes text, total_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

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
      COUNT(*) OVER()                                    AS total_rows
    FROM inventory_movements im
    JOIN products p ON p.id = im.product_id
    LEFT JOIN warehouses w ON w.id = im.warehouse_id
    WHERE im.business_id = p_business_id
      AND (p_product_id    IS NULL OR im.product_id   = p_product_id)
      AND (p_warehouse_id  IS NULL OR im.warehouse_id = p_warehouse_id)
      AND (p_movement_type IS NULL OR im.movement_type = p_movement_type)
      AND (p_from_date IS NULL OR im.created_at >= p_from_date::timestamptz)
      AND im.created_at <= (p_to_date + 1)::timestamptz
    ORDER BY mvt_date DESC, im.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT * FROM movements;
END;
$function$;
