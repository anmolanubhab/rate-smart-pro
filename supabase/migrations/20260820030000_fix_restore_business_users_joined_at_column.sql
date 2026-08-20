-- Fix: restore_backup_to_new_business() (20260819211000) referenced a
-- column business_users.joined_at that does not exist in this schema — the
-- live table has created_at instead (joined_at appears only in an older,
-- already-superseded version of current_business_id()/is_business_member()
-- read from git history, not the deployed schema). Found via a live
-- production functional test of the owner-bootstrap step, which failed with
-- "column \"joined_at\" of relation \"business_users\" does not exist"
-- before any row was written (the whole restore transaction rolled back
-- cleanly — no partial business was left behind, confirming the atomicity
-- guarantee held even for this bug).

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
  v_table_rows jsonb;
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

  -- Fixed: created_at (not joined_at, which does not exist on this table).
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

      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
        r.table_name, r.table_name
      ) using v_new_row;
    end loop;
  end loop;

  return v_new_business_id;
end;
$$;

revoke execute on function public.restore_backup_to_new_business(jsonb, text) from public, anon;
grant execute on function public.restore_backup_to_new_business(jsonb, text) to authenticated;
