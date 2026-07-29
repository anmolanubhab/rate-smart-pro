-- Warehouse-tag existing posting flows going forward (Phase C2).
-- Per user requirement: "All new Purchase, Sales, Transfers, Adjustments and
-- Physical Stock transactions must be warehouse-tagged from this point onward."
-- Stock Transfer (C1) already writes warehouse_id. This migration retrofits
-- GRN, Stock Adjustment, and Dispatch to do the same, without touching any of
-- their existing stock-mutation math (dispatch_items_stock_sync in particular
-- was already fixed for a double-deduction bug — this ONLY adds warehouse_id
-- capture/pass-through, no other line changes).
-- Reversible: CREATE OR REPLACE back to prior definitions; DROP COLUMN the ones added here.
-- Idempotent: safe to re-run.

create or replace function public.get_default_warehouse_id(_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select id from public.warehouses
  where business_id = _business_id and is_default = true
  order by created_at asc
  limit 1;
$function$;

-- ── GRN: goods_receipts.warehouse_id already captured client-side; just thread it through ──
create or replace function public.grn_item_apply_hold_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_grn_status text;
  v_received numeric;
  v_accepted numeric;
  v_damaged numeric;
  v_biz uuid;
  v_warehouse_id uuid;
  v_stock_after numeric;
begin
  select status, business_id, warehouse_id into v_grn_status, v_biz, v_warehouse_id
  from public.goods_receipts where id = NEW.goods_receipt_id;
  if v_grn_status <> 'received' then return NEW; end if;

  v_received := coalesce(NEW.received_qty, 0);
  v_accepted := coalesce(NEW.stock_accepted_qty, NEW.accepted_qty, 0);
  v_damaged := greatest(v_received - v_accepted, 0);

  if NEW.product_id is not null and v_received > 0 then
    update public.products
       set stock_on_hold = stock_on_hold + v_received - v_accepted,
           stock = stock + v_accepted
     where id = NEW.product_id
    returning stock into v_stock_after;

    if v_accepted > 0 then
      insert into public.inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, stock_before, stock_after, reference_id, reference_type, notes)
      values (auth.uid(), v_biz, NEW.product_id, 'purchase_grn', v_accepted, v_warehouse_id, v_stock_after - v_accepted, v_stock_after, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — accepted qty moved to available stock');
    end if;
    if v_received - v_accepted > 0 then
      insert into public.inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, reference_id, reference_type, notes)
      values (auth.uid(), v_biz, NEW.product_id, 'purchase_grn_hold', v_received - v_accepted, v_warehouse_id, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — qty held pending QC/debit note');
    end if;
  end if;

  update public.goods_receipt_items
     set qc_status = case
           when v_damaged <= 0 then 'passed'
           when v_accepted <= 0 then 'failed'
           else 'partially_passed'
         end,
         qc_reviewed_at = now()
   where id = NEW.id;

  return NEW;
end;
$function$;

-- ── Stock Adjustments: add warehouse_id (optional param, defaults to business default warehouse) ──
alter table public.inventory_adjustments
  add column if not exists warehouse_id uuid references public.warehouses(id);

-- Adding a parameter changes the signature, so CREATE OR REPLACE would create a
-- second overload instead of replacing this one (ambiguous for PostgREST callers
-- that omit the new param). Drop the old 5-arg signature explicitly first.
drop function if exists public.create_inventory_adjustment(uuid, uuid, text, numeric, text);

create or replace function public.create_inventory_adjustment(
  _business_id uuid, _product_id uuid, _adjustment_type text, _qty numeric, _reason text,
  _warehouse_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_number text;
  v_before numeric;
  v_after numeric;
  v_cost numeric;
  v_value numeric;
  v_stock_ledger uuid;
  v_expense_ledger uuid;
  v_voucher uuid;
  v_warehouse_id uuid;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not authorized';
  end if;
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  if _adjustment_type not in ('increase', 'decrease') then
    raise exception 'adjustment_type must be increase or decrease';
  end if;

  v_warehouse_id := coalesce(_warehouse_id, public.get_default_warehouse_id(_business_id));

  select coalesce(stock, 0), nullif(cost_price, 0), nullif(purchase_price, 0)
    into v_before, v_cost, v_cost
  from public.products where id = _product_id and business_id = _business_id;
  if v_before is null then
    raise exception 'Product not found for this business';
  end if;
  select coalesce(nullif(cost_price, 0), nullif(purchase_price, 0)) into v_cost
  from public.products where id = _product_id;

  v_after := case when _adjustment_type = 'increase' then v_before + _qty else v_before - _qty end;
  v_number := public.next_adjustment_number(_business_id);
  v_value := case when v_cost is not null then v_cost * _qty else null end;

  insert into public.inventory_adjustments
    (business_id, user_id, product_id, adjustment_type, qty, reason, adjustment_number, unit_cost, value_impact, status, warehouse_id)
  values
    (_business_id, auth.uid(), _product_id, _adjustment_type, _qty, _reason, v_number, v_cost, v_value, 'posted', v_warehouse_id)
  returning id into v_id;

  update public.products set stock = v_after where id = _product_id;
  insert into public.inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, stock_before, stock_after, reference_id, reference_type, notes)
  values (auth.uid(), _business_id, _product_id,
    case when _adjustment_type = 'increase' then 'adjustment_in' else 'adjustment_out' end,
    case when _adjustment_type = 'increase' then _qty else -_qty end,
    v_warehouse_id, v_before, v_after, v_id, 'inventory_adjustment', coalesce(_reason, v_number));

  -- Only post a Stock Journal voucher when we have a real cost to value
  -- it with -- never fabricate a ₹0 ledger entry.
  if v_cost is not null and v_value > 0 then
    perform public.seed_accounting_defaults(auth.uid(), _business_id);
    select id into v_stock_ledger from public.ledger_accounts where business_id = _business_id and name = 'Stock-in-Hand' limit 1;
    if v_stock_ledger is null then
      insert into public.ledger_accounts (business_id, user_id, name, ledger_type, is_system)
      select _business_id, auth.uid(), 'Stock-in-Hand', 'asset', true
      where not exists (select 1 from public.ledger_accounts where business_id = _business_id and name = 'Stock-in-Hand')
      returning id into v_stock_ledger;
    end if;
    select id into v_expense_ledger from public.ledger_accounts where business_id = _business_id and name = 'Miscellaneous Expense' limit 1;

    v_number := public.next_voucher_number(auth.uid(), 'stock_journal');
    insert into public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    values (auth.uid(), _business_id, v_number, 'stock_journal', current_date,
      'Stock ' || _adjustment_type || ' — ' || coalesce(_reason, v_number), v_id, 'inventory_adjustment', v_value, 'posted')
    returning id into v_voucher;

    if _adjustment_type = 'increase' then
      insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      values (auth.uid(), _business_id, v_voucher, v_stock_ledger, v_value, 0, 1);
      if v_expense_ledger is not null then
        insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        values (auth.uid(), _business_id, v_voucher, v_expense_ledger, 0, v_value, 2);
      end if;
    else
      if v_expense_ledger is not null then
        insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        values (auth.uid(), _business_id, v_voucher, v_expense_ledger, v_value, 0, 1);
      end if;
      insert into public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      values (auth.uid(), _business_id, v_voucher, v_stock_ledger, 0, v_value, 2);
    end if;

    update public.inventory_adjustments set voucher_id = v_voucher where id = v_id;
  end if;

  return v_id;
end;
$function$;

-- ── Dispatch: add warehouse_id column, thread through the stock-sync trigger ──
alter table public.dispatches
  add column if not exists warehouse_id uuid references public.warehouses(id);

-- SURGICAL CHANGE ONLY: same body as the already-fixed dispatch_items_stock_sync,
-- with warehouse_id looked up from the dispatch row (falling back to the
-- business default warehouse when not set) and threaded into all three
-- inventory_movements INSERTs. No change to any qty/stock arithmetic.
create or replace function public.dispatch_items_stock_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_product_id uuid;
  v_user_id uuid;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_qty numeric;
  v_old_qty numeric;
  v_warehouse_id uuid;
  v_business_id uuid;
begin
  if TG_OP = 'INSERT' then
    select product_id, user_id into v_product_id, v_user_id from public.order_items where id = NEW.order_item_id;
    if v_product_id is not null then
      select d.warehouse_id, d.business_id into v_warehouse_id, v_business_id from public.dispatches d where d.id = NEW.dispatch_id;
      v_warehouse_id := coalesce(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_qty := coalesce(NEW.stock_dispatched_qty, NEW.dispatched_qty);
      select coalesce(stock,0) into v_before from public.products where id = v_product_id;
      v_after := v_before - v_qty;
      update public.products set stock = v_after where id = v_product_id;
      insert into public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, stock_before, stock_after, reference_id, reference_type, notes)
      values (v_user_id, v_product_id, 'dispatch', -v_qty, v_warehouse_id, v_before, v_after, NEW.dispatch_id, 'dispatch', NULL);
    end if;
  elsif TG_OP = 'DELETE' then
    select product_id, user_id into v_product_id, v_user_id from public.order_items where id = OLD.order_item_id;
    if v_product_id is not null then
      select d.warehouse_id, d.business_id into v_warehouse_id, v_business_id from public.dispatches d where d.id = OLD.dispatch_id;
      v_warehouse_id := coalesce(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_qty := coalesce(OLD.stock_dispatched_qty, OLD.dispatched_qty);
      select coalesce(stock,0) into v_before from public.products where id = v_product_id;
      v_after := v_before + v_qty;
      update public.products set stock = v_after where id = v_product_id;
      insert into public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, stock_before, stock_after, reference_id, reference_type, notes)
      values (v_user_id, v_product_id, 'return', v_qty, v_warehouse_id, v_before, v_after, OLD.dispatch_id, 'dispatch_reversal', 'Dispatch reversed');
    end if;
  elsif TG_OP = 'UPDATE' and (OLD.dispatched_qty <> NEW.dispatched_qty or coalesce(OLD.stock_dispatched_qty,-1) <> coalesce(NEW.stock_dispatched_qty,-1)) then
    select product_id, user_id into v_product_id, v_user_id from public.order_items where id = NEW.order_item_id;
    if v_product_id is not null then
      select d.warehouse_id, d.business_id into v_warehouse_id, v_business_id from public.dispatches d where d.id = NEW.dispatch_id;
      v_warehouse_id := coalesce(v_warehouse_id, public.get_default_warehouse_id(v_business_id));
      v_qty := coalesce(NEW.stock_dispatched_qty, NEW.dispatched_qty);
      v_old_qty := coalesce(OLD.stock_dispatched_qty, OLD.dispatched_qty);
      v_delta := v_qty - v_old_qty;
      select coalesce(stock,0) into v_before from public.products where id = v_product_id;
      v_after := v_before - v_delta;
      update public.products set stock = v_after where id = v_product_id;
      insert into public.inventory_movements(user_id, product_id, movement_type, qty, warehouse_id, stock_before, stock_after, reference_id, reference_type, notes)
      values (v_user_id, v_product_id, 'dispatch', -v_delta, v_warehouse_id, v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
    end if;
  end if;
  return NULL;
end $function$;
