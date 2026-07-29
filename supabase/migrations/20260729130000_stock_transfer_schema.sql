-- Stock Transfer: real schema + workflow (Phase C1)
-- stock_transfers was a header-only stub (from_branch_id/to_branch_id referenced an
-- unused, empty `branches` table). This migration replaces it with a real
-- warehouse-to-warehouse transfer with line items, matching the GRN/PO pattern.
-- Reversible: DROP COLUMN/DROP TABLE/DROP FUNCTION the objects created below.
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE throughout).

-- ── accounting_settings: negative stock toggle (config-driven, business-scoped) ──
alter table public.accounting_settings
  add column if not exists allow_negative_stock boolean not null default false;

-- ── stock_transfers: drop dead branch columns, add real workflow columns ──
alter table public.stock_transfers
  drop column if exists from_branch_id,
  drop column if exists to_branch_id;

alter table public.stock_transfers
  add column if not exists transfer_no text,
  add column if not exists from_warehouse_id uuid references public.warehouses(id),
  add column if not exists to_warehouse_id uuid references public.warehouses(id),
  add column if not exists notes text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists dispatched_at timestamptz,
  add column if not exists received_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_transfers_status_check'
  ) then
    alter table public.stock_transfers
      add constraint stock_transfers_status_check
      check (status in ('draft', 'in_transit', 'received', 'cancelled'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_transfers_diff_warehouse_check'
  ) then
    alter table public.stock_transfers
      add constraint stock_transfers_diff_warehouse_check
      check (from_warehouse_id is null or to_warehouse_id is null or from_warehouse_id <> to_warehouse_id);
  end if;
end $$;

create unique index if not exists stock_transfers_business_transfer_no_key
  on public.stock_transfers (business_id, transfer_no) where transfer_no is not null;

-- ── stock_transfer_items: line items (did not exist before) ──
create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric not null check (qty > 0),
  unit_id uuid references public.units(id),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists stock_transfer_items_transfer_id_idx on public.stock_transfer_items(transfer_id);
create index if not exists stock_transfer_items_product_id_idx on public.stock_transfer_items(product_id);

alter table public.stock_transfer_items enable row level security;

drop policy if exists "Business members can select transfer items" on public.stock_transfer_items;
create policy "Business members can select transfer items" on public.stock_transfer_items
  for select using (exists (
    select 1 from public.stock_transfers st
    where st.id = stock_transfer_items.transfer_id and public.is_business_member(st.business_id)
  ));

drop policy if exists "Business members can insert transfer items" on public.stock_transfer_items;
create policy "Business members can insert transfer items" on public.stock_transfer_items
  for insert with check (exists (
    select 1 from public.stock_transfers st
    where st.id = stock_transfer_items.transfer_id and public.is_business_member(st.business_id)
      and st.status = 'draft'
  ));

drop policy if exists "Business members can update transfer items" on public.stock_transfer_items;
create policy "Business members can update transfer items" on public.stock_transfer_items
  for update using (exists (
    select 1 from public.stock_transfers st
    where st.id = stock_transfer_items.transfer_id and public.is_business_member(st.business_id)
      and st.status = 'draft'
  ));

drop policy if exists "Business members can delete transfer items" on public.stock_transfer_items;
create policy "Business members can delete transfer items" on public.stock_transfer_items
  for delete using (exists (
    select 1 from public.stock_transfers st
    where st.id = stock_transfer_items.transfer_id and public.is_business_member(st.business_id)
      and st.status = 'draft'
  ));

-- ── stock_transfers RLS (table existed but had zero policies — effectively unusable) ──
drop policy if exists "Business members can select stock transfers" on public.stock_transfers;
create policy "Business members can select stock transfers" on public.stock_transfers
  for select using (public.is_business_member(business_id));

drop policy if exists "Business members can insert stock transfers" on public.stock_transfers;
create policy "Business members can insert stock transfers" on public.stock_transfers
  for insert with check (public.is_business_member(business_id));

drop policy if exists "Business members can update draft stock transfers" on public.stock_transfers;
create policy "Business members can update draft stock transfers" on public.stock_transfers
  for update using (public.is_business_member(business_id) and status = 'draft');

-- ── Numbering: mirrors next_po_number ──
create or replace function public.next_stock_transfer_number(_business_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count int;
  v_number text;
begin
  select count(*) + 1 into v_count
  from public.stock_transfers
  where business_id = _business_id;

  v_number := 'ST-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');

  while exists (
    select 1 from public.stock_transfers
    where business_id = _business_id and transfer_no = v_number
  ) loop
    v_count := v_count + 1;
    v_number := 'ST-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');
  end loop;

  return v_number;
end;
$function$;

-- ── Warehouse-level available stock (residual-formula, no backfill needed) ──
-- Default warehouse = residual holder: products.stock minus whatever the ledger
-- says currently sits at any *other* (non-default) warehouse of the same business.
-- Non-default warehouse = pure ledger sum (inward - outward) of inventory_movements
-- tagged with that warehouse_id. Always reconciles: sum across all warehouses for
-- a product equals products.stock, because the residual absorbs everything not
-- explicitly tracked elsewhere.
create or replace function public.get_warehouse_available_stock(_product_id uuid, _warehouse_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
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

-- ── Workflow: draft -> in_transit (writes transfer_out ledger rows at source) ──
create or replace function public.dispatch_stock_transfer(_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_transfer record;
  v_item record;
  v_available numeric;
  v_allow_negative boolean;
  v_stock numeric;
begin
  select * into v_transfer from public.stock_transfers where id = _transfer_id for update;
  if v_transfer.id is null then
    raise exception 'Stock transfer not found';
  end if;
  if not public.is_business_member(v_transfer.business_id) then
    raise exception 'Not authorized';
  end if;
  if v_transfer.status <> 'draft' then
    raise exception 'Only draft transfers can be dispatched (current status: %)', v_transfer.status;
  end if;
  if v_transfer.from_warehouse_id is null or v_transfer.to_warehouse_id is null then
    raise exception 'From and To warehouse are required';
  end if;
  if not exists (select 1 from public.stock_transfer_items where transfer_id = _transfer_id) then
    raise exception 'Transfer has no line items';
  end if;

  select coalesce(allow_negative_stock, false) into v_allow_negative
  from public.accounting_settings where business_id = v_transfer.business_id;

  for v_item in select * from public.stock_transfer_items where transfer_id = _transfer_id loop
    v_available := public.get_warehouse_available_stock(v_item.product_id, v_transfer.from_warehouse_id);
    if not coalesce(v_allow_negative, false) and v_available < v_item.qty then
      raise exception 'Insufficient stock at source warehouse for product %. Available: %, Requested: %',
        v_item.product_id, v_available, v_item.qty;
    end if;

    select coalesce(stock, 0) into v_stock from public.products where id = v_item.product_id;

    insert into public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id,
       stock_before, stock_after, reference_id, reference_type, notes)
    values
      (auth.uid(), v_transfer.business_id, v_item.product_id, 'transfer_out', -v_item.qty, v_transfer.from_warehouse_id,
       v_stock, v_stock, _transfer_id, 'stock_transfer', 'Transfer ' || coalesce(v_transfer.transfer_no, _transfer_id::text) || ' dispatched');
  end loop;

  update public.stock_transfers
    set status = 'in_transit', dispatched_at = now(), updated_at = now()
    where id = _transfer_id;
end;
$function$;

-- ── Workflow: in_transit -> received (writes transfer_in ledger rows at dest) ──
create or replace function public.receive_stock_transfer(_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_transfer record;
  v_item record;
  v_stock numeric;
begin
  select * into v_transfer from public.stock_transfers where id = _transfer_id for update;
  if v_transfer.id is null then
    raise exception 'Stock transfer not found';
  end if;
  if not public.is_business_member(v_transfer.business_id) then
    raise exception 'Not authorized';
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'Only in-transit transfers can be received (current status: %)', v_transfer.status;
  end if;

  for v_item in select * from public.stock_transfer_items where transfer_id = _transfer_id loop
    select coalesce(stock, 0) into v_stock from public.products where id = v_item.product_id;

    insert into public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id,
       stock_before, stock_after, reference_id, reference_type, notes)
    values
      (auth.uid(), v_transfer.business_id, v_item.product_id, 'transfer_in', v_item.qty, v_transfer.to_warehouse_id,
       v_stock, v_stock, _transfer_id, 'stock_transfer', 'Transfer ' || coalesce(v_transfer.transfer_no, _transfer_id::text) || ' received');
  end loop;

  update public.stock_transfers
    set status = 'received', received_at = now(), updated_at = now()
    where id = _transfer_id;
end;
$function$;

-- ── Workflow: draft -> cancelled (no ledger entries exist yet at draft, so nothing to reverse) ──
create or replace function public.cancel_stock_transfer(_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_transfer record;
begin
  select * into v_transfer from public.stock_transfers where id = _transfer_id for update;
  if v_transfer.id is null then
    raise exception 'Stock transfer not found';
  end if;
  if not public.is_business_member(v_transfer.business_id) then
    raise exception 'Not authorized';
  end if;
  if v_transfer.status <> 'draft' then
    raise exception 'Only draft transfers can be cancelled (current status: %)', v_transfer.status;
  end if;

  update public.stock_transfers
    set status = 'cancelled', updated_at = now()
    where id = _transfer_id;
end;
$function$;
