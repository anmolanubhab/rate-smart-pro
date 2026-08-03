alter table public.orders
  add column if not exists priority text not null default 'normal'
    check (priority in ('low','normal','urgent')),
  add column if not exists due_date date,
  add column if not exists pending_reason text
    check (pending_reason is null or pending_reason in (
      'waiting_approval','stock_not_available','payment_pending',
      'credit_limit_exceeded','dispatch_pending','invoice_pending',
      'customer_hold','manual_hold'
    )),
  add column if not exists on_hold boolean not null default false,
  add column if not exists hold_reason text,
  add column if not exists hold_by uuid references auth.users(id),
  add column if not exists hold_at timestamptz,
  add column if not exists last_activity timestamptz;

create index if not exists idx_orders_pending_queue
  on public.orders (business_id, status, due_date)
  where is_deleted = false;
