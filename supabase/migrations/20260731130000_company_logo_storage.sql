-- Company logo upload: a "company-logos" storage bucket scoped by business,
-- writable only by members who actually hold the "configuration.edit"
-- permission (the same gate the app uses for canGranular(role, "business.edit",
-- permissions) via get_effective_permissions) — not just "any authenticated
-- user", mirroring the ownership-scoped pattern used for profile-images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can view logo images (rendered app-wide as public <img> URLs).
create policy "company_logos_select_public"
on storage.objects for select
using (bucket_id = 'company-logos');

-- Objects live under "<business_id>/...". A user may only write into a
-- business's folder if they're an active member there AND the effective
-- permission matrix grants them configuration.edit for that membership.
create policy "company_logos_insert_with_edit_perm"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.business_id = (storage.foldername(name))[1]::uuid
      and coalesce((public.get_effective_permissions(bu.id) -> 'configuration' ->> 'edit')::boolean, false)
  )
);

create policy "company_logos_update_with_edit_perm"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.business_id = (storage.foldername(name))[1]::uuid
      and coalesce((public.get_effective_permissions(bu.id) -> 'configuration' ->> 'edit')::boolean, false)
  )
)
with check (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.business_id = (storage.foldername(name))[1]::uuid
      and coalesce((public.get_effective_permissions(bu.id) -> 'configuration' ->> 'edit')::boolean, false)
  )
);

create policy "company_logos_delete_with_edit_perm"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.business_id = (storage.foldername(name))[1]::uuid
      and coalesce((public.get_effective_permissions(bu.id) -> 'configuration' ->> 'edit')::boolean, false)
  )
);
