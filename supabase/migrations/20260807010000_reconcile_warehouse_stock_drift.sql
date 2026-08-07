-- Product Storage Management, Phase 1, step 0: reconcile pre-existing drift.
--
-- warehouse_stock, get_stock_summary(), get_warehouse_stock_summary(), and
-- set_updated_at() all exist on the live project but were never captured in
-- this migration history (applied directly against the shared project at
-- some point, like the quotations drift fixed in
-- 20260807000000_fix_quotation_save_schema_drift.sql). Captured here
-- verbatim from the live definitions so a fresh database built from this
-- migration history matches production exactly, before Phase 1 (bin
-- location management) builds anything on top of it.
--
-- No behavior change. warehouse_stock itself is confirmed dead (0 rows, no
-- writer trigger anywhere, only read by the safe-delete usage check in
-- 20260801020000_product_usage_check_for_safe_delete.sql) — the real
-- warehouse-stock numbers come entirely from get_stock_summary(), which
-- computes live off inventory_movements. Left in place rather than dropped;
-- removing dead tables is a separate, lower-risk cleanup.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout, safe to re-run.
-- Reversible: DROP FUNCTION / DROP TABLE the objects created here.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty numeric NOT NULL DEFAULT 0,
  avg_cost numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_stock TO authenticated;
GRANT ALL ON public.warehouse_stock TO service_role;

DROP POLICY IF EXISTS ws_select ON public.warehouse_stock;
DROP POLICY IF EXISTS ws_insert ON public.warehouse_stock;
DROP POLICY IF EXISTS ws_update ON public.warehouse_stock;
DROP POLICY IF EXISTS ws_delete ON public.warehouse_stock;
CREATE POLICY ws_select ON public.warehouse_stock FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY ws_insert ON public.warehouse_stock FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY ws_update ON public.warehouse_stock FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY ws_delete ON public.warehouse_stock FOR DELETE TO authenticated USING (public.is_business_member(business_id));

DROP TRIGGER IF EXISTS ws_updated_at ON public.warehouse_stock;
CREATE TRIGGER ws_updated_at BEFORE UPDATE ON public.warehouse_stock
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

CREATE OR REPLACE FUNCTION public.get_warehouse_stock_summary(
  p_business_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  warehouse_id uuid, warehouse_name text, product_count bigint,
  opening_qty numeric, opening_value numeric,
  inward_qty numeric, inward_value numeric,
  outward_qty numeric, outward_value numeric,
  closing_qty numeric, closing_value numeric
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
  SELECT
    ss.warehouse_id,
    COALESCE(ss.warehouse_name, 'Default Warehouse') AS warehouse_name,
    COUNT(DISTINCT ss.product_id)   AS product_count,
    SUM(ss.opening_qty)             AS opening_qty,
    SUM(ss.opening_value)           AS opening_value,
    SUM(ss.inward_qty)              AS inward_qty,
    SUM(ss.inward_value)            AS inward_value,
    SUM(ss.outward_qty)             AS outward_qty,
    SUM(ss.outward_value)           AS outward_value,
    SUM(ss.closing_qty)             AS closing_qty,
    SUM(ss.closing_value)           AS closing_value
  FROM get_stock_summary(p_business_id, p_from_date, p_to_date) ss
  GROUP BY ss.warehouse_id, ss.warehouse_name
  ORDER BY warehouse_name;
END;
$function$;
