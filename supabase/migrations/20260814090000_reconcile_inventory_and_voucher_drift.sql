-- Phase 0, Migration 1 of Tally-style voucher lifecycle redesign.
-- Purpose: make this migration history reproduce PRODUCTION schema exactly, so that
-- every later CREATE OR REPLACE in this series is provably a true no-op or an intended change,
-- never an accidental revert of live behavior.
--
-- Confirmed via pg_get_functiondef against production (project zskfuioojivdqmqkzjqc) on 2026-08-14:
-- these 7 inventory report RPCs exist live but appear in NO prior migration file. Captured verbatim.
-- vouchers.is_deleted/deleted_at/deleted_by/delete_reason/cancelled_at/cancelled_by/cancelled_reason/
-- is_locked/locked_at/locked_by also exist live but in no prior migration file.
--
-- This migration changes NOTHING behaviorally. It is pure drift reconciliation.

-- ---------------------------------------------------------------------------
-- 1. vouchers lifecycle columns already live in production, not yet in repo history
-- ---------------------------------------------------------------------------
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid;

-- ---------------------------------------------------------------------------
-- 2. Live-only inventory report RPCs, captured verbatim from production.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_stock_ageing(p_business_id uuid, p_as_of_date date DEFAULT CURRENT_DATE, p_warehouse_id uuid DEFAULT NULL::uuid, p_brand text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(product_id uuid, product_name text, part_number text, brand text, category text, unit text, closing_qty numeric, closing_value numeric, last_movement_date date, days_since_movement integer, bucket_0_30 numeric, bucket_31_60 numeric, bucket_61_90 numeric, bucket_91_180 numeric, bucket_181_365 numeric, bucket_365_plus numeric, ageing_bucket text, total_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH last_moves AS (
    SELECT
      im.product_id,
      MAX(im.created_at::date) AS last_move_date
    FROM inventory_movements im
    WHERE im.business_id = p_business_id
      AND im.movement_type NOT IN ('initial')
      AND (p_warehouse_id IS NULL OR im.warehouse_id = p_warehouse_id)
    GROUP BY im.product_id
  ),
  product_stock AS (
    SELECT
      p.id,
      COALESCE(p.name, p.product_name, p.item_name, p.part_number) AS pname,
      p.part_number,
      p.brand,
      p.category,
      COALESCE(p.unit, u.symbol) AS punit,
      p.stock AS closing_qty,
      p.stock * COALESCE(p.purchase_price, p.cost_price, 0) AS closing_value
    FROM products p
    LEFT JOIN units u ON u.id = p.stock_unit_id
    WHERE p.business_id = p_business_id
      AND p.is_deleted IS NOT TRUE
      AND p.stock > 0
      AND (p_brand    IS NULL OR p.brand    ILIKE p_brand)
      AND (p_category IS NULL OR p.category ILIKE p_category)
  )
  SELECT
    ps.id                                                   AS product_id,
    ps.pname                                                AS product_name,
    ps.part_number,
    ps.brand,
    ps.category,
    ps.punit                                                AS unit,
    ps.closing_qty,
    ps.closing_value,
    lm.last_move_date                                       AS last_movement_date,
    (p_as_of_date - COALESCE(lm.last_move_date, p_as_of_date - INTERVAL '999 days')::date)::int AS days_since_movement,
    -- Ageing buckets (qty allocated proportionally based on days)
    CASE WHEN (p_as_of_date - COALESCE(lm.last_move_date, p_as_of_date)::date) <= 30
         THEN ps.closing_qty ELSE 0 END AS bucket_0_30,
    CASE WHEN (p_as_of_date - COALESCE(lm.last_move_date, p_as_of_date)::date) BETWEEN 31 AND 60
         THEN ps.closing_qty ELSE 0 END AS bucket_31_60,
    CASE WHEN (p_as_of_date - COALESCE(lm.last_move_date, p_as_of_date)::date) BETWEEN 61 AND 90
         THEN ps.closing_qty ELSE 0 END AS bucket_61_90,
    CASE WHEN (p_as_of_date - COALESCE(lm.last_move_date, p_as_of_date)::date) BETWEEN 91 AND 180
         THEN ps.closing_qty ELSE 0 END AS bucket_91_180,
    CASE WHEN (p_as_of_date - COALESCE(lm.last_move_date, p_as_of_date)::date) BETWEEN 181 AND 365
         THEN ps.closing_qty ELSE 0 END AS bucket_181_365,
    CASE WHEN (p_as_of_date - COALESCE(lm.last_move_date, p_as_of_date)::date) > 365
         THEN ps.closing_qty ELSE 0 END AS bucket_365_plus,
    CASE
      WHEN lm.last_move_date IS NULL THEN 'Never Moved'
      WHEN (p_as_of_date - lm.last_move_date::date) <= 30   THEN '0-30 Days'
      WHEN (p_as_of_date - lm.last_move_date::date) <= 60   THEN '31-60 Days'
      WHEN (p_as_of_date - lm.last_move_date::date) <= 90   THEN '61-90 Days'
      WHEN (p_as_of_date - lm.last_move_date::date) <= 180  THEN '91-180 Days'
      WHEN (p_as_of_date - lm.last_move_date::date) <= 365  THEN '181-365 Days'
      ELSE '365+ Days'
    END AS ageing_bucket,
    COUNT(*) OVER() AS total_rows
  FROM product_stock ps
  LEFT JOIN last_moves lm ON lm.product_id = ps.id
  ORDER BY days_since_movement DESC NULLS FIRST
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dead_stock_report(p_business_id uuid, p_days_threshold integer DEFAULT 180, p_as_of_date date DEFAULT CURRENT_DATE, p_warehouse_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(product_id uuid, product_name text, part_number text, brand text, category text, unit text, closing_qty numeric, closing_value numeric, last_movement_date date, days_idle integer, total_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    sa.product_id,
    sa.product_name,
    sa.part_number,
    sa.brand,
    sa.category,
    sa.unit,
    sa.closing_qty,
    sa.closing_value,
    sa.last_movement_date,
    sa.days_since_movement AS days_idle,
    COUNT(*) OVER() AS total_rows
  FROM get_stock_ageing(p_business_id, p_as_of_date, p_warehouse_id) sa
  WHERE sa.days_since_movement >= p_days_threshold
    OR sa.last_movement_date IS NULL
  ORDER BY sa.days_since_movement DESC NULLS FIRST
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_abc_analysis(p_business_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT CURRENT_DATE, p_by text DEFAULT 'value'::text)
 RETURNS TABLE(product_id uuid, product_name text, part_number text, brand text, category text, unit text, outward_qty numeric, outward_value numeric, cumulative_pct numeric, abc_class text, rank bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      ss.product_id,
      ss.product_name,
      ss.part_number,
      ss.brand,
      ss.category,
      ss.unit,
      ss.outward_qty,
      ss.outward_value
    FROM get_stock_summary(p_business_id, p_from_date, p_to_date) ss
    WHERE ss.outward_qty > 0 OR ss.outward_value > 0
  ),
  ranked AS (
    SELECT
      b.*,
      ROW_NUMBER() OVER (ORDER BY
        CASE WHEN p_by = 'qty' THEN b.outward_qty ELSE b.outward_value END DESC
      ) AS rnk,
      SUM(CASE WHEN p_by = 'qty' THEN b.outward_qty ELSE b.outward_value END)
        OVER () AS grand_total
    FROM base b
  ),
  with_cumulative AS (
    SELECT
      r.*,
      ROUND(
        SUM(CASE WHEN p_by = 'qty' THEN r.outward_qty ELSE r.outward_value END)
          OVER (ORDER BY r.rnk ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        / NULLIF(r.grand_total, 0) * 100,
        2
      ) AS cum_pct
    FROM ranked r
  )
  SELECT
    wc.product_id,
    wc.product_name,
    wc.part_number,
    wc.brand,
    wc.category,
    wc.unit,
    wc.outward_qty,
    wc.outward_value,
    wc.cum_pct AS cumulative_pct,
    CASE
      WHEN wc.cum_pct <= 80 THEN 'A'
      WHEN wc.cum_pct <= 95 THEN 'B'
      ELSE 'C'
    END AS abc_class,
    wc.rnk AS rank
  FROM with_cumulative wc
  ORDER BY wc.rnk;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fsn_analysis(p_business_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT CURRENT_DATE, p_fast_threshold numeric DEFAULT 10, p_slow_threshold numeric DEFAULT 1)
 RETURNS TABLE(product_id uuid, product_name text, part_number text, brand text, category text, unit text, outward_qty numeric, outward_value numeric, movement_count bigint, closing_qty numeric, fsn_class text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH move_counts AS (
    SELECT
      im.product_id,
      COUNT(*) FILTER (WHERE im.qty < 0) AS movement_count
    FROM inventory_movements im
    WHERE im.business_id = p_business_id
      AND (p_from_date IS NULL OR im.created_at >= p_from_date::timestamptz)
      AND im.created_at <= (p_to_date + 1)::timestamptz
      AND im.movement_type NOT IN ('initial')
    GROUP BY im.product_id
  )
  SELECT
    ss.product_id,
    ss.product_name,
    ss.part_number,
    ss.brand,
    ss.category,
    ss.unit,
    ss.outward_qty,
    ss.outward_value,
    COALESCE(mc.movement_count, 0) AS movement_count,
    ss.closing_qty,
    CASE
      WHEN COALESCE(mc.movement_count, 0) = 0 OR ss.outward_qty = 0 THEN 'N'
      WHEN ss.outward_qty >= p_fast_threshold                         THEN 'F'
      WHEN ss.outward_qty >= p_slow_threshold                         THEN 'S'
      ELSE 'N'
    END AS fsn_class
  FROM get_stock_summary(p_business_id, p_from_date, p_to_date) ss
  LEFT JOIN move_counts mc ON mc.product_id = ss.product_id
  ORDER BY ss.outward_qty DESC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_stock_valuation(p_business_id uuid, p_as_of_date date DEFAULT CURRENT_DATE, p_warehouse_id uuid DEFAULT NULL::uuid, p_brand text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(product_id uuid, product_name text, part_number text, brand text, category text, unit text, closing_qty numeric, avg_cost numeric, total_cost numeric, mrp numeric, sale_rate numeric, mrp_value numeric, sale_value numeric, profit_potential numeric, total_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH stock_data AS (
    SELECT
      p.id,
      COALESCE(p.name, p.product_name, p.item_name, p.part_number) AS pname,
      p.part_number,
      p.brand,
      p.category,
      COALESCE(p.unit, u.symbol) AS punit,
      p.stock AS qty,
      COALESCE(p.purchase_price, p.cost_price, p.dealer_rate, 0) AS avg_cost,
      p.mrp,
      COALESCE(p.selling_price, p.dealer_rate, p.rate, p.sale_rate, 0) AS sale_rate,
      COUNT(*) OVER() AS total_rows
    FROM products p
    LEFT JOIN units u ON u.id = p.stock_unit_id
    WHERE p.business_id = p_business_id
      AND p.is_deleted IS NOT TRUE
      AND p.stock > 0
      AND (p_brand    IS NULL OR p.brand    ILIKE p_brand)
      AND (p_category IS NULL OR p.category ILIKE p_category)
    ORDER BY pname
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    sd.id                                         AS product_id,
    sd.pname                                      AS product_name,
    sd.part_number,
    sd.brand,
    sd.category,
    sd.punit                                      AS unit,
    sd.qty                                        AS closing_qty,
    sd.avg_cost,
    ROUND(sd.qty * sd.avg_cost, 2)               AS total_cost,
    sd.mrp,
    sd.sale_rate,
    ROUND(sd.qty * COALESCE(sd.mrp, 0), 2)       AS mrp_value,
    ROUND(sd.qty * sd.sale_rate, 2)              AS sale_value,
    ROUND(sd.qty * (sd.sale_rate - sd.avg_cost), 2) AS profit_potential,
    sd.total_rows
  FROM stock_data sd
  ORDER BY sd.pname;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_stock_drill_down(p_business_id uuid, p_product_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(transaction_date date, transaction_type text, reference_type text, reference_id uuid, voucher_number text, party_name text, warehouse_name text, inward_qty numeric, outward_qty numeric, rate numeric, value numeric, running_balance numeric, notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(im.movement_date, im.created_at::date) AS transaction_date,
    im.movement_type                                AS transaction_type,
    im.reference_type,
    im.reference_id,
    COALESCE(im.voucher_number, im.notes)           AS voucher_number,
    COALESCE(im.party_name, '')                     AS party_name,
    COALESCE(w.warehouse_name, '')                  AS warehouse_name,
    CASE WHEN im.qty > 0 THEN im.qty ELSE 0 END    AS inward_qty,
    CASE WHEN im.qty < 0 THEN ABS(im.qty) ELSE 0 END AS outward_qty,
    COALESCE(im.rate, 0)                            AS rate,
    COALESCE(im.value, im.qty * COALESCE(im.rate, 0)) AS value,
    COALESCE(im.stock_after, 0)                     AS running_balance,
    COALESCE(im.notes, im.remarks, '')              AS notes
  FROM inventory_movements im
  LEFT JOIN warehouses w ON w.id = im.warehouse_id
  WHERE im.business_id = p_business_id
    AND im.product_id = p_product_id
    AND (p_from_date IS NULL OR im.created_at >= p_from_date::timestamptz)
    AND im.created_at <= (p_to_date + 1)::timestamptz
  ORDER BY im.created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_inventory_dashboard(p_business_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(total_products bigint, total_stock_value numeric, total_mrp_value numeric, positive_stock bigint, zero_stock bigint, negative_stock bigint, low_stock bigint, dead_stock bigint, fast_moving bigint, slow_moving bigint, non_moving bigint, top_brand text, top_category text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)                                                  AS total_products,
    ROUND(SUM(p.stock * COALESCE(p.purchase_price, p.cost_price, 0)), 2) AS total_stock_value,
    ROUND(SUM(p.stock * COALESCE(p.mrp, 0)), 2)             AS total_mrp_value,
    COUNT(*) FILTER (WHERE p.stock > 0)                      AS positive_stock,
    COUNT(*) FILTER (WHERE p.stock = 0)                      AS zero_stock,
    COUNT(*) FILTER (WHERE p.stock < 0)                      AS negative_stock,
    COUNT(*) FILTER (WHERE p.stock > 0 AND p.stock <= COALESCE(p.low_stock_threshold, p.min_stock, 0) AND COALESCE(p.low_stock_threshold, p.min_stock, 0) > 0) AS low_stock,
    0::bigint                                                 AS dead_stock,
    0::bigint                                                 AS fast_moving,
    0::bigint                                                 AS slow_moving,
    0::bigint                                                 AS non_moving,
    (SELECT brand FROM products
     WHERE business_id = p_business_id AND is_deleted IS NOT TRUE AND brand IS NOT NULL
     GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 1)          AS top_brand,
    (SELECT category FROM products
     WHERE business_id = p_business_id AND is_deleted IS NOT TRUE AND category IS NOT NULL
     GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1)       AS top_category
  FROM products p
  WHERE p.business_id = p_business_id
    AND p.is_deleted IS NOT TRUE;
END;
$function$;
