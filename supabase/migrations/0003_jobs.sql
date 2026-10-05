-- Jobs Abroad migration 0003
-- ---------------------------------------------------------------------
-- 3. JOBS (with the triggers that lock fields employers must not change)
-- ---------------------------------------------------------------------

create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  recruiter_id  uuid not null references public.profiles (id) on delete cascade,
  package_id    uuid references public.packages (id) on delete set null,
  title         text not null check (char_length(title) between 2 and 120),
  company       text not null default '' check (char_length(company) <= 120),
  country       text not null default 'others'
                check (country in ('uae', 'saudi', 'qatar', 'kuwait', 'oman', 'others')),
  city          text not null default '' check (char_length(city) <= 80),
  category      text not null default 'other'
                check (category in ('plumber', 'electrician', 'driver', 'technician', 'cook', 'helper', 'office', 'other')),
  file_url      text check (file_url is null or file_url ~* '^https://'),   -- only https links, ever
  file_path     text,                                                       -- path inside bucket job-files
  file_type     text not null default 'image' check (file_type in ('image', 'pdf')),
  whatsapp      text not null default '' check (whatsapp ~ '^[0-9]{0,15}$'),
  posted_date   date not null default current_date,
  starts_at     timestamptz,
  expires_at    timestamptz,
  status        text not null default 'pending_payment'
                check (status in ('draft', 'pending_payment', 'paid_pending_review', 'live', 'hidden', 'rejected', 'expired')),
  reject_reason text,
  created_at    timestamptz not null default now()
);

create index if not exists jobs_status_expires_idx on public.jobs (status, expires_at);
create index if not exists jobs_recruiter_idx on public.jobs (recruiter_id);

-- On INSERT by a recruiter: force the safe starting values.
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
  if new.file_path is not null and new.file_path not like auth.uid()::text || '/%' then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  -- The file link must point at OUR storage and match the file path (no outside pictures or tracking links).
  if new.file_url is not null
     and (new.file_path is null or new.file_url not like '%/storage/v1/object/public/job-files/' || new.file_path) then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  new.recruiter_id   := auth.uid();
  new.status         := 'pending_payment';
  new.starts_at      := null;
  new.expires_at     := null;
  new.reject_reason  := null;
  new.posted_date    := current_date;
  return new;
end;
$$;

drop trigger if exists jobs_guard_insert_trg on public.jobs;
create trigger jobs_guard_insert_trg before insert on public.jobs
  for each row execute function public.jobs_guard_insert();

-- On UPDATE by a recruiter: these fields are locked. Only admins can change them.
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
  if new.file_path is distinct from old.file_path
     and new.file_path is not null
     and new.file_path not like auth.uid()::text || '/%' then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  if new.file_url is distinct from old.file_url
     and new.file_url is not null
     and (new.file_path is null or new.file_url not like '%/storage/v1/object/public/job-files/' || new.file_path) then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_guard_update_trg on public.jobs;
create trigger jobs_guard_update_trg before update on public.jobs
  for each row execute function public.jobs_guard_update();
