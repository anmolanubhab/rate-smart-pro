-- Fix: "DELETE requires a WHERE clause" — a live production functional
-- test (via the real UI, restore_backup_overwrite_existing) found this
-- platform enforces a WHERE clause on every DELETE, including against
-- local temp tables. Three statements used to clear a temp table before
-- repopulating it (`delete from _restore_delete_pending;`,
-- `delete from _restore_id_map;`, `delete from _restore_pending;`) had no
-- WHERE at all. Added `where true` to all three — harmless no-op
-- semantically, satisfies the platform check.
-- (Same fix already folded directly into
-- 20260820041000_restore_shared_engine_and_overwrite_rpc.sql for a fresh
-- install; recorded here too because production received it as a
-- follow-up statement during live testing, after 20260820041000 had
-- already been applied without it — matching the convention already
-- established by 20260820043000.)

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
  delete from public.business_migration_settings where business_id = _business_id;

  create temporary table if not exists _restore_delete_pending (
    seq bigserial primary key,
    table_name text not null,
    delete_sql text not null
  ) on commit drop;
  delete from _restore_delete_pending where true;

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
    delete from _restore_id_map where true;

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
  delete from _restore_pending where true;

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
