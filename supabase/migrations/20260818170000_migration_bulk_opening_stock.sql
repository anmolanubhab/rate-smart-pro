-- Bulk Opening Stock Migration — integrate into the existing Phase 3 shared
-- Opening Balance Voucher architecture (does NOT redesign Phase 1/2/3).
--
-- Problem: Products → Import Excel (PR #72's sync_product_opening_stock())
-- posts ONE product_opening_stock voucher PER product. That's correct for
-- normal day-to-day product creation, but wrong for a Tally-style migration
-- of hundreds of products — it would litter the books with hundreds of
-- opening vouchers instead of the "one shared Opening Balance Voucher"
-- architecture Phase 3 already established for ledgers and parties.
--
-- Fix: a dedicated migration-only entry point, mig_set_product_opening_stock,
-- that:
--   * Still writes ONE inventory_movements 'initial' row PER product (so
--     stock qty/value stays product-wise and audit-accurate, same as today).
--   * Does NOT create a per-product voucher. Instead it aggregates every
--     migration-tracked product's opening value into ONE line — the SAME
--     "Opening Stock" ledger used everywhere else — on the SAME shared
--     migration voucher that mig_set_ledger_opening/mig_set_party_opening
--     already write to (via the existing _mig_upsert_line() helper).
--   * Never auto-creates a matching Capital line. Per explicit product
--     decision: the shared voucher's Dr=Cr balance is the user's
--     responsibility (a Capital/Reserves/etc. line entered on the Ledger
--     Opening tab like every other line), exactly like Ledger/Party opening
--     already works. Auto-plugging Capital for stock specifically would be
--     an inconsistent special case and could silently inflate Capital.
--   * Refuses once the product has traded (same PR #72 lock rule) or once
--     migration has been finalized (same rule _mig_upsert_line already
--     enforces for ledgers/parties) — correction after either point goes
--     through the existing Opening Balance Adjustment / Stock Adjustment
--     flows, no new correction mechanism invented here.
--   * If a product already carries its OWN posted product_opening_stock
--     voucher (e.g. it was created normally, before joining migration
--     import), that voucher is cancelled first — trg_vouchers_sync_balance_
--     on_status_change already knows how to reverse a cancelled voucher's
--     ledger deltas (same mechanism products_cancel_opening_stock() uses on
--     product delete) — so the value is never claimed twice.
--
-- The normal Products page (single add) and Products → Import Excel paths
-- are completely untouched by this migration; they still go through
-- sync_product_opening_stock() exactly as PR #72 left it. The only change
-- to that function is one early-exit guard so it stands down for the single
-- transaction mig_set_product_opening_stock() is already handling.

-- ── A. Guard: sync_product_opening_stock() stands down during a migration
--      bulk-stock write, so the deferred per-product trigger (fired by the
--      UPDATE public.products below) does not also post its own voucher for
--      the same value. Scoped with set_config(..., true) (SET LOCAL) so it
--      only affects the current transaction — the same rdpro.* signalling
--      pattern already used by the approval-gate bypass in
--      20260810162000_db_enforce_edit_approval.sql.

CREATE OR REPLACE FUNCTION public.sync_product_opening_stock(_product_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  p record;
  v_cost numeric;
  v_value numeric;
  v_voucher_id uuid;
  v_voucher_total numeric;
  v_open uuid;
  v_cap uuid;
  v_no text;
BEGIN
  IF current_setting('rdpro.migration_stock_import', true) = 'on' THEN
    RETURN;
  END IF;

  SELECT * INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND OR p.business_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, total_amount INTO v_voucher_id, v_voucher_total
  FROM public.vouchers
  WHERE business_id = p.business_id
    AND reference_type = 'product_opening_stock'
    AND reference_id = _product_id
    AND status = 'posted'
  LIMIT 1;

  -- Opening entry is locked the moment the product has traded. Anything the
  -- trading paths do to products.stock or the cost columns stops here.
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE product_id = _product_id AND movement_type <> 'initial'
  ) THEN
    RETURN;
  END IF;

  v_cost  := public.opening_stock_unit_cost(p.purchase_price, p.cost_price, p.dealer_rate, p.mrp);
  v_value := ROUND(COALESCE(p.stock,0) * v_cost, 2);
  -- A soft-deleted product holds no opening stock.
  IF COALESCE(p.is_deleted, false) THEN
    v_value := 0;
  END IF;

  -- Keep the initial movement in step with what the opening entry says, so
  -- the Movement Register and the books cannot disagree.
  UPDATE public.inventory_movements
     SET qty = COALESCE(p.stock,0), stock_after = COALESCE(p.stock,0),
         rate = v_cost, value = v_value
   WHERE product_id = _product_id AND movement_type = 'initial'
     AND (qty, rate, value) IS DISTINCT FROM (COALESCE(p.stock,0), v_cost, v_value);

  -- Already correct -- do nothing rather than churn the ledger with a
  -- -delta/+delta repost on every unrelated product edit (rename, category…).
  IF v_voucher_id IS NOT NULL AND v_voucher_total = v_value THEN
    RETURN;
  END IF;

  IF v_value <= 0 THEN
    IF v_voucher_id IS NOT NULL THEN
      -- trg_vouchers_sync_balance_on_status_change reverses both ledgers.
      UPDATE public.vouchers
         SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
             cancelled_reason = 'Opening stock removed'
       WHERE id = v_voucher_id;
    END IF;
    RETURN;
  END IF;

  SELECT id INTO v_open FROM public.ledger_accounts
   WHERE business_id = p.business_id AND name = 'Opening Stock' LIMIT 1;
  SELECT id INTO v_cap FROM public.ledger_accounts
   WHERE business_id = p.business_id AND name = 'Capital Account' LIMIT 1;

  IF v_open IS NULL OR v_cap IS NULL OR NOT public.is_business_member(p.business_id) THEN
    RAISE WARNING 'sync_product_opening_stock: product % (business %) left unposted -- missing Opening Stock/Capital Account ledger, or no authenticated business member', _product_id, p.business_id;
    RETURN;
  END IF;

  IF v_voucher_id IS NULL THEN
    v_no := public.next_voucher_number(p.user_id, 'opening_balance', p.business_id);
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date,
                                 narration, total_amount, status, reference_type, reference_id, created_by)
    VALUES (p.user_id, p.business_id, v_no, 'opening_balance', CURRENT_DATE,
            'Opening stock: ' || COALESCE(p.name, p.part_number, 'product') || ' - ' || COALESCE(p.stock,0) || ' @ ' || v_cost,
            v_value, 'posted', 'product_opening_stock', _product_id, p.user_id)
    RETURNING id INTO v_voucher_id;
  ELSE
    -- Revalue in place: same voucher, same number, same date.
    DELETE FROM public.voucher_items WHERE voucher_id = v_voucher_id;
    UPDATE public.vouchers
       SET total_amount = v_value,
           narration = 'Opening stock: ' || COALESCE(p.name, p.part_number, 'product') || ' - ' || COALESCE(p.stock,0) || ' @ ' || v_cost,
           updated_at = now()
     WHERE id = v_voucher_id;
  END IF;

  INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
  VALUES (p.user_id, p.business_id, v_voucher_id, v_open, v_value, 0, 1),
         (p.user_id, p.business_id, v_voucher_id, v_cap, 0, v_value, 2);
END $function$;

-- ── B. mig_set_product_opening_stock(): the migration-only entry point ────

CREATE OR REPLACE FUNCTION public.mig_set_product_opening_stock(
  _business_id uuid, _product_id uuid, _qty numeric, _unit_cost numeric, _narration text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_voucher record;
  p record;
  v_value numeric;
  v_open uuid;
  v_existing_voucher uuid;
  v_total numeric;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','manager','accountant']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to manage opening balance migration for this business';
  END IF;
  IF _qty IS NULL OR _qty < 0 THEN
    RAISE EXCEPTION 'Opening quantity must be zero or a positive number';
  END IF;
  IF _unit_cost IS NULL OR _unit_cost < 0 THEN
    RAISE EXCEPTION 'Opening cost must be zero or a positive number';
  END IF;

  SELECT * INTO v_settings FROM public.business_migration_settings WHERE business_id = _business_id;
  IF v_settings IS NULL OR v_settings.status <> 'in_progress' OR v_settings.voucher_id IS NULL THEN
    RAISE EXCEPTION 'Start the opening balance migration (set a migration date) before entering opening stock';
  END IF;

  SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_settings.voucher_id;
  IF v_voucher IS NULL OR v_voucher.status <> 'draft' THEN
    RAISE EXCEPTION 'Opening balance voucher is not editable (already finalized) -- use Opening Balance Adjustment / Stock Adjustment instead';
  END IF;

  SELECT * INTO p FROM public.products WHERE id = _product_id AND business_id = _business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to this business';
  END IF;

  -- Same trading lock PR #72 uses: once this product has any non-initial
  -- movement, its opening entry is frozen -- a stock edit past that point is
  -- a stock adjustment, not an opening correction.
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE product_id = _product_id AND movement_type <> 'initial'
  ) THEN
    RAISE EXCEPTION 'Product "%" has already traded -- its opening stock is locked. Use Stock Adjustment instead.', COALESCE(p.name, p.part_number);
  END IF;

  v_value := ROUND(_qty * _unit_cost, 2);

  -- A product that already carries its own opening-stock voucher (created
  -- before it joined this migration import, e.g. via the normal Products
  -- page or Products -> Import Excel) would double-post if left alone -- the
  -- per-product voucher AND this shared aggregate line would both claim its
  -- value. Cancel it; the shared line takes over. Same reversal mechanism
  -- products_cancel_opening_stock() already uses on product delete.
  SELECT id INTO v_existing_voucher FROM public.vouchers
   WHERE business_id = _business_id AND reference_type = 'product_opening_stock'
     AND reference_id = _product_id AND status = 'posted';
  IF v_existing_voucher IS NOT NULL THEN
    UPDATE public.vouchers
       SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancelled_reason = 'Superseded by migration opening balance'
     WHERE id = v_existing_voucher;
  END IF;

  -- Tell sync_product_opening_stock() (fired by the products UPDATE below,
  -- via the existing deferred trigger) to stand down for this transaction --
  -- this function owns the accounting for migration-imported opening stock.
  PERFORM set_config('rdpro.migration_stock_import', 'on', true);

  UPDATE public.products SET stock = _qty, purchase_price = _unit_cost WHERE id = _product_id;

  IF EXISTS (SELECT 1 FROM public.inventory_movements WHERE product_id = _product_id AND movement_type = 'initial') THEN
    UPDATE public.inventory_movements
       SET qty = _qty, stock_after = _qty, rate = _unit_cost, value = v_value,
           reference_id = v_voucher.id, reference_type = 'migration_opening_stock',
           notes = COALESCE(_narration, 'Opening stock — migration')
     WHERE product_id = _product_id AND movement_type = 'initial';
  ELSE
    INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty,
                                            stock_before, stock_after, reference_id, reference_type,
                                            notes, rate, value)
    VALUES (auth.uid(), _business_id, _product_id, 'initial', _qty, 0, _qty,
            v_voucher.id, 'migration_opening_stock', COALESCE(_narration, 'Opening stock — migration'), _unit_cost, v_value);
  END IF;

  -- Aggregate every migration-tracked product's opening value into ONE line
  -- on the shared voucher -- never one voucher per product.
  SELECT id INTO v_open FROM public.ledger_accounts
   WHERE business_id = _business_id AND name = 'Opening Stock' LIMIT 1;
  IF v_open IS NULL THEN
    RAISE EXCEPTION 'Opening Stock ledger is missing for this business';
  END IF;

  SELECT COALESCE(SUM(im.value), 0) INTO v_total
  FROM public.inventory_movements im
  JOIN public.products pr ON pr.id = im.product_id
  WHERE pr.business_id = _business_id
    AND im.movement_type = 'initial'
    AND im.reference_type = 'migration_opening_stock';

  PERFORM public._mig_upsert_line(_business_id, v_open, v_total, 'dr', 'Opening stock — migration (aggregate)');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_set_product_opening_stock(uuid, uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_set_product_opening_stock(uuid, uuid, numeric, numeric, text) TO authenticated;

-- ── C. Read model for the wizard's Stock & Fixed Assets tab ───────────────
-- Every product currently carrying a migration-tracked opening line, so the
-- UI can list what's been imported and show a running total without a
-- second accounting mechanism -- this reads the SAME inventory_movements
-- rows part B just wrote.

CREATE OR REPLACE FUNCTION public.mig_stock_lines(_business_id uuid)
RETURNS TABLE(product_id uuid, product_name text, part_number text, qty numeric, unit_cost numeric, value numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.part_number, im.qty, im.rate, im.value
  FROM public.inventory_movements im
  JOIN public.products p ON p.id = im.product_id
  WHERE p.business_id = _business_id
    AND im.movement_type = 'initial'
    AND im.reference_type = 'migration_opening_stock'
    AND im.value > 0
  ORDER BY p.name;
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_stock_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_stock_lines(uuid) TO authenticated;
