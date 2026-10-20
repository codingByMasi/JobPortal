-- 0032: when an ad is deleted (or its picture is replaced), the old file paths are put in a queue.
-- The database cannot safely delete files from Supabase Storage itself (Supabase blocks direct deletes on its storage tables),
-- so the admin's browser removes the queued files through the Storage API the next time an admin opens the admin area.
-- This closes GAP-1: a failed delete in the employer's browser no longer leaves a file behind for ever.
create table if not exists public.file_cleanup_queue (
  path       text primary key,
  created_at timestamptz not null default now()
);
alter table public.file_cleanup_queue enable row level security;
drop policy if exists "cleanup queue admin read" on public.file_cleanup_queue;
create policy "cleanup queue admin read" on public.file_cleanup_queue for select to authenticated using (public.is_admin());
drop policy if exists "cleanup queue admin delete" on public.file_cleanup_queue;
create policy "cleanup queue admin delete" on public.file_cleanup_queue for delete to authenticated using (public.is_admin());
revoke insert, update, truncate on public.file_cleanup_queue from anon, authenticated;
revoke all on public.file_cleanup_queue from anon;

create or replace function public.queue_job_files_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.file_cleanup_queue (path) select p from unnest(array[old.file_path, old.thumb_path]) as p where p is not null on conflict do nothing;
  return old;
end;
$$;
revoke all on function public.queue_job_files_after_delete() from public, anon, authenticated;
drop trigger if exists jobs_queue_files_after_delete on public.jobs;
create trigger jobs_queue_files_after_delete after delete on public.jobs
  for each row execute function public.queue_job_files_after_delete();

create or replace function public.queue_job_files_after_replace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.file_cleanup_queue (path)
  select p from unnest(array[
    case when old.file_path is distinct from new.file_path then old.file_path end,
    case when old.thumb_path is distinct from new.thumb_path then old.thumb_path end
  ]) as p where p is not null on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.queue_job_files_after_replace() from public, anon, authenticated;
drop trigger if exists jobs_queue_files_after_replace on public.jobs;
create trigger jobs_queue_files_after_replace after update of file_path, thumb_path on public.jobs
  for each row execute function public.queue_job_files_after_replace();
