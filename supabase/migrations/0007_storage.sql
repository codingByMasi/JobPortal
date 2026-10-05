-- Jobs Abroad migration 0007
-- ---------------------------------------------------------------------
-- 9. FILE STORAGE (bucket job-files: public read, 10 MB, images + PDF only, own folder only)
-- ---------------------------------------------------------------------

--    Each user can upload and delete only inside their own folder: <user id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-files', 'job-files', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "job-files read own or admin" on storage.objects;
create policy "job-files read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'job-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "job-files upload own folder" on storage.objects;
create policy "job-files upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files'
              and (storage.foldername(name))[1] = auth.uid()::text
              and not public.is_blocked());

drop policy if exists "job-files delete own or admin" on storage.objects;
create policy "job-files delete own or admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'job-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Public URLs of a public bucket work without a read policy, so visitors can view ads
-- but cannot list everyone's files.
