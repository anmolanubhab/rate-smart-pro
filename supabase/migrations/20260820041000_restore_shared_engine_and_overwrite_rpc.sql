-- Backup & Restore — shared restore engine + overwrite-existing-company RPC.
--
-- Extracts the id-map/stage/retry-insert logic and the per-table
-- retry-delete logic out of restore_backup_to_new_business() and
-- rollback_failed_restore() into two internal helpers, then adds
-- restore_backup_overwrite_existing() on top of the same helpers — per the
-- explicit instruction not to duplicate the restore architecture for a
-- second mode. Neither helper is exposed to authenticated directly (no
-- GRANT); only the SECURITY DEFINER wrapper RPCs below call them.

-- ── _restore_delete_business_rows ───────────────────────────────────────────
-- Deletes every registered table's rows for one business_id, explicitly
-- (not via cascade — see 20260819211000/fix migrations for why: RESTRICT
-- vs CASCADE ordering and ON DELETE SET NULL vs NOT NULL check conflicts
-- both surfaced on a live production test). Never touches business_users
-- or the businesses row itself — callers decide what to do with those.

create or replace function public._restore_delete_business_rows(_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_item record;
  v_progress boolean;
  v_remaining int;
  v_pass int := 0;
begin
  -- business_migration_settings has a business_id column (one row per
  -- business, no separate uuid `id` PK) and a RESTRICT-ish FK to vouchers,
  -- so it can never be registered in the generic engine (which requires a
  -- uuid `id` column) yet still blocks deleting vouchers if left alone —
  -- found via a live production functional test on a business that had
  -- actually run the opening-balance migration. It carries only migration
  -- progress/status, not financial data, so it is simply cleared here
  -- rather than backed up and replayed.
  delete from public.business_migration_settings where business_id = _business_id;

  create temporary table if not exists _restore_delete_pending (
    seq bigserial primary key,
    table_name text not null,
    delete_sql text not null
  ) on commit drop;
  delete from _restore_delete_pending;

  for r in
    select table_name, business_id_column, scope_mode, parent_table, parent_fk_column
    from public.backup_table_registry where phase = 1 and include_in_backup
  loop
    if r.scope_mode = 'direct' then
      insert into _restore_delete_pending (table_name, delete_sql)
      values (r.table_name, format('delete from public.%I where %I = %L', r.table_name, r.business_id_column, _business_id));
    else
      insert into _restore_delete_pending (table_name, delete_sql)
      values (r.table_name, format(
        'delete from public.%I t using public.%I p where p.id = t.%I and p.business_id = %L',
        r.table_name, r.parent_table, r.parent_fk_column, _business_id
      ));
    end if;
  end loop;

  loop
    v_progress := false;
    for v_item in select * from _restore_delete_pending order by seq
    loop
      begin
        execute v_item.delete_sql;
        delete from _restore_delete_pending where seq = v_item.seq;
        v_progress := true;
      exception when foreign_key_violation or check_violation then
        -- leave queued, retry after other tables have been cleared
      end;
    end loop;

    select count(*) into v_remaining from _restore_delete_pending;
    exit when v_remaining = 0;

    v_pass := v_pass + 1;
    if not v_progress or v_pass > 20 then
      raise exception 'could not resolve delete order for tables: %',
        (select string_agg(distinct table_name, ', ') from _restore_delete_pending);
    end if;
  end loop;
end;
$$;

revoke execute on function public._restore_delete_business_rows(uuid) from public, anon, authenticated;

-- ── _restore_insert_rows_into_business ──────────────────────────────────────
-- Stages every table section of _payload and inserts it into _business_id.
-- When _remap_ids is true (new-company mode), every row's id/business_id/
-- any uuid-shaped FK column is remapped through a fresh flat old-id ->
-- new-id map, exactly as restore_backup_to_new_business always did. When
-- false (overwrite mode), rows are inserted with their original ids and
-- original business_id column values untouched — safe specifically
-- because the caller has already verified the payload's own business_id
-- equals _business_id (restore_backup_overwrite_existing does this) and
-- has already cleared out _business_id's existing rows first, so there is
-- nothing left for the original ids to collide with.

create or replace function public._restore_insert_rows_into_business(_payload jsonb, _business_id uuid, _remap_ids boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_new_row jsonb;
  v_mapped uuid;
  v_key text;
  v_val jsonb;
  r record;
  v_item record;
  v_table_rows jsonb;
  v_progress boolean;
  v_remaining int;
  v_pass int := 0;
  v_stuck_tables text;
begin
  if _remap_ids then
    create temporary table if not exists _restore_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;
    delete from _restore_id_map;

    for r in select table_name from public.backup_table_registry where phase = 1 and include_in_backup
    loop
      v_table_rows := coalesce(_payload -> 'tables' -> r.table_name, '[]'::jsonb);
      for v_row in select jsonb_array_elements(v_table_rows)
      loop
        if v_row ? 'id' and (v_row ->> 'id') is not null then
          insert into _restore_id_map (old_id, new_id)
          values ((v_row ->> 'id')::uuid, gen_random_uuid())
          on conflict (old_id) do nothing;
        end if;
      end loop;
    end loop;
  end if;

  create temporary table if not exists _restore_pending (
    seq bigserial primary key,
    table_name text not null,
    row_data jsonb not null
  ) on commit drop;
  delete from _restore_pending;

  for r in
    select table_name, business_id_column, scope_mode, parent_table, parent_fk_column, section
    from public.backup_table_registry
    where phase = 1 and include_in_backup
    order by
      case section
        when 'business' then 0 when 'masters' then 1 when 'transactions' then 2
        when 'inventory' then 3 when 'gst' then 4 when 'users_and_permissions' then 5
        when 'audit' then 6 else 9
      end,
      case scope_mode when 'direct' then 0 else 1 end,
      table_name
  loop
    v_table_rows := coalesce(_payload -> 'tables' -> r.table_name, '[]'::jsonb);
    for v_row in select jsonb_array_elements(v_table_rows)
    loop
      v_new_row := v_row;

      if _remap_ids then
        if v_row ? 'id' and (v_row ->> 'id') is not null then
          select new_id into v_mapped from _restore_id_map where old_id = (v_row ->> 'id')::uuid;
          v_new_row := jsonb_set(v_new_row, '{id}', to_jsonb(v_mapped));
        end if;

        if r.scope_mode = 'direct' then
          v_new_row := jsonb_set(v_new_row, array[r.business_id_column], to_jsonb(_business_id));
        end if;

        for v_key, v_val in select * from jsonb_each(v_new_row)
        loop
          if v_key <> 'id' and jsonb_typeof(v_val) = 'string'
             and (v_val #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select new_id into v_mapped from _restore_id_map where old_id = (v_val #>> '{}')::uuid;
            if v_mapped is not null then
              v_new_row := jsonb_set(v_new_row, array[v_key], to_jsonb(v_mapped));
            end if;
          end if;
        end loop;
      end if;

      insert into _restore_pending (table_name, row_data) values (r.table_name, v_new_row);
    end loop;
  end loop;

  loop
    v_progress := false;
    for v_item in select * from _restore_pending order by seq
    loop
      begin
        execute format(
          'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
          v_item.table_name, v_item.table_name
        ) using v_item.row_data;
        delete from _restore_pending where seq = v_item.seq;
        v_progress := true;
      exception
        when foreign_key_violation or raise_exception then
          -- leave queued, retry after other tables have inserted
        when unique_violation then
          declare
            v_constraint_name text;
            v_conflict_cols text[];
            v_where_parts text[] := array[]::text[];
            v_col text;
            v_existing_id uuid;
            v_discarded_id uuid;
          begin
            get stacked diagnostics v_constraint_name = constraint_name;

            select array_agg(a.attname order by k.ord)
              into v_conflict_cols
            from pg_constraint c
            join unnest(c.conkey) with ordinality as k(attnum, ord) on true
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
            where c.conname = v_constraint_name
              and c.conrelid = ('public.' || v_item.table_name)::regclass;

            if v_conflict_cols is null then
              select array_agg(a.attname order by k.ord)
                into v_conflict_cols
              from pg_index i
              join unnest(i.indkey) with ordinality as k(attnum, ord) on true
              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
              where i.indexrelid = to_regclass('public.' || quote_ident(v_constraint_name))
                and i.indrelid = ('public.' || v_item.table_name)::regclass;
            end if;

            if v_conflict_cols is null then
              raise;
            end if;

            foreach v_col in array v_conflict_cols loop
              v_where_parts := v_where_parts || format('%I = %L', v_col, v_item.row_data ->> v_col);
            end loop;

            execute format('select id from public.%I where %s limit 1', v_item.table_name, array_to_string(v_where_parts, ' and '))
              into v_existing_id;

            if v_existing_id is null then
              raise;
            end if;

            v_discarded_id := (v_item.row_data ->> 'id')::uuid;
            if _remap_ids then
              update _restore_id_map set new_id = v_existing_id where new_id = v_discarded_id;
            end if;
            update _restore_pending set row_data = replace(row_data::text, v_discarded_id::text, v_existing_id::text)::jsonb
              where seq <> v_item.seq and row_data::text like '%' || v_discarded_id::text || '%';

            delete from _restore_pending where seq = v_item.seq;
            v_progress := true;
          end;
      end;
    end loop;

    select count(*) into v_remaining from _restore_pending;
    exit when v_remaining = 0;

    v_pass := v_pass + 1;
    if not v_progress or v_pass > 20 then
      select string_agg(distinct table_name, ', ') into v_stuck_tables from _restore_pending;
      raise exception 'restore could not resolve insert order for % row(s) across tables: % (unresolved foreign-key dependency)',
        v_remaining, v_stuck_tables;
    end if;
  end loop;
end;
$$;

revoke execute on function public._restore_insert_rows_into_business(jsonb, uuid, boolean) from public, anon, authenticated;

-- ── restore_backup_to_new_business (refactored to call the shared engine) ──

create or replace function public.restore_backup_to_new_business(_payload jsonb, _new_business_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_business_id uuid;
  v_old_business jsonb;
  v_row jsonb;
  v_disable_tables text[];
  v_tbl text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if _payload is null or (_payload -> 'tables') is null then
    raise exception 'invalid backup payload';
  end if;
  if coalesce(trim(_new_business_name), '') = '' then
    raise exception 'a name is required for the restored company';
  end if;

  select array_agg(distinct table_name) into v_disable_tables
  from public.backup_table_registry where phase = 1 and include_in_backup;
  v_disable_tables := array_append(v_disable_tables, 'businesses');

  foreach v_tbl in array v_disable_tables loop
    execute format('alter table public.%I disable trigger user', v_tbl);
  end loop;

  v_old_business := _payload -> 'business';

  insert into public.businesses (
    owner_id, business_name, firm_name, business_type, industry_segment,
    gst_number, pan_number, tan_number, msme_number,
    address, state, district, city, pincode,
    owner_name, mobile, email, website,
    fy_start_month, gst_enabled, composition_scheme, default_gst_pct,
    bank_name, bank_account_number, bank_ifsc, bank_branch,
    invoice_prefix, invoice_terms
  )
  values (
    auth.uid(), _new_business_name, v_old_business ->> 'firm_name', v_old_business ->> 'business_type', v_old_business ->> 'industry_segment',
    v_old_business ->> 'gst_number', v_old_business ->> 'pan_number', v_old_business ->> 'tan_number', v_old_business ->> 'msme_number',
    v_old_business ->> 'address', v_old_business ->> 'state', v_old_business ->> 'district', v_old_business ->> 'city', v_old_business ->> 'pincode',
    v_old_business ->> 'owner_name', v_old_business ->> 'mobile', v_old_business ->> 'email', v_old_business ->> 'website',
    coalesce((v_old_business ->> 'fy_start_month')::int, 4),
    coalesce((v_old_business ->> 'gst_enabled')::boolean, true),
    coalesce((v_old_business ->> 'composition_scheme')::boolean, false),
    coalesce((v_old_business ->> 'default_gst_pct')::numeric, 18),
    v_old_business ->> 'bank_name', v_old_business ->> 'bank_account_number', v_old_business ->> 'bank_ifsc', v_old_business ->> 'bank_branch',
    v_old_business ->> 'invoice_prefix', v_old_business ->> 'invoice_terms'
  )
  returning id into v_new_business_id;

  insert into public.business_users (business_id, user_id, role, status, created_at, email)
  values (v_new_business_id, auth.uid(), 'owner', 'active', now(), (select email from auth.users where id = auth.uid()));

  for v_row in select jsonb_array_elements(coalesce(_payload -> 'business_users', '[]'::jsonb))
  loop
    if (v_row ->> 'user_id') is not null and (v_row ->> 'user_id')::uuid <> auth.uid() then
      insert into public.business_users (business_id, user_id, role, status, full_name, username, email, mobile, department, notes)
      values (
        v_new_business_id, (v_row ->> 'user_id')::uuid,
        coalesce(v_row ->> 'role', 'staff')::business_role, 'inactive',
        v_row ->> 'full_name', v_row ->> 'username', v_row ->> 'email', v_row ->> 'mobile', v_row ->> 'department',
        'Restored from backup — reactivate explicitly to grant access'
      )
      on conflict (business_id, user_id) do nothing;
    end if;
  end loop;

  perform public._restore_insert_rows_into_business(_payload, v_new_business_id, true);

  foreach v_tbl in array v_disable_tables loop
    execute format('alter table public.%I enable trigger user', v_tbl);
  end loop;

  return v_new_business_id;
end;
$$;

revoke execute on function public.restore_backup_to_new_business(jsonb, text) from public, anon;
grant execute on function public.restore_backup_to_new_business(jsonb, text) to authenticated;

-- ── restore_backup_overwrite_existing ───────────────────────────────────────
-- Replaces _target_business_id's own registered-table data with the
-- backup's data, in place. Deliberately restricted to a backup of the
-- SAME company (payload.business_id must equal _target_business_id) —
-- overwriting company A with company B's backup is not this feature's
-- purpose and is exactly the confusable, dangerous operation the explicit
-- same-company check rules out; cross-company copies remain available via
-- restore_backup_to_new_business. Never touches business_users (current
-- membership/access must survive a data recovery restore untouched) or any
-- column on the businesses row itself (company profile/identity is not
-- "data" this restores — only the registered child tables are).
-- The caller (Edge Function) is responsible for taking a pre-restore
-- safety backup and for auto-rolling-back from it if the post-restore
-- integrity audit fails; this function only does the atomic swap.

create or replace function public.restore_backup_overwrite_existing(_payload jsonb, _target_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disable_tables text[];
  v_tbl text;
  v_payload_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.has_business_role(_target_business_id, array['owner'::business_role]) then
    raise exception 'only the company owner can restore into an existing company';
  end if;
  if _payload is null or (_payload -> 'tables') is null then
    raise exception 'invalid backup payload';
  end if;

  v_payload_business_id := (_payload ->> 'business_id')::uuid;
  if v_payload_business_id is null or v_payload_business_id <> _target_business_id then
    raise exception 'this backup belongs to a different company — restoring into an existing company is only allowed with a backup of that same company. Use "Restore as New Company" instead.';
  end if;

  select array_agg(distinct table_name) into v_disable_tables
  from public.backup_table_registry where phase = 1 and include_in_backup;

  foreach v_tbl in array v_disable_tables loop
    execute format('alter table public.%I disable trigger user', v_tbl);
  end loop;

  perform public._restore_delete_business_rows(_target_business_id);
  perform public._restore_insert_rows_into_business(_payload, _target_business_id, false);

  foreach v_tbl in array v_disable_tables loop
    execute format('alter table public.%I enable trigger user', v_tbl);
  end loop;

  return _target_business_id;
end;
$$;

revoke execute on function public.restore_backup_overwrite_existing(jsonb, uuid) from public, anon;
grant execute on function public.restore_backup_overwrite_existing(jsonb, uuid) to authenticated;

-- ── rollback_failed_restore (refactored to call the shared delete engine) ──

create or replace function public.rollback_failed_restore(_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count int;
  v_disable_tables text[];
  v_tbl text;
begin
  if not public.has_business_role(_business_id, array['owner'::business_role]) then
    raise exception 'only the company owner can roll back a restore';
  end if;

  select count(*) into v_member_count from public.business_users where business_id = _business_id and role = 'owner';
  if v_member_count <> 1 then
    raise exception 'refusing to roll back: business does not look like a fresh restore target';
  end if;

  update public.business_restore_requests
     set status = 'rolled_back', updated_at = now()
   where target_business_id = _business_id and status <> 'rolled_back';

  select array_agg(distinct table_name) into v_disable_tables
  from public.backup_table_registry where phase = 1 and include_in_backup;
  v_disable_tables := array_append(v_disable_tables, 'business_users');

  foreach v_tbl in array v_disable_tables loop
    execute format('alter table public.%I disable trigger user', v_tbl);
  end loop;

  perform public._restore_delete_business_rows(_business_id);
  delete from public.business_users where business_id = _business_id;
  delete from public.businesses where id = _business_id;

  foreach v_tbl in array v_disable_tables loop
    execute format('alter table public.%I enable trigger user', v_tbl);
  end loop;
end;
$$;

revoke execute on function public.rollback_failed_restore(uuid) from public, anon;
grant execute on function public.rollback_failed_restore(uuid) to authenticated;

-- ── get_business_row_counts ─────────────────────────────────────────────────
-- Lightweight "current state" summary for the restore preview screen —
-- row counts per registered table for a business, without pulling any
-- actual row data (unlike export_business_backup_dataset, which is far too
-- heavy to call just to render a comparison table).

create or replace function public.get_business_row_counts(_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_counts jsonb := '{}'::jsonb;
  v_count bigint;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'not a member of this business';
  end if;

  for r in
    select table_name, business_id_column, scope_mode, parent_table, parent_fk_column
    from public.backup_table_registry where phase = 1 and include_in_backup
  loop
    if r.scope_mode = 'direct' then
      execute format('select count(*) from public.%I where %I = $1', r.table_name, r.business_id_column)
        into v_count using _business_id;
    else
      execute format(
        'select count(*) from public.%I t join public.%I p on p.id = t.%I where p.business_id = $1',
        r.table_name, r.parent_table, r.parent_fk_column
      ) into v_count using _business_id;
    end if;
    v_counts := jsonb_set(v_counts, array[r.table_name], to_jsonb(v_count), true);
  end loop;

  return v_counts;
end;
$$;

revoke execute on function public.get_business_row_counts(uuid) from public, anon;
grant execute on function public.get_business_row_counts(uuid) to authenticated;
