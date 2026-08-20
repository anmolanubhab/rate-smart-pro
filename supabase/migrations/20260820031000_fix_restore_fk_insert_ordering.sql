-- Fix: restore_backup_to_new_business()'s insert order was only a coarse
-- heuristic (section, then scope_mode, then table_name alphabetically) —
-- flagged as such in its own comments in 20260819211000. A live production
-- functional test proved the gap: ledger_accounts (business_id_column
-- direct, section 'masters') sorts alphabetically BEFORE parties (also
-- 'masters'), but ledger_accounts.party_id references parties.id, so the
-- insert failed with a foreign_key_violation before any dependency issue
-- could occur elsewhere.
--
-- Replaces the single ordered pass with a general retry-insert loop: every
-- remapped row is staged in a temp queue first (unchanged remap logic),
-- then repeatedly attempted — a row that fails specifically on
-- foreign_key_violation is left for the next pass; any other error (not a
-- mere ordering issue — a real constraint problem) still raises and rolls
-- back the whole restore immediately, unchanged from before. This handles
-- arbitrary FK ordering across the ~80-table registry without hardcoding a
-- topological sort, and keeps working as new tables are registered.

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
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if _payload is null or (_payload -> 'tables') is null then
    raise exception 'invalid backup payload';
  end if;
  if coalesce(trim(_new_business_name), '') = '' then
    raise exception 'a name is required for the restored company';
  end if;

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

  -- Flat old-id -> new-id map across every registered table, built fully
  -- before any inserts happen.
  create temporary table _restore_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;

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

  -- Stage every row, remapped (id / business_id / any uuid-shaped FK
  -- column), into a pending queue rather than inserting immediately.
  create temporary table _restore_pending (
    seq bigserial primary key,
    table_name text not null,
    row_data jsonb not null
  ) on commit drop;

  for r in
    select table_name, business_id_column, scope_mode, parent_table, parent_fk_column, section
    from public.backup_table_registry
    where phase = 1 and include_in_backup
    order by
      case section
        when 'business' then 0
        when 'masters' then 1
        when 'transactions' then 2
        when 'inventory' then 3
        when 'gst' then 4
        when 'users_and_permissions' then 5
        when 'audit' then 6
        else 9
      end,
      case scope_mode when 'direct' then 0 else 1 end,
      table_name
  loop
    v_table_rows := coalesce(_payload -> 'tables' -> r.table_name, '[]'::jsonb);
    for v_row in select jsonb_array_elements(v_table_rows)
    loop
      v_new_row := v_row;

      if v_row ? 'id' and (v_row ->> 'id') is not null then
        select new_id into v_mapped from _restore_id_map where old_id = (v_row ->> 'id')::uuid;
        v_new_row := jsonb_set(v_new_row, '{id}', to_jsonb(v_mapped));
      end if;

      if r.scope_mode = 'direct' then
        v_new_row := jsonb_set(v_new_row, array[r.business_id_column], to_jsonb(v_new_business_id));
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

      insert into _restore_pending (table_name, row_data) values (r.table_name, v_new_row);
    end loop;
  end loop;

  -- Retry-insert loop: a row that fails on foreign_key_violation goes back
  -- into the queue for the next pass (its dependency likely hasn't been
  -- inserted yet); any other error is a real problem and raises
  -- immediately, rolling back the whole restore same as before.
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
      exception when foreign_key_violation then
        -- leave it queued, try again after other tables have inserted
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

  return v_new_business_id;
end;
$$;

revoke execute on function public.restore_backup_to_new_business(jsonb, text) from public, anon;
grant execute on function public.restore_backup_to_new_business(jsonb, text) to authenticated;
