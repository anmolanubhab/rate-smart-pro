-- Avatar upload system: profiles.avatar_url column + a properly owner-scoped
-- "profile-images" storage bucket, replacing the old unused "avatars" bucket
-- whose insert/update/delete policies only checked bucket_id (not object
-- ownership), letting any authenticated user write/overwrite/delete any file.

alter table public.profiles add column if not exists avatar_url text;

-- Neutralize the old, insecure "avatars" bucket. storage.objects/buckets
-- block direct DELETE via SQL (must go through the Storage API), so instead
-- we drop its policies -- with RLS enabled and zero matching policies the
-- bucket becomes fully default-deny (no reads or writes), closing the hole
-- where any authenticated user could write/overwrite/delete any file in it.
-- It has 0 objects, so nothing is orphaned; removing the empty bucket row
-- itself can be done later via the Storage API/dashboard if desired.
drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "Users can delete avatar" on storage.objects;
drop policy if exists "Users can update avatar" on storage.objects;
drop policy if exists "Users can upload avatar" on storage.objects;

-- Create the new bucket used by the avatar upload feature.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can view avatar images (they're rendered app-wide as public <img> URLs).
create policy "profile_images_select_public"
on storage.objects for select
using (bucket_id = 'profile-images');

-- A user may only write into their own "<user-id>/..." folder.
create policy "profile_images_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "profile_images_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "profile_images_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
