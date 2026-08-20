-- Backup & Restore (Phase 1, Layer 2 — per-business portable backup).
--
-- New objects only:
--   1. Private storage bucket "business-backups" for encrypted backup archives.
--   2. business_backups        — one row per created backup (metadata only;
--                                 the actual encrypted payload lives in Storage).
--   3. business_restore_requests — tracks a multi-step restore wizard so it
--                                 survives a closed tab / page reload.
--   4. backup_table_registry   — single source of truth for "which tables get
--                                 included in a business's backup". Seeded by
--                                 querying information_schema for every table
--                                 that carries a business_id column and a uuid
--                                 `id` primary key (the shape export/import
--                                 depend on — see 20260819211000). This is the
--                                 anti-drift mechanism: as future migrations
--                                 add business_id-scoped tables, a test in
--                                 supabase/tests fails until someone explicitly
--                                 registers (or deliberately excludes) them.
--
-- business_users is intentionally NEVER included in this registry — it is
-- handled specially by restore_backup_to_new_business() (20260819211000)
-- because it references auth.users identities that must never be silently
-- re-enrolled as active members of a brand-new business.

-- ── 1. Storage bucket ───────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-backups', 'business-backups', false, 524288000, array['application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under "<business_id>/<backup_id>.rdbak". Only the business
-- owner may read (download) a backup of their own company. There is
-- deliberately no authenticated INSERT/UPDATE/DELETE policy: the archive is
-- always written by the backup-export Edge Function using the service-role
-- key (which bypasses RLS entirely), so a client can never fabricate or
-- tamper with a backup object directly. Deletes go through the delete_backup
-- RPC (20260819211000), which removes the Storage object and tracking row
-- together rather than allowing a bare storage delete.
create policy "business_backups_select_owner"
on storage.objects for select
to authenticated
using (
  bucket_id = 'business-backups'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.role = 'owner'
      and bu.business_id = (storage.foldername(name))[1]::uuid
  )
);

-- Deletion is client-driven (owner deletes their own backup object directly
-- via supabase-js, then calls delete_backup() to retire the tracking row) —
-- same owner-only condition as select.
create policy "business_backups_delete_owner"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'business-backups'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.role = 'owner'
      and bu.business_id = (storage.foldername(name))[1]::uuid
  )
);

-- ── 2. business_backups ──────────────────────────────────────────────────────

create table public.business_backups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_path text,
  file_size_bytes bigint,
  backup_type text not null default 'manual' check (backup_type in ('manual', 'scheduled')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'deleted')),
  backup_format_version text,
  schema_version text,
  checksum_sha256 text,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_business_backups_business on public.business_backups(business_id, created_at desc);

alter table public.business_backups enable row level security;

-- Any active member can see the backup history for their company (matches
-- the visibility level of most read-only settings screens); creating,
-- completing or deleting a backup is owner-gated inside the RPCs below, not
-- via a blanket INSERT/UPDATE policy, because status transitions must be
-- driven by the export Edge Function (service_role) rather than a client
-- directly writing "status = completed".
create policy "business_backups_select_member"
on public.business_backups for select
to authenticated
using (public.is_business_member(business_id));

grant select on public.business_backups to authenticated;
grant all on public.business_backups to service_role;

-- ── 3. business_restore_requests ─────────────────────────────────────────────

create table public.business_restore_requests (
  id uuid primary key default gen_random_uuid(),
  source_backup_id uuid references public.business_backups(id),
  initiated_by uuid not null,
  initiated_at timestamptz not null default now(),
  new_business_name text,
  target_business_id uuid references public.businesses(id) on delete set null,
  status text not null default 'validating'
    check (status in ('validating', 'preview_ready', 'restoring', 'integrity_check', 'completed', 'failed', 'rolled_back')),
  validation_result jsonb,
  integrity_result jsonb,
  error_message text,
  updated_at timestamptz not null default now()
);

create index idx_business_restore_requests_initiator on public.business_restore_requests(initiated_by, initiated_at desc);

alter table public.business_restore_requests enable row level security;

create policy "restore_requests_select_own"
on public.business_restore_requests for select
to authenticated
using (initiated_by = auth.uid());

-- The client creates its own tracking row (status defaults to 'validating')
-- right before invoking the restore Edge Function; every subsequent status
-- transition is written by that function using the service-role key, never
-- by the client directly, so there is no authenticated UPDATE policy here.
create policy "restore_requests_insert_own"
on public.business_restore_requests for insert
to authenticated
with check (initiated_by = auth.uid());

grant select, insert on public.business_restore_requests to authenticated;
grant all on public.business_restore_requests to service_role;

-- ── 4. backup_table_registry ─────────────────────────────────────────────────

-- scope_mode = 'direct'    : table has its own business_id column, filtered
--                             directly (business_id_column names it).
-- scope_mode = 'via_parent': table has no business_id column of its own (e.g.
--                             voucher_items only has voucher_id) and is scoped
--                             transitively through parent_table.id via
--                             parent_fk_column — parent_table must itself be a
--                             registered, phase-1, included, directly-scoped
--                             table (see pass 2 of the seed below).
create table public.backup_table_registry (
  table_name text primary key,
  section text not null check (section in
    ('business', 'masters', 'transactions', 'inventory', 'gst', 'users_and_permissions', 'audit')),
  phase int not null default 2,
  include_in_backup boolean not null default false,
  scope_mode text not null default 'direct' check (scope_mode in ('direct', 'via_parent')),
  business_id_column text,
  parent_table text references public.backup_table_registry(table_name),
  parent_fk_column text,
  notes text,
  constraint backup_table_registry_scope_chk check (
    (scope_mode = 'direct' and business_id_column is not null and parent_table is null and parent_fk_column is null)
    or
    (scope_mode = 'via_parent' and business_id_column is null and parent_table is not null and parent_fk_column is not null)
  )
);

alter table public.backup_table_registry enable row level security;

create policy "backup_table_registry_select_authenticated"
on public.backup_table_registry for select
to authenticated
using (true);

grant select on public.backup_table_registry to authenticated;
grant all on public.backup_table_registry to service_role;

-- Self-auditing seed: every table with a business_id column AND a uuid `id`
-- primary key (the shape the generic export/import engine in
-- 20260819211000 requires) gets a row here, classified into a section by
-- name heuristics and defaulted to phase 1 + included only when the
-- heuristic is confident; anything unmatched lands as phase 2 / excluded
-- rather than guessed into scope, per the phase-1 scope cut.
insert into public.backup_table_registry (table_name, section, phase, include_in_backup, scope_mode, business_id_column, notes)
select
  c.table_name,
  case
    when c.table_name ~ '(settings|numbering|round_off|financial_note_categories|print_profile|accounting_lock|financial_year|measurement_unit|sales_config)'
      then 'business'
    when c.table_name ~ '(party|parties|product|warehouse|price_list|tax_rate|hsn|unit|ledger|account_group)'
      then 'masters'
    when c.table_name ~ '(order|invoice|voucher|payment|dispatch|quotation)'
      then 'transactions'
    when c.table_name ~ '(inventory|stock|grn|batch)'
      then 'inventory'
    when c.table_name ~ 'gst'
      then 'gst'
    when c.table_name ~ 'audit_log'
      then 'audit'
    else 'masters'
  end as section,
  case
    when c.table_name in ('business_users')
      then 2 -- handled specially, never via the generic registry loop
    when c.table_name ~ 'audit_log'
      then 2
    when c.table_name ~ '(settings|numbering|round_off|financial_note_categories|print_profile|accounting_lock|financial_year|measurement_unit|sales_config|party|parties|product|warehouse|price_list|tax_rate|hsn|unit|ledger|account_group|order|invoice|voucher|payment|dispatch|quotation|inventory|stock|grn|batch|gst)'
      then 1
    else 2
  end as phase,
  case
    when c.table_name = 'business_users' then false
    when c.table_name ~ 'audit_log' then false
    when c.table_name ~ '(settings|numbering|round_off|financial_note_categories|print_profile|accounting_lock|financial_year|measurement_unit|sales_config|party|parties|product|warehouse|price_list|tax_rate|hsn|unit|ledger|account_group|order|invoice|voucher|payment|dispatch|quotation|inventory|stock|grn|batch|gst)'
      then true
    else false
  end as include_in_backup,
  'direct' as scope_mode,
  'business_id' as business_id_column,
  case when c.table_name = 'business_users'
    then 'Excluded from generic loop — restore_backup_to_new_business() handles membership rows explicitly'
    else null
  end as notes
from information_schema.columns c
where c.table_schema = 'public'
  and c.column_name = 'business_id'
  and exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  )
  and exists (
    select 1 from information_schema.columns pk
    where pk.table_schema = 'public' and pk.table_name = c.table_name
      and pk.column_name = 'id' and pk.data_type = 'uuid'
  )
  and c.table_name not in ('backup_table_registry', 'business_backups', 'business_restore_requests')
on conflict (table_name) do nothing;

-- Pass 2: child tables with no business_id column of their own (e.g.
-- voucher_items, which only carries voucher_id) but scoped transitively
-- through exactly one foreign key to a table already registered above as
-- phase-1 + included + directly scoped. "Exactly one" is load-bearing: a
-- child table with FKs into two or more such parent tables is ambiguous
-- about which business it belongs to and is deliberately left unregistered
-- (phase-2 candidate for manual triage) rather than guessed.
with candidate_fks as (
  select distinct
    tc.table_name as child_table,
    kcu.column_name as fk_column,
    ccu.table_name as parent_table
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and ccu.column_name = 'id'
    and ccu.table_name in (
      select table_name from public.backup_table_registry
      where scope_mode = 'direct' and phase = 1 and include_in_backup
    )
    and exists (
      select 1 from information_schema.columns idc
      where idc.table_schema = 'public' and idc.table_name = tc.table_name
        and idc.column_name = 'id' and idc.data_type = 'uuid'
    )
    and not exists (
      select 1 from public.backup_table_registry r where r.table_name = tc.table_name
    )
),
single_parent as (
  select child_table, min(fk_column) as fk_column, min(parent_table) as parent_table
  from candidate_fks
  group by child_table
  having count(distinct parent_table) = 1 and count(distinct fk_column) = 1
)
insert into public.backup_table_registry
  (table_name, section, phase, include_in_backup, scope_mode, parent_table, parent_fk_column, notes)
select
  sp.child_table,
  r.section,
  1,
  true,
  'via_parent',
  sp.parent_table,
  sp.fk_column,
  format('Scoped via parent table %s (fk column %s)', sp.parent_table, sp.fk_column)
from single_parent sp
join public.backup_table_registry r on r.table_name = sp.parent_table
on conflict (table_name) do nothing;
