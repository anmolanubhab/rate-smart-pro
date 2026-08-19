-- Backup & Restore (Phase 1) — RPCs.
--
-- Split of responsibility (see plan): these functions own correctness and
-- atomicity; a separate Edge Function (supabase/functions/backup-export,
-- backup-restore) owns encryption, zipping and Storage IO around them. Every
-- function re-derives the caller's identity from auth.uid() / has_business_role
-- — nothing here trusts a client-supplied business_id for authorization.

-- ── create_backup_job ────────────────────────────────────────────────────────

create or replace function public.create_backup_job(_business_id uuid, _backup_type text default 'manual')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_business_role(_business_id, array['owner'::business_role]) then
    raise exception 'only the company owner can create a backup';
  end if;
  if _backup_type not in ('manual', 'scheduled') then
    raise exception 'invalid backup type %', _backup_type;
  end if;

  insert into public.business_backups (business_id, backup_type, status, created_by)
  values (_business_id, _backup_type, 'pending', auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_backup_job(uuid, text) from public, anon;
grant execute on function public.create_backup_job(uuid, text) to authenticated;

-- ── delete_backup ────────────────────────────────────────────────────────────
-- Retires the tracking row. The caller deletes the Storage object itself via
-- supabase-js first (permitted by business_backups_delete_owner in
-- 20260819210000); this just marks history so a stale row never lingers as
-- "completed" after its file is gone.

create or replace function public.delete_backup(_backup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from public.business_backups where id = _backup_id;
  if v_business_id is null then
    raise exception 'backup not found';
  end if;
  if not public.has_business_role(v_business_id, array['owner'::business_role]) then
    raise exception 'only the company owner can delete a backup';
  end if;

  update public.business_backups set status = 'deleted' where id = _backup_id;
end;
$$;

revoke execute on function public.delete_backup(uuid) from public, anon;
grant execute on function public.delete_backup(uuid) to authenticated;

-- ── export_business_backup_dataset ──────────────────────────────────────────
-- Returns the full structured JSON document for one business, driven
-- entirely by backup_table_registry (never a hardcoded table list). Called
-- by the backup-export Edge Function using the caller's forwarded JWT (so
-- has_business_role below runs as the real requesting user, not
-- service_role) — the Edge Function's own service-role key is used only for
-- the Storage upload step, not for this read.

create or replace function public.export_business_backup_dataset(_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business jsonb;
  v_business_users jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_table_rows jsonb;
  r record;
begin
  if not public.has_business_role(_business_id, array['owner'::business_role]) then
    raise exception 'only the company owner can export a backup';
  end if;

  select to_jsonb(b) into v_business from public.businesses b where b.id = _business_id;
  if v_business is null then
    raise exception 'business not found';
  end if;

  select coalesce(jsonb_agg(to_jsonb(bu)), '[]'::jsonb) into v_business_users
  from public.business_users bu where bu.business_id = _business_id;

  for r in
    select table_name, business_id_column, scope_mode, parent_table, parent_fk_column
    from public.backup_table_registry
    where phase = 1 and include_in_backup
  loop
    if r.scope_mode = 'direct' then
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.%I = $1',
        r.table_name, r.business_id_column
      ) into v_table_rows using _business_id;
    else
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t join public.%I p on p.id = t.%I where p.business_id = $1',
        r.table_name, r.parent_table, r.parent_fk_column
      ) into v_table_rows using _business_id;
    end if;

    v_sections := jsonb_set(v_sections, array[r.table_name], v_table_rows, true);
  end loop;

  return jsonb_build_object(
    'backup_format_version', '1.0.0',
    'schema_version', (select count(*)::text from information_schema.tables where table_schema = 'public'),
    'business_id', _business_id,
    'business_name', v_business ->> 'business_name',
    'exported_at', now(),
    'exported_by', auth.uid(),
    'business', v_business,
    'business_users', v_business_users,
    'tables', v_sections,
    'integrity_snapshot', jsonb_build_object(
      'row_counts', (select jsonb_object_agg(key, jsonb_array_length(value)) from jsonb_each(v_sections)),
      'posted_voucher_dr_total', (
        select coalesce(sum(vi.dr_amount), 0) from public.voucher_items vi
        join public.vouchers v on v.id = vi.voucher_id
        where v.business_id = _business_id and v.status = 'posted'
      ),
      'posted_voucher_cr_total', (
        select coalesce(sum(vi.cr_amount), 0) from public.voucher_items vi
        join public.vouchers v on v.id = vi.voucher_id
        where v.business_id = _business_id and v.status = 'posted'
      )
    )
  );
end;
$$;

revoke execute on function public.export_business_backup_dataset(uuid) from public, anon;
grant execute on function public.export_business_backup_dataset(uuid) to authenticated;

-- ── validate_backup_manifest ─────────────────────────────────────────────────
-- Pure structural/version checks against the decrypted JSON payload. No
-- writes. Callable before committing to a full restore.

create or replace function public.validate_backup_manifest(_manifest jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_errors text[] := array[]::text[];
  v_format_version text;
  v_major int;
  v_missing_tables text[];
begin
  if _manifest is null then
    return jsonb_build_object('valid', false, 'errors', to_jsonb(array['backup file is empty or unreadable']::text[]));
  end if;

  v_format_version := _manifest ->> 'backup_format_version';
  if v_format_version is null then
    v_errors := v_errors || 'missing backup_format_version';
  else
    begin
      v_major := split_part(v_format_version, '.', 1)::int;
    exception when others then
      v_major := null;
    end;
    if v_major is null or v_major <> 1 then
      v_errors := v_errors || format('unsupported backup format version %s (this app supports 1.x)', v_format_version);
    end if;
  end if;

  if (_manifest ->> 'business_id') is null then
    v_errors := v_errors || 'missing business_id';
  end if;

  if (_manifest -> 'tables') is null then
    v_errors := v_errors || 'missing tables section';
  else
    select coalesce(array_agg(r.table_name), array[]::text[]) into v_missing_tables
    from public.backup_table_registry r
    where r.phase = 1 and r.include_in_backup
      and not (_manifest -> 'tables' ? r.table_name);
    if array_length(v_missing_tables, 1) > 0 then
      v_errors := v_errors || format('backup is missing required tables: %s', array_to_string(v_missing_tables, ', '));
    end if;
  end if;

  return jsonb_build_object(
    'valid', array_length(v_errors, 1) is null,
    'errors', to_jsonb(v_errors),
    'backup_format_version', v_format_version,
    'business_name', _manifest ->> 'business_name',
    'exported_at', _manifest ->> 'exported_at'
  );
end;
$$;

revoke execute on function public.validate_backup_manifest(jsonb) from public, anon;
grant execute on function public.validate_backup_manifest(jsonb) to authenticated;

-- ── restore_backup_to_new_business ──────────────────────────────────────────
-- Always creates a brand-new business (never overwrites an existing one).
-- Everything below runs inside this single function invocation's implicit
-- transaction: any exception rolls back the new business and every row
-- inserted for it — no partial company is ever left behind on a hard
-- failure. See 20260819210000 for why a single flat old-id -> new-id map
-- (not one map per table) is sufficient and how via_parent tables piggyback
-- on it for their foreign-key columns.

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

  -- 1. Bootstrap the new tenant + its owner membership. This function is
  -- SECURITY DEFINER (owned by the same role as soft_delete_business /
  -- execute_permanent_delete), so it bypasses RLS directly — no need to
  -- route through can_bootstrap_business_owner()'s INSERT-policy path.
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

  insert into public.business_users (business_id, user_id, role, status, joined_at, email)
  values (v_new_business_id, auth.uid(), 'owner', 'active', now(), (select email from auth.users where id = auth.uid()));

  -- 2. Other membership rows come back as inactive stubs only — never
  -- silently re-enrolled as active members of the new company, and never
  -- carrying anything beyond role/profile fields (no auth identities are
  -- created or linked here beyond the ids that already exist in this
  -- project). The bootstrapped owner row from step 1 is skipped.
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

  -- 3. Build the flat old-id -> new-id map across every registered table,
  -- fully, before any inserts happen.
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

  -- 4. Insert every row, id/business_id/any-uuid-shaped-FK-column remapped.
  -- Section order is a heuristic dependency order (settings -> masters ->
  -- transaction headers -> transaction children -> inventory -> gst),
  -- direct tables before their via_parent children within that. It is not a
  -- full topological sort of the FK graph; a genuine cross-section
  -- dependency violation raises here and rolls back the whole restore
  -- (fail-closed, per the plan) rather than silently dropping rows.
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

-- ── run_restore_integrity_audit ─────────────────────────────────────────────
-- Runs after restore_backup_to_new_business has committed (deliberately a
-- separate call — see plan §7 — so it reads committed data through normal
-- RLS-scoped queries rather than needing visibility into an in-flight
-- transaction). Reuses assert_voucher_balanced (20260812110000) per posted
-- voucher rather than re-deriving balance logic, and diffs against the
-- integrity_snapshot captured in the backup itself.

create or replace function public.run_restore_integrity_audit(_business_id uuid, _source_snapshot jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_unbalanced int := 0;
  v_voucher_id uuid;
  v_dr numeric;
  v_cr numeric;
  v_neg_stock int;
begin
  if not public.has_business_role(_business_id, array['owner'::business_role]) then
    raise exception 'only the company owner can run an integrity audit';
  end if;

  -- Voucher balance: re-run assert_voucher_balanced per posted voucher and
  -- count failures rather than raising, so the caller sees a full report
  -- instead of stopping at the first bad voucher.
  for v_voucher_id in select id from public.vouchers where business_id = _business_id and status = 'posted'
  loop
    begin
      perform public.assert_voucher_balanced(v_voucher_id);
    exception when others then
      v_unbalanced := v_unbalanced + 1;
    end;
  end loop;
  v_checks := v_checks || jsonb_build_object(
    'check_name', 'voucher_balance',
    'status', case when v_unbalanced = 0 then 'pass' else 'fail' end,
    'detail', format('%s unbalanced posted voucher(s)', v_unbalanced)
  );

  -- Trial balance: total debit must equal total credit across every posted
  -- voucher for the restored business.
  select coalesce(sum(vi.dr_amount), 0), coalesce(sum(vi.cr_amount), 0)
    into v_dr, v_cr
  from public.voucher_items vi
  join public.vouchers v on v.id = vi.voucher_id
  where v.business_id = _business_id and v.status = 'posted';

  v_checks := v_checks || jsonb_build_object(
    'check_name', 'trial_balance',
    'status', case when abs(v_dr - v_cr) <= 0.01 then 'pass' else 'fail' end,
    'detail', format('total debit %s, total credit %s', v_dr, v_cr)
  );

  -- Cross-check against the snapshot captured at export time, if supplied.
  if _source_snapshot is not null then
    v_checks := v_checks || jsonb_build_object(
      'check_name', 'matches_export_snapshot',
      'status', case
        when abs(coalesce((_source_snapshot ->> 'posted_voucher_dr_total')::numeric, v_dr) - v_dr) <= 0.01
         and abs(coalesce((_source_snapshot ->> 'posted_voucher_cr_total')::numeric, v_cr) - v_cr) <= 0.01
        then 'pass' else 'warn'
      end,
      'detail', format('export snapshot debit %s / credit %s vs restored debit %s / credit %s',
        _source_snapshot ->> 'posted_voucher_dr_total', _source_snapshot ->> 'posted_voucher_cr_total', v_dr, v_cr)
    );
  end if;

  -- Stock: no negative on-hand quantities post-restore. Queried directly
  -- against products.stock rather than get_stock_valuation(), which
  -- deliberately excludes non-positive stock rows from its own result set
  -- and so can never surface a negative-stock finding.
  select count(*) into v_neg_stock
  from public.products
  where business_id = _business_id and is_deleted is not true and stock < 0;

  v_checks := v_checks || jsonb_build_object(
    'check_name', 'stock_non_negative',
    'status', case when v_neg_stock = 0 then 'pass' else 'fail' end,
    'detail', format('%s product(s) with negative stock', v_neg_stock)
  );

  return v_checks;
end;
$$;

revoke execute on function public.run_restore_integrity_audit(uuid, jsonb) from public, anon;
grant execute on function public.run_restore_integrity_audit(uuid, jsonb) to authenticated;

-- ── rollback_failed_restore ──────────────────────────────────────────────────
-- Owner-only, explicit (never automatic). Because restore always targets a
-- brand-new business, "rollback" is simply deleting that business — reusing
-- the same cascade execute_permanent_delete already relies on, not new
-- delete logic. Refuses to touch a business with more than one active owner
-- membership as a guard against accidentally being pointed at an
-- unrelated, already-populated company.

create or replace function public.rollback_failed_restore(_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count int;
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

  delete from public.businesses where id = _business_id;
end;
$$;

revoke execute on function public.rollback_failed_restore(uuid) from public, anon;
grant execute on function public.rollback_failed_restore(uuid) to authenticated;
