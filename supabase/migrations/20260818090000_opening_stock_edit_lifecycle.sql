-- Opening stock lifecycle: edit, revalue, remove.
--
-- 20260817140000_opening_stock_accounting_counterpart.sql posted the
-- Dr Opening Stock / Cr Capital counterpart when a product was CREATED with
-- stock. It fired on INSERT only, so the rest of the lifecycle still drifted.
-- Measured live on BOOTSTRAP FIX VERIFY TEST (10 units @ 100, voucher 1000):
--
--   cost 100 -> 120   expected 1200, voucher stayed 1000   -- no adjustment
--   qty  10  -> 8     expected  960, voucher stayed 1000   -- no adjustment
--   product deleted   expected reversal, voucher orphaned  -- Capital kept
--                     1000 Cr with no stock behind it, i.e. a phantom LOSS,
--                     the same class of bug in the other direction
--
-- Also observed: editing products.stock writes no inventory_movements row at
-- all, so stock moved with no audit trail. Anchoring the opening entry to the
-- 'initial' movement (below) closes that too -- the row is now kept in step
-- with qty/rate/value instead of being written once and abandoned.
--
-- ── Why this cannot be triggered off products.stock or the cost columns ───
--
-- 16 SQL functions UPDATE products.stock -- sales_invoice_autopost,
-- grn_item_apply_hold_stock, dispatch_items_stock_sync, create_sales_return,
-- create_purchase_return, post_stock_take, create_inventory_adjustment and
-- friends. A trigger that adjusted Capital whenever stock changed would move
-- Capital on every single sale.
--
-- sync_cost_price_from_purchases() rewrites products.purchase_price from the
-- latest purchase invoice. A trigger that revalued on cost change would
-- retrospectively revalue historical opening stock on every purchase.
--
-- So the opening event is anchored to the one thing trading never rewrites:
-- the movement_type='initial' inventory_movements row. Trading appends new
-- rows; it never edits that one. "Has this product traded?" is therefore
-- exactly "does a non-initial movement exist?", and once one does the
-- opening entry is LOCKED -- the Tally rule, and the one chosen for this
-- change: after that point a stock edit is a stock adjustment (which has its
-- own accounting via create_inventory_adjustment), not an opening correction.
--
-- ── Why a DEFERRED constraint trigger ────────────────────────────────────
--
-- The trading functions above update products.stock and insert their
-- inventory_movements row in the same transaction, and not always in that
-- order. A plain AFTER UPDATE trigger can therefore observe "stock changed,
-- no non-initial movement yet" mid-transaction and mistake a sale for an
-- opening edit. A DEFERRABLE INITIALLY DEFERRED constraint trigger runs at
-- COMMIT, by which point the movement row is there and the lock test is
-- accurate. Same tool the codebase already uses for
-- trg_voucher_items_check_balance_deferred.
--
-- sync_product_opening_stock() is idempotent (it re-derives the target value
-- and returns early when the voucher already matches), so firing once per
-- statement in a multi-update transaction converges on the same result and
-- causes no ledger churn.
--
-- ── Adjust in place, never duplicate ─────────────────────────────────────
--
-- prevent_posted_voucher_item_edit() blocks UPDATEing dr/cr on a posted
-- voucher's lines, but permits DELETE. So a revaluation deletes both lines
-- (voucher_items_balance_trigger reverses -delta) and inserts the new pair
-- (+delta), leaving ONE product_opening_stock voucher whose number and date
-- never change. This is the same delete-then-insert repost pattern
-- repostVoucherItems() uses in src/lib/voucherService.ts.
--
-- Two existing guards are deliberately left to fire on that repost:
-- enforce_financial_year_lock (cannot restate a closed FY) and
-- enforce_voucher_backdate_window (restating an opening voucher dated
-- further back than the business's backdating window needs the "Can
-- Backdate Voucher" right). Failing loudly there is correct.

-- ── 1. Shared cost basis ──────────────────────────────────────────────────
-- Mirrors computeClosingStockValue()'s unitCost() in src/lib/accounting.ts:
-- first POSITIVE of purchase_price, cost_price, dealer_rate, mrp -- a 0 in a
-- price column means "not entered" in this schema, not a real zero cost.

CREATE OR REPLACE FUNCTION public.opening_stock_unit_cost(
  _purchase_price numeric, _cost_price numeric, _dealer_rate numeric, _mrp numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $function$
  SELECT COALESCE(NULLIF(_purchase_price,0), NULLIF(_cost_price,0), NULLIF(_dealer_rate,0), NULLIF(_mrp,0), 0);
$function$;

-- ── 2. The one place that decides what the opening voucher should be ──────

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

-- ── 3. Product create: movement row, then the shared sync ─────────────────
-- The voucher logic that 20260817140000 inlined here now lives in
-- sync_product_opening_stock() so create and edit cannot drift apart.

CREATE OR REPLACE FUNCTION public.products_initial_movement()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_cost numeric;
BEGIN
  v_cost := public.opening_stock_unit_cost(NEW.purchase_price, NEW.cost_price, NEW.dealer_rate, NEW.mrp);

  INSERT INTO public.inventory_movements(user_id, business_id, product_id, movement_type, qty,
                                         stock_before, stock_after, reference_id, reference_type,
                                         notes, rate, value)
  VALUES (NEW.user_id, NEW.business_id, NEW.id, 'initial', COALESCE(NEW.stock,0), 0, COALESCE(NEW.stock,0),
          NEW.id, 'product_create', 'Product created', v_cost,
          ROUND(COALESCE(NEW.stock,0) * v_cost, 2));

  RETURN NEW;
END $function$;

-- ── 4. Deferred sync on create and edit ───────────────────────────────────
-- No WHEN clause: a constraint trigger cannot reference OLD on INSERT, and
-- by commit time the row may have been touched several times anyway. The
-- cheap early-exits inside sync_product_opening_stock() (traded already /
-- voucher already matches) carry the cost instead, so an unrelated product
-- edit does no work.

CREATE OR REPLACE FUNCTION public.products_opening_stock_sync_trigger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  -- Row may have been deleted later in the same transaction; the deferred
  -- fire would then find nothing, which sync handles by returning early.
  PERFORM public.sync_product_opening_stock(NEW.id);
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_products_opening_stock_sync ON public.products;
CREATE CONSTRAINT TRIGGER trg_products_opening_stock_sync
  AFTER INSERT OR UPDATE ON public.products
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.products_opening_stock_sync_trigger();

-- ── 5. Product removal reverses its opening entry ─────────────────────────
-- Hard delete only; a soft delete (is_deleted) goes through the sync above,
-- which values a deleted product's opening stock at 0 and cancels.

CREATE OR REPLACE FUNCTION public.products_cancel_opening_stock()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  UPDATE public.vouchers
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancelled_reason = 'Product deleted -- opening stock reversed'
   WHERE business_id = OLD.business_id
     AND reference_type = 'product_opening_stock'
     AND reference_id = OLD.id
     AND status = 'posted';
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_products_cancel_opening_stock ON public.products;
CREATE TRIGGER trg_products_cancel_opening_stock
  BEFORE DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_cancel_opening_stock();
