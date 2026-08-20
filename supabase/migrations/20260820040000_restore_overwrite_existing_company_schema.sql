-- Backup & Restore — Existing Company Overwrite mode (recovery use case).
--
-- Two restore modes now exist: 'new_company' (unchanged — restores into a
-- brand-new business) and 'overwrite_existing' (new — replaces a company's
-- own current data with an earlier backup of itself, for accidental-delete
-- recovery). business_restore_requests gains the columns needed to track
-- which mode ran and, for overwrite, the automatic pre-restore safety
-- backup taken before anything is touched.

alter table public.business_restore_requests
  add column if not exists restore_mode text not null default 'new_company'
    check (restore_mode in ('new_company', 'overwrite_existing')),
  add column if not exists pre_restore_backup_id uuid references public.business_backups(id);

create index if not exists idx_business_restore_requests_target
  on public.business_restore_requests(target_business_id);
