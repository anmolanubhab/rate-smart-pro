-- Physical Stock / Stock Take: real schema + workflow (Phase D)
-- No table existed for this at all before this migration (StockTake.tsx was
-- pure mock data). A count sheet is scoped to one warehouse: system_qty is
-- snapshotted per line via get_warehouse_available_stock() (the same
-- residual-formula helper from Phase C's Stock Transfer) at the moment the
-- line is added, so it doesn't silently drift while counting is in progress.
-- Posting writes one inventory_movements row per variant line (movement_type
-- 'stock_take', tagged with the sheet's warehouse) and adjusts products.stock
-- by the delta -- a physical count correcting reality changes the true total,
-- not just the warehouse split (unlike a transfer, which only moves stock
-- between locations without changing the company-wide total).
-- Reversible: DROP TABLE/DROP FUNCTION the objects created below.
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE throughout).

create table if not exists public.stock_take_sheets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  sheet_no text,
  warehouse_id uuid not null references public.warehouses(id),
  count_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz,
  posted_by uuid
);

create unique index if not exists stock_take_sheets_business_sheet_no_key
  on public.stock_take_sheets (business_id, sheet_no) where sheet_no is not null;

create table if not exists public.stock_take_items (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.stock_take_sheets(id) on delete cascade,
  product_id uuid not null references public.products(id),
  system_qty numeric not null,
  counted_qty numeric,
  notes text,
  created_at timestamptz not null default now(),
  unique (sheet_id, product_id)
);

create index if not exists stock_take_items_sheet_id_idx on public.stock_take_items(sheet_id);
create index if not exists stock_take_items_product_id_idx on public.stock_take_items(product_id);

alter table public.stock_take_sheets enable row level security;
alter table public.stock_take_items enable row level security;

drop policy if exists "Business members can select stock take sheets" on public.stock_take_sheets;
create policy "Business members can select stock take sheets" on public.stock_take_sheets
  for select using (public.is_business_member(business_id));

drop policy if exists "Business members can insert stock take sheets" on public.stock_take_sheets;
create policy "Business members can insert stock take sheets" on public.stock_take_sheets
  for insert with check (public.is_business_member(business_id));

drop policy if exists "Business members can update draft stock take sheets" on public.stock_take_sheets;
create policy "Business members can update draft stock take sheets" on public.stock_take_sheets
  for update using (public.is_business_member(business_id) and status = 'draft');

drop policy if exists "Business members can select stock take items" on public.stock_take_items;
create policy "Business members can select stock take items" on public.stock_take_items
  for select using (exists (
    select 1 from public.stock_take_sheets s
    where s.id = stock_take_items.sheet_id and public.is_business_member(s.business_id)
  ));

drop policy if exists "Business members can insert stock take items" on public.stock_take_items;
create policy "Business members can insert stock take items" on public.stock_take_items
  for insert with check (exists (
    select 1 from public.stock_take_sheets s
    where s.id = stock_take_items.sheet_id and public.is_business_member(s.business_id)
      and s.status = 'draft'
  ));

drop policy if exists "Business members can update stock take items" on public.stock_take_items;
create policy "Business members can update stock take items" on public.stock_take_items
  for update using (exists (
    select 1 from public.stock_take_sheets s
    where s.id = stock_take_items.sheet_id and public.is_business_member(s.business_id)
      and s.status = 'draft'
  ));

drop policy if exists "Business members can delete stock take items" on public.stock_take_items;
create policy "Business members can delete stock take items" on public.stock_take_items
  for delete using (exists (
    select 1 from public.stock_take_sheets s
    where s.id = stock_take_items.sheet_id and public.is_business_member(s.business_id)
      and s.status = 'draft'
  ));

-- Numbering: mirrors next_po_number / next_stock_transfer_number. "SC-" prefix
-- (Stock Count) to avoid clashing with Stock Transfer's "ST-" numbers.
create or replace function public.next_stock_take_number(_business_id uuid)
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
  from public.stock_take_sheets
  where business_id = _business_id;

  v_number := 'SC-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');

  while exists (
    select 1 from public.stock_take_sheets
    where business_id = _business_id and sheet_no = v_number
  ) loop
    v_count := v_count + 1;
    v_number := 'SC-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');
  end loop;

  return v_number;
end;
$function$;

-- Bulk-add every active product in the sheet's warehouse's business, snapshotting
-- each one's current warehouse-level available stock. Skips products already
-- on the sheet (safe to call again after adding a few manually).
create or replace function public.stock_take_load_all_products(_sheet_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sheet record;
  v_inserted integer;
begin
  select * into v_sheet from public.stock_take_sheets where id = _sheet_id;
  if v_sheet.id is null then
    raise exception 'Stock take sheet not found';
  end if;
  if not public.is_business_member(v_sheet.business_id) then
    raise exception 'Not authorized';
  end if;
  if v_sheet.status <> 'draft' then
    raise exception 'Only draft sheets can have lines added';
  end if;

  insert into public.stock_take_items (sheet_id, product_id, system_qty)
  select _sheet_id, p.id, public.get_warehouse_available_stock(p.id, v_sheet.warehouse_id)
  from public.products p
  where p.business_id = v_sheet.business_id
    and p.is_deleted is not true
    and p.status = 'active'
    and not exists (
      select 1 from public.stock_take_items sti
      where sti.sheet_id = _sheet_id and sti.product_id = p.id
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

-- Workflow: draft -> posted. Applies every counted line's variance to
-- products.stock and writes one inventory_movements row per variant line.
-- Lines never counted (counted_qty still null) are skipped, not treated as
-- zero -- a stock take should not silently zero-out items nobody actually
-- counted.
create or replace function public.post_stock_take(_sheet_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sheet record;
  v_item record;
  v_delta numeric;
  v_before numeric;
  v_after numeric;
begin
  select * into v_sheet from public.stock_take_sheets where id = _sheet_id for update;
  if v_sheet.id is null then
    raise exception 'Stock take sheet not found';
  end if;
  if not public.is_business_member(v_sheet.business_id) then
    raise exception 'Not authorized';
  end if;
  if v_sheet.status <> 'draft' then
    raise exception 'Only draft sheets can be posted (current status: %)', v_sheet.status;
  end if;
  if not exists (select 1 from public.stock_take_items where sheet_id = _sheet_id) then
    raise exception 'Sheet has no line items';
  end if;

  for v_item in
    select * from public.stock_take_items
    where sheet_id = _sheet_id and counted_qty is not null and counted_qty <> system_qty
  loop
    v_delta := v_item.counted_qty - v_item.system_qty;

    select coalesce(stock, 0) into v_before from public.products where id = v_item.product_id;
    v_after := v_before + v_delta;

    update public.products set stock = v_after where id = v_item.product_id;

    insert into public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id,
       stock_before, stock_after, reference_id, reference_type, notes)
    values
      (auth.uid(), v_sheet.business_id, v_item.product_id, 'stock_take', v_delta, v_sheet.warehouse_id,
       v_before, v_after, _sheet_id, 'stock_take', 'Stock take ' || coalesce(v_sheet.sheet_no, _sheet_id::text) || ' variance');
  end loop;

  update public.stock_take_sheets
    set status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_at = now()
    where id = _sheet_id;
end;
$function$;

-- Workflow: draft -> cancelled (no stock has moved yet, so nothing to reverse).
create or replace function public.cancel_stock_take(_sheet_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sheet record;
begin
  select * into v_sheet from public.stock_take_sheets where id = _sheet_id for update;
  if v_sheet.id is null then
    raise exception 'Stock take sheet not found';
  end if;
  if not public.is_business_member(v_sheet.business_id) then
    raise exception 'Not authorized';
  end if;
  if v_sheet.status <> 'draft' then
    raise exception 'Only draft sheets can be cancelled (current status: %)', v_sheet.status;
  end if;

  update public.stock_take_sheets
    set status = 'cancelled', updated_at = now()
    where id = _sheet_id;
end;
$function$;
