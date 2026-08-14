-- Phase 4 (partial, continued), Tally-style voucher lifecycle redesign.
-- Purpose: repoint the remaining inventory RPCs that aggregate inventory_movements
-- directly with zero cancelled/draft filtering onto vw_effective_stock_movements.
--
-- get_stock_ageing(): its last_moves CTE (used to compute "days since last
-- movement" / ageing buckets) read raw inventory_movements -- a cancelled sale
-- or purchase could make a product look recently active when its effective
-- last movement was actually much older. get_dead_stock_report() wraps
-- get_stock_ageing(), so it's fixed transitively.
--
-- get_fsn_analysis(): its move_counts CTE (outward movement frequency, used
-- for the Fast/Slow/Non-moving classification) had the same gap. Its main
-- data already comes from get_stock_summary(), already fixed in the previous
-- migration.
--
-- get_abc_analysis()/get_warehouse_stock_summary() are NOT touched here --
-- both already wrap get_stock_summary() and are fixed transitively.
--
-- get_stock_valuation()/get_inventory_dashboard() are NOT touched here --
-- both read products.stock directly, not inventory_movements, so there is no
-- movement-level filter to fix (they inherit products.stock's own cache-drift
-- characteristics, a separate concern from what this migration addresses).
--
-- get_stock_drill_down() is deliberately NOT touched -- it is an explicit
-- full-history/audit tool (lists every transaction for one product), not a
-- balance-influencing report, so showing cancelled rows there is correct
-- behavior, not the ghost-stock bug.
--
-- get_warehouse_available_stock()/get_bin_available_stock(): both did a raw,
-- completely unfiltered SUM(im.qty) over inventory_movements (not even the
-- purchase_grn_hold exclusion). The docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md
-- "default warehouse = products.stock minus everything elsewhere" hybrid
-- shape is preserved exactly -- only the movement source swaps.

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
    FROM public.vw_effective_stock_movements im
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
    FROM public.vw_effective_stock_movements im
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

CREATE OR REPLACE FUNCTION public.get_warehouse_available_stock(_product_id uuid, _warehouse_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_default boolean;
  v_business_id uuid;
  v_product_stock numeric;
  v_elsewhere numeric;
begin
  select is_default, business_id into v_is_default, v_business_id
  from public.warehouses where id = _warehouse_id;

  if v_business_id is null then
    raise exception 'Warehouse not found';
  end if;

  IF pg_trigger_depth() = 0 AND NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  if v_is_default then
    select coalesce(stock, 0) into v_product_stock
    from public.products where id = _product_id;

    select coalesce(sum(im.qty), 0) into v_elsewhere
    from public.vw_effective_stock_movements im
    join public.warehouses w on w.id = im.warehouse_id
    where im.product_id = _product_id
      and w.business_id = v_business_id
      and w.is_default is not true;

    return coalesce(v_product_stock, 0) - v_elsewhere;
  else
    select coalesce(sum(im.qty), 0) into v_elsewhere
    from public.vw_effective_stock_movements im
    where im.product_id = _product_id
      and im.warehouse_id = _warehouse_id;

    return v_elsewhere;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_bin_available_stock(_product_id uuid, _bin_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_unassigned boolean;
  v_warehouse_id uuid;
  v_business_id uuid;
  v_warehouse_stock numeric;
  v_elsewhere numeric;
BEGIN
  SELECT wb.is_unassigned, z.warehouse_id
    INTO v_is_unassigned, v_warehouse_id
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE wb.id = _bin_id;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Bin not found: %', _bin_id;
  END IF;

  IF pg_trigger_depth() = 0 THEN
    SELECT business_id INTO v_business_id FROM public.warehouses WHERE id = v_warehouse_id;
    IF v_business_id IS NULL OR NOT public.is_business_member(v_business_id) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  IF v_is_unassigned THEN
    v_warehouse_stock := public.get_warehouse_available_stock(_product_id, v_warehouse_id);

    SELECT COALESCE(SUM(im.qty), 0) INTO v_elsewhere
    FROM public.vw_effective_stock_movements im
    JOIN public.warehouse_bins wb ON wb.id = im.bin_id
    JOIN public.warehouse_racks r ON r.id = wb.rack_id
    JOIN public.warehouse_zones z ON z.id = r.zone_id
    WHERE im.product_id = _product_id
      AND z.warehouse_id = v_warehouse_id
      AND im.bin_id <> _bin_id;

    RETURN COALESCE(v_warehouse_stock, 0) - v_elsewhere;
  ELSE
    SELECT COALESCE(SUM(im.qty), 0) INTO v_elsewhere
    FROM public.vw_effective_stock_movements im
    WHERE im.product_id = _product_id AND im.bin_id = _bin_id;

    RETURN v_elsewhere;
  END IF;
END;
$function$;
