-- Universal Document Output Center, Phase 1: link-based Email/WhatsApp
-- sharing (Locked Decision #7). A generated PDF is uploaded to a PRIVATE
-- storage bucket, and a signed URL (expiry per the business's
-- share_link_expiry setting) is what actually goes into the mailto:/wa.me:
-- draft — the document is never public. document_share_links is an audit
-- trail of what was minted, not the signed URL itself (signed URLs are
-- generated on demand from Supabase Storage, never stored long-term).

-- Same table/pattern accounting_settings.date_format already extended —
-- additive column, idempotent.
ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS share_link_expiry text NOT NULL DEFAULT '24h';

DO $$ BEGIN
  ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_share_link_expiry_check
    CHECK (share_link_expiry IN ('1h', '24h', '7d', 'never'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.document_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_share_links_business ON public.document_share_links(business_id, created_at DESC);

ALTER TABLE public.document_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_share_links_member_all ON public.document_share_links
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

-- Private bucket — objects live under "<business_id>/...", same
-- foldername-scoped convention as company-logos/avatars. No public select
-- policy: the ONLY way to read an object is a signed URL (createSignedUrl),
-- which a business member must have SELECT rights to mint in the first place.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('document-exports', 'document-exports', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "document_exports_member_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'document-exports'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.business_id = (storage.foldername(name))[1]::uuid
  )
);

create policy "document_exports_member_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'document-exports'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.business_id = (storage.foldername(name))[1]::uuid
  )
);

create policy "document_exports_member_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'document-exports'
  and exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and bu.status = 'active'
      and bu.business_id = (storage.foldername(name))[1]::uuid
  )
);

NOTIFY pgrst, 'reload schema';
