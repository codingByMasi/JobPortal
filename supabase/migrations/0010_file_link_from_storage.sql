-- Jobs Abroad migration 0010
-- ---------------------------------------------------------------------
-- 12. AD FILE LINK: the database builds it, the browser can no longer type it
--     (closes the hole where a link on ANY website ending in our path was accepted)
-- ---------------------------------------------------------------------

-- Small private settings table. Nobody can read or write it from the browser (no policies); only the SQL editor.
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- >>> ONE-TIME SETUP (after running this file): tell the database your own storage address.
-- Put YOUR project address (the same as VITE_SUPABASE_URL, no slash at the end) and run this single line:
-- insert into public.app_settings (key, value) values ('storage_base', 'https://YOUR-PROJECT-ID.supabase.co')
--   on conflict (key) do update set value = excluded.value;
-- Until it is set, employers cannot save an ad that has a file.

-- The one true link for a stored file. Only the triggers below use it.
create or replace function public.job_file_url(p_path text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_base text;
begin
  select value into v_base from public.app_settings where key = 'storage_base';
  if v_base is null or v_base !~ '^https://[^/]+$' then
    raise exception 'Storage address is not set.' using errcode = '42501';
  end if;
  return v_base || '/storage/v1/object/public/job-files/' || p_path;
end;
$$;

-- Checks the file really is an uploaded file inside the employer's own folder, and returns our own link for it.
create or replace function public.job_file_checked_url(p_owner uuid, p_path text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if p_path is null then
    return null;
  end if;
  if p_path not like p_owner::text || '/%'
     or p_path like '%..%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'job-files' and o.name = p_path) then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  return public.job_file_url(p_path);
end;
$$;

revoke all on function public.job_file_url(text) from public, anon, authenticated;
revoke all on function public.job_file_checked_url(uuid, text) from public, anon, authenticated;

-- INSERT by an employer: same as migration 0009, but the file link is now built here, whatever the browser sends.
create or replace function public.jobs_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;                                   -- admin / SQL editor / scheduled jobs
  end if;
  if public.is_blocked() then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  if new.package_id is null
     or not exists (select 1 from public.packages where id = new.package_id and active) then
    raise exception 'Please choose a package.' using errcode = '23514';
  end if;
  if (select count(*) from public.jobs where recruiter_id = auth.uid() and status = 'pending_payment') >= 20 then
    raise exception 'Too many unpaid ads.' using errcode = '53400';
  end if;
  new.file_url       := public.job_file_checked_url(auth.uid(), new.file_path);
  new.recruiter_id   := auth.uid();
  new.status         := 'pending_payment';
  new.starts_at      := null;
  new.expires_at     := null;
  new.reject_reason  := null;
  new.posted_date    := current_date;
  return new;
end;
$$;

-- UPDATE by an employer: locked fields as in migration 0003; a changed file is checked and its link rebuilt.
create or replace function public.jobs_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.status        is distinct from old.status
     or new.package_id    is distinct from old.package_id
     or new.starts_at     is distinct from old.starts_at
     or new.expires_at    is distinct from old.expires_at
     or new.recruiter_id  is distinct from old.recruiter_id
     or new.reject_reason is distinct from old.reject_reason
     or new.posted_date   is distinct from old.posted_date then
    raise exception 'You cannot change this.' using errcode = '42501';
  end if;
  if new.file_path is distinct from old.file_path or new.file_url is distinct from old.file_url then
    new.file_url := public.job_file_checked_url(auth.uid(), new.file_path);
  end if;
  return new;
end;
$$;
