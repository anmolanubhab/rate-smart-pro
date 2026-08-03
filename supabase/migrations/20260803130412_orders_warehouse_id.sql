alter table public.orders
  add column if not exists warehouse_id uuid references public.warehouses(id);

create index if not exists idx_orders_warehouse_id on public.orders (warehouse_id) where warehouse_id is not null;
