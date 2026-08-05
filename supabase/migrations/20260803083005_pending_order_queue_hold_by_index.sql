create index if not exists idx_orders_hold_by on public.orders (hold_by) where hold_by is not null;
