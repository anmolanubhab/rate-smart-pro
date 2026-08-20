-- Fix: business_migration_settings has a business_id column but no uuid
-- `id` PK, so it can never be registered in the generic engine, yet its
-- FK to vouchers still blocked deleting vouchers during
-- restore_backup_overwrite_existing / rollback_failed_restore — found via
-- a live production functional test on a real business that had run the
-- opening-balance migration. It carries only migration progress/status,
-- not financial data, so it's simply cleared rather than backed up.
-- (This is the same fix already folded directly into
-- 20260820041000_restore_shared_engine_and_overwrite_rpc.sql for a fresh
-- install; recorded here too because production received it as a
-- follow-up statement during live testing, after 20260820041000 had
-- already been applied without it.)

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
