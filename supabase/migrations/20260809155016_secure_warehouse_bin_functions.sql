-- P1 remediation (3a/4): secure four more anon-exec functions with no
-- auth check.
--
-- Verified: get_bin_available_stock, get_warehouse_available_stock,
-- get_default_warehouse_id (all SECURITY DEFINER, read-only), and
-- seed_unassigned_bin_for_warehouse (SECURITY DEFINER, WRITES -- creates
-- zone/rack/bin rows) all have zero internal auth/membership check and
-- EXECUTE still granted to PUBLIC/anon. An unauthenticated caller can
-- query any product/warehouse/bin's stock (info disclosure) and, worse,
-- create zone/rack/bin rows for any warehouse_id via
-- seed_unassigned_bin_for_warehouse (data pollution, no login required).
--
-- Traced legitimate callers: get_default_warehouse_id/get_bin_available_stock
-- are called from inside dispatch_items_stock_sync() (a trigger, fixed in
-- P0) -- at that point pg_trigger_depth() >= 1, so the same exemption
-- pattern used for apply_ledger_balance_delta in P0 Fix 2 applies here
-- with zero risk to any existing internal call path: direct top-level
-- anon/non-member RPC calls (pg_trigger_depth() = 0) are newly blocked,
-- every trigger-driven internal call is unaffected.

CREATE OR REPLACE FUNCTION public.get_default_warehouse_id(_business_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT id FROM public.warehouses
    WHERE business_id = _business_id AND is_default = true
    ORDER BY created_at ASC
    LIMIT 1
  );
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
    from public.inventory_movements im
    join public.warehouses w on w.id = im.warehouse_id
    where im.product_id = _product_id
      and w.business_id = v_business_id
      and w.is_default is not true;

    return coalesce(v_product_stock, 0) - v_elsewhere;
  else
    select coalesce(sum(im.qty), 0) into v_elsewhere
    from public.inventory_movements im
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
    FROM public.inventory_movements im
    JOIN public.warehouse_bins wb ON wb.id = im.bin_id
    JOIN public.warehouse_racks r ON r.id = wb.rack_id
    JOIN public.warehouse_zones z ON z.id = r.zone_id
    WHERE im.product_id = _product_id
      AND z.warehouse_id = v_warehouse_id
      AND im.bin_id <> _bin_id;

    RETURN COALESCE(v_warehouse_stock, 0) - v_elsewhere;
  ELSE
    SELECT COALESCE(SUM(im.qty), 0) INTO v_elsewhere
    FROM public.inventory_movements im
    WHERE im.product_id = _product_id AND im.bin_id = _bin_id;

    RETURN v_elsewhere;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_unassigned_bin_for_warehouse(_warehouse_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
  v_zone_id uuid;
  v_rack_id uuid;
  v_bin_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.warehouses WHERE id = _warehouse_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse not found: %', _warehouse_id;
  END IF;

  IF pg_trigger_depth() = 0 AND NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT wb.id INTO v_bin_id
  FROM public.warehouse_bins wb
  JOIN public.warehouse_racks r ON r.id = wb.rack_id
  JOIN public.warehouse_zones z ON z.id = r.zone_id
  WHERE z.warehouse_id = _warehouse_id AND wb.is_unassigned = true
  LIMIT 1;

  IF v_bin_id IS NOT NULL THEN
    RETURN v_bin_id;
  END IF;

  INSERT INTO public.warehouse_zones (business_id, warehouse_id, code, name)
  VALUES (v_business_id, _warehouse_id, 'UNZ', 'Unassigned')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET code = EXCLUDED.code
  RETURNING id INTO v_zone_id;

  INSERT INTO public.warehouse_racks (business_id, zone_id, code, name)
  VALUES (v_business_id, v_zone_id, 'UN', 'Unassigned')
  ON CONFLICT (zone_id, code) DO UPDATE SET code = EXCLUDED.code
  RETURNING id INTO v_rack_id;

  INSERT INTO public.warehouse_bins (business_id, rack_id, bin_code, bin_type, is_unassigned)
  VALUES (v_business_id, v_rack_id, 'UNASSIGNED', 'RESERVED', true)
  ON CONFLICT (rack_id, shelf_code, bin_code) DO UPDATE SET bin_code = EXCLUDED.bin_code
  RETURNING id INTO v_bin_id;

  RETURN v_bin_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_default_warehouse_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_warehouse_available_stock(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_bin_available_stock(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_unassigned_bin_for_warehouse(uuid) FROM PUBLIC, anon;
