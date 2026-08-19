-- Automatic scheduled backups (Phase 1).
--
-- pg_cron marks jobs "pending" on schedule; the actual zip/encrypt/upload
-- still has to happen in the backup-export Edge Function (Postgres has no
-- native zip/AES-GCM and shouldn't hold a connection open for it). If pg_net
-- is available in this project, the same cron tick calls the Edge Function
-- directly; if not, run_scheduled_backups() still marks jobs pending and the
-- Edge Function drains any due jobs the next time it's invoked (manual
-- backup, or an external ping) — exact-time precision isn't a requirement,
-- only "runs roughly on schedule without a human clicking a button".

create extension if not exists pg_cron with schema extensions;

create table public.business_backup_schedules (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  hour_utc int not null default 2 check (hour_utc between 0 and 23),
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_backup_schedules enable row level security;

create policy "backup_schedules_owner_all"
on public.business_backup_schedules for all
to authenticated
using (public.has_business_role(business_id, array['owner'::business_role]))
with check (public.has_business_role(business_id, array['owner'::business_role]));

grant select, insert, update, delete on public.business_backup_schedules to authenticated;
grant all on public.business_backup_schedules to service_role;

create or replace function public.upsert_backup_schedule(_business_id uuid, _frequency text, _hour_utc int, _enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_business_role(_business_id, array['owner'::business_role]) then
    raise exception 'only the company owner can configure scheduled backups';
  end if;

  insert into public.business_backup_schedules (business_id, frequency, hour_utc, enabled, created_by, updated_at)
  values (_business_id, _frequency, _hour_utc, _enabled, auth.uid(), now())
  on conflict (business_id) do update
    set frequency = excluded.frequency, hour_utc = excluded.hour_utc, enabled = excluded.enabled, updated_at = now();
end;
$$;

revoke execute on function public.upsert_backup_schedule(uuid, text, int, boolean) from public, anon;
grant execute on function public.upsert_backup_schedule(uuid, text, int, boolean) to authenticated;

-- Runs as postgres (via pg_cron), so it bypasses RLS directly — no
-- has_business_role check needed here, this is the trusted scheduler path.
create or replace function public.run_scheduled_backups()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_due record;
begin
  for v_due in
    select s.business_id
    from public.business_backup_schedules s
    where s.enabled
      and extract(hour from now() at time zone 'utc') = s.hour_utc
      and (
        s.last_run_at is null
        or (s.frequency = 'daily' and s.last_run_at < now() - interval '20 hours')
        or (s.frequency = 'weekly' and s.last_run_at < now() - interval '6 days')
      )
  loop
    insert into public.business_backups (business_id, backup_type, status, created_by)
    values (v_due.business_id, 'scheduled', 'pending', null);

    update public.business_backup_schedules set last_run_at = now() where business_id = v_due.business_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.run_scheduled_backups() from public, anon, authenticated;

select cron.schedule('run-scheduled-backups', '*/15 * * * *', $$select public.run_scheduled_backups()$$)
where not exists (select 1 from cron.job where jobname = 'run-scheduled-backups');
