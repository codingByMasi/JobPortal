-- =====================================================================
-- Jobs Abroad - complete database setup for Supabase (GENERATED FILE: do not edit).
-- Edit the numbered files in supabase/migrations instead, then run: npm run schema
-- To set up a new project: Supabase dashboard > SQL Editor > New query > paste all > Run (once).
-- =====================================================================

-- Jobs Abroad migration 0001
-- ---------------------------------------------------------------------
-- 1. PROFILES (one row per login; created automatically at signup)
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  role         text not null default 'recruiter' check (role in ('admin', 'recruiter')),
  company_name text not null default '',
  phone        text not null default '',
  verified     boolean not null default false,
  blocked      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Helpers used by the security rules below. SECURITY DEFINER lets them read
-- profiles even though the caller may not be allowed to.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_blocked()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select blocked from public.profiles where id = auth.uid()), false);
$$;

-- When someone signs up, create a RECRUITER profile. The role can never come from the browser.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, company_name, phone)
  values (
    new.id,
    new.email,
    'recruiter',
    coalesce(left(new.raw_user_meta_data ->> 'company_name', 120), ''),
    coalesce(left(new.raw_user_meta_data ->> 'phone', 20), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A recruiter may edit their own company name and phone, but never role / verified / blocked.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.verified is distinct from old.verified
     or new.blocked is distinct from old.blocked
     or new.email is distinct from old.email then
    raise exception 'You cannot change this.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- >>> MAKE YOURSELF ADMIN (after you have signed up once on the site).
-- Remove the two dashes, put your email, and run this single line:
-- update public.profiles set role = 'admin' where email = 'you@example.com';

-- Jobs Abroad migration 0002
-- ---------------------------------------------------------------------
-- 2. PACKAGES (what an employer buys)
-- ---------------------------------------------------------------------

create table if not exists public.packages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  price_paise   integer not null check (price_paise >= 0),   -- 100 paise = Rs 1
  duration_days integer not null check (duration_days between 1 and 365),
  featured      boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

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

-- Jobs Abroad migration 0004
-- ---------------------------------------------------------------------
-- 4+5. PAYMENTS (only admins write) and APPLICATIONS (candidates apply, no login)
-- ---------------------------------------------------------------------

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs (id) on delete set null,
  recruiter_id uuid not null references public.profiles (id) on delete cascade,
  amount_paise integer not null check (amount_paise >= 0),
  currency     text not null default 'INR',
  method       text not null default 'manual' check (method in ('manual', 'razorpay')),
  status       text not null default 'paid' check (status in ('created', 'paid', 'refunded')),
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists payments_recruiter_idx on public.payments (recruiter_id);

create table if not exists public.applications (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  phone      text not null check (phone ~ '^[0-9+ -]{7,20}$'),
  city       text not null default '' check (char_length(city) <= 80),
  message    text not null default '' check (char_length(message) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists applications_job_idx on public.applications (job_id);

-- Jobs Abroad migration 0005
-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY: who can see and change what, on every table
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.packages     enable row level security;
alter table public.jobs         enable row level security;
alter table public.payments     enable row level security;
alter table public.applications enable row level security;

-- profiles: you see and edit yourself; admins see and edit everyone.
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles admin all" on public.profiles;
create policy "profiles admin all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- packages: everyone can read (prices are public); only admins change them.
drop policy if exists "packages read all" on public.packages;
create policy "packages read all" on public.packages for select using (true);
drop policy if exists "packages admin all" on public.packages;
create policy "packages admin all" on public.packages
  for all using (public.is_admin()) with check (public.is_admin());

-- jobs
drop policy if exists "jobs public read live" on public.jobs;
create policy "jobs public read live" on public.jobs
  for select using (status = 'live' and expires_at > now());

drop policy if exists "jobs recruiter read own" on public.jobs;
create policy "jobs recruiter read own" on public.jobs
  for select to authenticated using (recruiter_id = auth.uid());

drop policy if exists "jobs recruiter insert" on public.jobs;
create policy "jobs recruiter insert" on public.jobs
  for insert to authenticated
  with check (recruiter_id = auth.uid() and status = 'pending_payment' and not public.is_blocked());

drop policy if exists "jobs recruiter update own waiting" on public.jobs;
create policy "jobs recruiter update own waiting" on public.jobs
  for update to authenticated
  using (recruiter_id = auth.uid() and status = 'pending_payment' and not public.is_blocked())
  with check (recruiter_id = auth.uid());

drop policy if exists "jobs recruiter delete own" on public.jobs;
create policy "jobs recruiter delete own" on public.jobs
  for delete to authenticated using (recruiter_id = auth.uid());

drop policy if exists "jobs admin all" on public.jobs;
create policy "jobs admin all" on public.jobs
  for all using (public.is_admin()) with check (public.is_admin());

-- payments: recruiters only READ their own. Nobody but admins writes.
drop policy if exists "payments read own" on public.payments;
create policy "payments read own" on public.payments
  for select to authenticated using (recruiter_id = auth.uid());
drop policy if exists "payments admin all" on public.payments;
create policy "payments admin all" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- applications: anyone can apply to a live ad; recruiters read applications for their own ads.
drop policy if exists "applications anyone insert" on public.applications;
create policy "applications anyone insert" on public.applications
  for insert to anon, authenticated
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.status = 'live' and j.expires_at > now()));

drop policy if exists "applications recruiter read own" on public.applications;
create policy "applications recruiter read own" on public.applications
  for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.recruiter_id = auth.uid()));

drop policy if exists "applications admin all" on public.applications;
create policy "applications admin all" on public.applications
  for all using (public.is_admin()) with check (public.is_admin());

-- Jobs Abroad migration 0006
-- ---------------------------------------------------------------------
-- 7+8. PUBLIC VIEW for the website, and the ADMIN FUNCTIONS (approve, mark paid, expire)
-- ---------------------------------------------------------------------

-- Public view: it hides recruiter ids and internal fields. It runs with owner rights on purpose,
-- so visitors can see the verified tag without being able to read the profiles table.
drop view if exists public.public_jobs;
create view public.public_jobs as
select
  j.id, j.title, j.company, j.country, j.city, j.category,
  j.file_url, j.file_type, j.whatsapp, j.posted_date, j.starts_at, j.expires_at,
  coalesce(pk.featured, false) as featured,
  coalesce(p.verified, false)  as recruiter_verified
from public.jobs j
left join public.profiles p  on p.id  = j.recruiter_id
left join public.packages pk on pk.id = j.package_id
where j.status = 'live' and j.expires_at > now();

grant select on public.public_jobs to anon, authenticated;

-- Approve: ad goes live now for the number of days in its package (30 if it has none).
create or replace function public.admin_approve_job(p_job uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  v_days integer;
  v_job  public.jobs;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select coalesce((select duration_days from public.packages where id = j.package_id), 30)
    into v_days from public.jobs j where j.id = p_job;
  if v_days is null then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  update public.jobs
     set status = 'live', starts_at = now(), expires_at = now() + make_interval(days => v_days), reject_reason = null
   where id = p_job
   returning * into v_job;
  return v_job;
end;
$$;

-- Mark as paid: records a manual payment and moves the ad to "waiting for approval".
create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '')
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;
  v_amount := coalesce(p_amount_paise, (select price_paise from public.packages where id = v_job.package_id), 0);
  insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note)
  values (v_job.id, v_job.recruiter_id, v_amount, 'manual', 'paid', coalesce(p_note, ''))
  returning * into v_payment;
  update public.jobs set status = 'paid_pending_review' where id = v_job.id;
  return v_payment;
end;
$$;

-- Expire: ads whose end time has passed become "expired". Run every few minutes (see below).
create or replace function public.expire_jobs()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.jobs set status = 'expired' where status = 'live' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Browsers must not call these directly except the two admin functions (which check is_admin()).
revoke all on function public.expire_jobs() from public, anon, authenticated;
revoke all on function public.admin_approve_job(uuid) from public, anon;
revoke all on function public.admin_mark_paid(uuid, integer, text) from public, anon;
grant execute on function public.admin_approve_job(uuid) to authenticated;
grant execute on function public.admin_mark_paid(uuid, integer, text) to authenticated;

-- >>> SCHEDULE EXPIRY (pg_cron). First turn it on once:
--     Dashboard > Database > Extensions > search "pg_cron" > enable.
-- Then remove the two dashes on the next line and run it:
-- select cron.schedule('expire-jobs', '*/10 * * * *', $$select public.expire_jobs()$$);
-- (The website also hides ended ads by itself, so a few minutes of delay never shows an old ad.)

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

-- Jobs Abroad migration 0008
-- ---------------------------------------------------------------------
-- 10. APPLICATION LIMITS (spam and duplicate protection for the no-login Apply form)
-- ---------------------------------------------------------------------

-- One application per ad per phone number. Only the last 10 digits count, so
-- "98765 43210" and "+91 98765-43210" are the same person.
create unique index if not exists applications_one_per_phone
  on public.applications (job_id, (right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)));

-- One ad cannot collect more than 1000 applications (stops someone flooding an employer's list).
-- SECURITY DEFINER: visitors cannot read applications, but this check must still be able to count them.
create or replace function public.applications_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.applications where job_id = new.job_id) >= 1000 then
    raise exception 'This ad cannot take more applications.' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_guard_insert_trg on public.applications;
create trigger applications_guard_insert_trg before insert on public.applications
  for each row execute function public.applications_guard_insert();

-- Jobs Abroad migration 0009
-- ---------------------------------------------------------------------
-- 11. ABUSE LIMITS for employers: unpaid ads and stored files
-- ---------------------------------------------------------------------

-- An employer may keep at most 20 ads waiting for payment (stops someone filling the database with junk).
-- This replaces the insert check from migration 0003; everything else in it is unchanged.
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

-- Each person may store at most 200 files in their own folder.
drop policy if exists "job-files upload own folder" on storage.objects;
create policy "job-files upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files'
              and (storage.foldername(name))[1] = auth.uid()::text
              and not public.is_blocked()
              and (select count(*) from storage.objects o
                    where o.bucket_id = 'job-files'
                      and (storage.foldername(o.name))[1] = auth.uid()::text) < 200);

-- Profile text cannot be huge (NOT VALID = checked for new and changed rows from now on).
alter table public.profiles drop constraint if exists profiles_company_name_length;
alter table public.profiles add constraint profiles_company_name_length check (char_length(company_name) <= 120) not valid;
alter table public.profiles drop constraint if exists profiles_phone_length;
alter table public.profiles add constraint profiles_phone_length check (char_length(phone) <= 20) not valid;

-- Mark-as-paid now LOCKS the ad row while it works, so two admins pressing the button at the same moment
-- cannot both create a payment (the second one waits, then sees the ad is no longer waiting for payment).
create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '')
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;
  v_amount := coalesce(p_amount_paise, (select price_paise from public.packages where id = v_job.package_id), 0);
  insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note)
  values (v_job.id, v_job.recruiter_id, v_amount, 'manual', 'paid', coalesce(p_note, ''))
  returning * into v_payment;
  update public.jobs set status = 'paid_pending_review' where id = v_job.id;
  return v_payment;
end;
$$;

-- The public view is READ-ONLY for everyone. (Supabase gives new objects broad default rights, so say it out loud.)
revoke all on public.public_jobs from anon, authenticated;
grant select on public.public_jobs to anon, authenticated;

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

-- Jobs Abroad migration 0011
-- ---------------------------------------------------------------------
-- 13. CHANGE REQUESTS: an employer cannot edit an ad after payment, but can ask us to change it
-- ---------------------------------------------------------------------

create table if not exists public.change_requests (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  recruiter_id uuid not null references public.profiles (id) on delete cascade,
  message      text not null check (char_length(btrim(message)) between 3 and 300),
  status       text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at   timestamptz not null default now(),
  handled_at   timestamptz
);
create index if not exists change_requests_job_idx on public.change_requests (job_id, status);
create index if not exists change_requests_recruiter_idx on public.change_requests (recruiter_id);
create index if not exists change_requests_status_idx on public.change_requests (status, created_at);

alter table public.change_requests enable row level security;

-- Employers: read their own, and add a request for THEIR OWN ad once it is past "waiting for payment"
-- (while it waits for payment they can simply edit it). They can never change or delete a request.
drop policy if exists "change requests read own" on public.change_requests;
create policy "change requests read own" on public.change_requests
  for select to authenticated using (recruiter_id = auth.uid());

drop policy if exists "change requests insert own" on public.change_requests;
create policy "change requests insert own" on public.change_requests
  for insert to authenticated
  with check (
    recruiter_id = auth.uid()
    and not public.is_blocked()
    and exists (select 1 from public.jobs j
                 where j.id = job_id and j.recruiter_id = auth.uid() and j.status <> 'pending_payment')
  );

drop policy if exists "change requests admin all" on public.change_requests;
create policy "change requests admin all" on public.change_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- On INSERT by an employer: force safe values and allow at most 3 open requests per ad.
create or replace function public.change_requests_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.change_requests where job_id = new.job_id and status = 'open') >= 3 then
    raise exception 'Too many open requests for this ad.' using errcode = '53300';
  end if;
  new.recruiter_id := auth.uid();
  new.status       := 'open';
  new.handled_at   := null;
  new.message      := btrim(new.message);
  return new;
end;
$$;

drop trigger if exists change_requests_guard_insert_trg on public.change_requests;
create trigger change_requests_guard_insert_trg before insert on public.change_requests
  for each row execute function public.change_requests_guard_insert();

-- On UPDATE (admins only, by the policy above): stamp the time the request was handled.
create or replace function public.change_requests_stamp()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.handled_at := case when new.status = 'open' then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists change_requests_stamp_trg on public.change_requests;
create trigger change_requests_stamp_trg before update on public.change_requests
  for each row execute function public.change_requests_stamp();

-- Jobs Abroad migration 0012
-- ---------------------------------------------------------------------
-- 14. HARDENING from the project analysis (docs/00-project-analysis.md)
--     price saved with the ad, safer approve/refund/delete, admin log, no direct visitor read of `jobs`,
--     thumbnails, ad details text, WhatsApp number rule, block hides ads, verified reset, smaller upload limits, clean-up
-- ---------------------------------------------------------------------

-- ===== profiles: agent registration number; verified is reset when the company identity changes; blocking hides ads =====
alter table public.profiles add column if not exists ra_number text not null default '';
alter table public.profiles drop constraint if exists profiles_ra_number_length;
alter table public.profiles add constraint profiles_ra_number_length check (char_length(ra_number) <= 40) not valid;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, company_name, phone, ra_number)
  values (
    new.id,
    new.email,
    'recruiter',
    coalesce(left(new.raw_user_meta_data ->> 'company_name', 120), ''),
    coalesce(left(new.raw_user_meta_data ->> 'phone', 20), ''),
    coalesce(left(new.raw_user_meta_data ->> 'ra_number', 40), '')
  );
  return new;
end;
$$;

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.verified is distinct from old.verified
     or new.blocked is distinct from old.blocked
     or new.email is distinct from old.email then
    raise exception 'You cannot change this.' using errcode = '42501';
  end if;
  -- A verified company that changes its name or registration number must be checked again.
  if new.company_name is distinct from old.company_name or new.ra_number is distinct from old.ra_number then
    new.verified := false;
  end if;
  return new;
end;
$$;

-- When an employer is blocked, all their live ads are hidden at once.
create or replace function public.profiles_block_hides_ads()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.blocked and not old.blocked then
    update public.jobs set status = 'hidden' where recruiter_id = new.id and status = 'live';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_block_hides_ads_trg on public.profiles;
create trigger profiles_block_hides_ads_trg after update of blocked on public.profiles
  for each row execute function public.profiles_block_hides_ads();

-- ===== jobs: new columns =====
alter table public.jobs add column if not exists price_paise_at_order integer;   -- price when the ad was made (a later package change does not alter it)
alter table public.jobs add column if not exists days_at_order integer;
alter table public.jobs add column if not exists details text not null default '';
alter table public.jobs add column if not exists thumb_path text;
alter table public.jobs add column if not exists thumb_url text;
alter table public.jobs drop constraint if exists jobs_details_length;
alter table public.jobs add constraint jobs_details_length check (char_length(details) <= 600);
alter table public.jobs drop constraint if exists jobs_thumb_url_https;
alter table public.jobs add constraint jobs_thumb_url_https check (thumb_url is null or thumb_url ~* '^https://');

-- WhatsApp number: 10 to 15 digits, always. A 10-digit Indian mobile number gets 91 in front (automatically).
alter table public.jobs alter column whatsapp drop default;
alter table public.jobs drop constraint if exists jobs_whatsapp_check;
alter table public.jobs add constraint jobs_whatsapp_check check (whatsapp ~ '^[0-9]{10,15}$') not valid;

create or replace function public.jobs_normalize_whatsapp()
returns trigger language plpgsql as $$
begin
  new.whatsapp := regexp_replace(coalesce(new.whatsapp, ''), '[^0-9]', '', 'g');
  if new.whatsapp ~ '^[6-9][0-9]{9}$' then
    new.whatsapp := '91' || new.whatsapp;
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_a_normalize_whatsapp_trg on public.jobs;
create trigger jobs_a_normalize_whatsapp_trg before insert or update of whatsapp on public.jobs
  for each row execute function public.jobs_normalize_whatsapp();

-- ===== jobs: INSERT guard (adds: price saved, picture + thumbnail checked, file type taken from the file name) =====
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
  if new.thumb_path is not null and new.file_path is null then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  new.file_url   := public.job_file_checked_url(auth.uid(), new.file_path);
  new.thumb_url  := public.job_file_checked_url(auth.uid(), new.thumb_path);
  new.file_type  := case when new.file_path ilike '%.pdf' then 'pdf' else 'image' end;
  select price_paise, duration_days into new.price_paise_at_order, new.days_at_order
    from public.packages where id = new.package_id;
  new.recruiter_id   := auth.uid();
  new.status         := 'pending_payment';
  new.starts_at      := null;
  new.expires_at     := null;
  new.reject_reason  := null;
  new.posted_date    := current_date;
  return new;
end;
$$;

-- ===== jobs: UPDATE guard (adds: saved price locked; a rejected ad may be sent for review again) =====
create or replace function public.jobs_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_resubmit boolean;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- the ONE status change an employer may make: send a rejected ad for review again
  v_resubmit := old.status = 'rejected' and new.status = 'paid_pending_review' and new.reject_reason is null;
  if (new.status is distinct from old.status and not v_resubmit)
     or (new.reject_reason is distinct from old.reject_reason and not v_resubmit)
     or new.package_id    is distinct from old.package_id
     or new.starts_at     is distinct from old.starts_at
     or new.expires_at    is distinct from old.expires_at
     or new.recruiter_id  is distinct from old.recruiter_id
     or new.posted_date   is distinct from old.posted_date
     or new.price_paise_at_order is distinct from old.price_paise_at_order
     or new.days_at_order is distinct from old.days_at_order then
    raise exception 'You cannot change this.' using errcode = '42501';
  end if;
  if new.file_path is distinct from old.file_path or new.file_url is distinct from old.file_url
     or new.thumb_path is distinct from old.thumb_path or new.thumb_url is distinct from old.thumb_url then
    if new.thumb_path is not null and new.file_path is null then
      raise exception 'Bad file.' using errcode = '42501';
    end if;
    new.file_url  := public.job_file_checked_url(auth.uid(), new.file_path);
    new.thumb_url := public.job_file_checked_url(auth.uid(), new.thumb_path);
    new.file_type := case when new.file_path ilike '%.pdf' then 'pdf' else 'image' end;
  end if;
  return new;
end;
$$;

-- ===== jobs: policies (edit also while rejected; delete only when nothing is running; visitors no longer read the table) =====
drop policy if exists "jobs recruiter update own waiting" on public.jobs;
create policy "jobs recruiter update own waiting" on public.jobs
  for update to authenticated
  using (recruiter_id = auth.uid() and status in ('pending_payment', 'rejected') and not public.is_blocked())
  with check (recruiter_id = auth.uid());

drop policy if exists "jobs recruiter delete own" on public.jobs;
create policy "jobs recruiter delete own" on public.jobs
  for delete to authenticated
  using (recruiter_id = auth.uid()
         and (status in ('draft', 'pending_payment', 'rejected', 'expired')
              or (status = 'live' and expires_at <= now())));

-- Visitors read ads ONLY through the view public_jobs (it hides owner and internal fields).
drop policy if exists "jobs public read live" on public.jobs;

-- Applying: the check needs to look at the ad, which visitors can no longer read, so a small function does it.
create or replace function public.job_accepts_applications(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j where j.id = p_job and j.status = 'live' and j.expires_at > now());
$$;
revoke all on function public.job_accepts_applications(uuid) from public;
grant execute on function public.job_accepts_applications(uuid) to anon, authenticated;

drop policy if exists "applications anyone insert" on public.applications;
create policy "applications anyone insert" on public.applications
  for insert to anon, authenticated
  with check (public.job_accepts_applications(job_id));

-- The public view: now also carries the thumbnail and the details text.
drop view if exists public.public_jobs;
create view public.public_jobs as
select
  j.id, j.title, j.company, j.country, j.city, j.category,
  j.file_url, j.file_type, j.whatsapp, j.posted_date, j.starts_at, j.expires_at,
  coalesce(pk.featured, false) as featured,
  coalesce(p.verified, false)  as recruiter_verified,
  j.thumb_url, j.details
from public.jobs j
left join public.profiles p  on p.id  = j.recruiter_id
left join public.packages pk on pk.id = j.package_id
where j.status = 'live' and j.expires_at > now();
revoke all on public.public_jobs from anon, authenticated;
grant select on public.public_jobs to anon, authenticated;

-- ===== payments: money records are kept; a payment reference; one paid payment per ad =====
alter table public.payments drop constraint if exists payments_recruiter_id_fkey;
alter table public.payments add constraint payments_recruiter_id_fkey
  foreign key (recruiter_id) references public.profiles (id) on delete restrict;
alter table public.payments add column if not exists reference text;   -- bank / UPI reference number (UTR)
alter table public.payments drop constraint if exists payments_reference_length;
alter table public.payments add constraint payments_reference_length check (reference is null or char_length(reference) between 1 and 60);
create unique index if not exists payments_reference_unique on public.payments (lower(reference)) where reference is not null;
create unique index if not exists payments_one_paid_per_job on public.payments (job_id) where status = 'paid' and job_id is not null;
create index if not exists payments_job_idx on public.payments (job_id);

-- ===== admin log: who did what =====
create table if not exists public.admin_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid,
  action     text not null,
  target_id  uuid,
  detail     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists admin_log_created_idx on public.admin_log (created_at);
alter table public.admin_log enable row level security;
drop policy if exists "admin log read" on public.admin_log;
create policy "admin log read" on public.admin_log for select using (public.is_admin());
-- no insert/update/delete policy: only the functions below write to it

-- ===== admin actions as functions: each checks who may call it, what status the ad is in, and writes a log line =====
create or replace function public.admin_approve_job(p_job uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  v_job  public.jobs;
  v_days integer;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status not in ('paid_pending_review', 'rejected') then
    raise exception 'This ad cannot be approved now.' using errcode = '23514';
  end if;
  v_days := coalesce(v_job.days_at_order, (select duration_days from public.packages where id = v_job.package_id), 30);
  update public.jobs
     set status = 'live', starts_at = now(), expires_at = now() + make_interval(days => v_days), reject_reason = null
   where id = p_job
   returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'approve_job', p_job, v_days || ' days');
  return v_job;
end;
$$;

drop function if exists public.admin_mark_paid(uuid, integer, text);
create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '', p_reference text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;
  v_amount := coalesce(p_amount_paise, v_job.price_paise_at_order, (select price_paise from public.packages where id = v_job.package_id), 0);
  insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, reference)
  values (v_job.id, v_job.recruiter_id, v_amount, 'manual', 'paid', coalesce(p_note, ''), nullif(btrim(coalesce(p_reference, '')), ''))
  returning * into v_payment;
  update public.jobs set status = 'paid_pending_review' where id = v_job.id;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'mark_paid', p_job, v_amount || ' paise');
  return v_payment;
end;
$$;

create or replace function public.admin_reject_job(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 1 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select status into v_status from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_status <> 'paid_pending_review' then raise exception 'This ad cannot be rejected now.' using errcode = '23514'; end if;
  update public.jobs set status = 'rejected', reject_reason = left(btrim(p_reason), 300) where id = p_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'reject_job', p_job, left(btrim(p_reason), 300));
end;
$$;

create or replace function public.admin_set_hidden(p_job uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if p_hidden then
    if v_job.status <> 'live' then raise exception 'Only a live ad can be hidden.' using errcode = '23514'; end if;
    update public.jobs set status = 'hidden' where id = p_job;
  else
    if v_job.status <> 'hidden' then raise exception 'This ad is not hidden.' using errcode = '23514'; end if;
    if v_job.expires_at is null or v_job.expires_at <= now() then raise exception 'This ad has ended.' using errcode = '23514'; end if;
    update public.jobs set status = 'live' where id = p_job;
  end if;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), case when p_hidden then 'hide_job' else 'show_job' end, p_job, '');
end;
$$;

create or replace function public.admin_refund_payment(p_payment uuid, p_hide_job boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.payments;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found.' using errcode = 'P0002'; end if;
  if v_pay.status <> 'paid' then raise exception 'This payment cannot be refunded.' using errcode = '23514'; end if;
  update public.payments set status = 'refunded' where id = p_payment;
  if p_hide_job and v_pay.job_id is not null then
    update public.jobs set status = 'hidden' where id = v_pay.job_id and status = 'live';
  end if;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'refund_payment', p_payment, case when p_hide_job then 'ad hidden' else '' end);
end;
$$;

revoke all on function public.admin_approve_job(uuid) from public, anon;
revoke all on function public.admin_mark_paid(uuid, integer, text, text) from public, anon;
revoke all on function public.admin_reject_job(uuid, text) from public, anon;
revoke all on function public.admin_set_hidden(uuid, boolean) from public, anon;
revoke all on function public.admin_refund_payment(uuid, boolean) from public, anon;
grant execute on function public.admin_approve_job(uuid) to authenticated;
grant execute on function public.admin_mark_paid(uuid, integer, text, text) to authenticated;
grant execute on function public.admin_reject_job(uuid, text) to authenticated;
grant execute on function public.admin_set_hidden(uuid, boolean) to authenticated;
grant execute on function public.admin_refund_payment(uuid, boolean) to authenticated;

-- ===== storage: smaller limits (3 MB a file, 100 files per employer) =====
update storage.buckets set file_size_limit = 3145728 where id = 'job-files';

drop policy if exists "job-files upload own folder" on storage.objects;
create policy "job-files upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files'
              and (storage.foldername(name))[1] = auth.uid()::text
              and not public.is_blocked()
              and (select count(*) from storage.objects o
                    where o.bucket_id = 'job-files'
                      and (storage.foldername(o.name))[1] = auth.uid()::text) < 100);

-- ===== indexes for later growth =====
create index if not exists applications_created_idx on public.applications (created_at);
create index if not exists jobs_created_idx on public.jobs (created_at);
create index if not exists jobs_live_filter_idx on public.jobs (country, category) where status = 'live';

-- ===== clean-up: applicants' data is kept 180 days, then deleted =====
create or replace function public.cleanup_old_data()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.applications where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.cleanup_old_data() from public, anon, authenticated;

-- Schedule expiry (every 10 minutes) and clean-up (daily) when pg_cron is available. If it is not, nothing breaks:
-- turn on Dashboard > Database > Extensions > pg_cron and run this migration's last block again.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-jobs', '*/10 * * * *', 'select public.expire_jobs()');
  perform cron.schedule('cleanup-old-data', '30 3 * * *', 'select public.cleanup_old_data()');
exception when others then
  raise notice 'pg_cron is not available here: schedule expire_jobs() and cleanup_old_data() by hand (docs/06-deploy.md, D).';
end;
$$;

-- Jobs Abroad migration 0013
-- ---------------------------------------------------------------------
-- 15. ADMIN TWO-STEP LOGIN (authenticator app)
--     An admin who has turned on the authenticator app must have used it in the current login, otherwise the database
--     treats them like a normal employer. An admin who has NOT turned it on yet keeps working (so you cannot lock yourself out
--     while setting it up). Turn it on under Admin > Security.
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_needs_code boolean := false;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    return false;
  end if;
  begin
    select exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') into v_needs_code;
    if v_needs_code and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      return false;
    end if;
  exception when others then
    -- if the login system's tables cannot be read, behave as before (never lock everyone out by accident)
    null;
  end;
  return true;
end;
$$;

-- Jobs Abroad migration 0014
-- ---------------------------------------------------------------------
-- 16. APPLICANT DETAILS ONLY FOR VERIFIED EMPLOYERS
--     Names and phone numbers of job seekers are shown to an employer only after the admin has verified that company.
--     Until then the employer sees how many people applied. (Stops a fake "recruiter" collecting phone numbers with a cheap ad.)
--     To turn this rule off, run:  insert into public.app_settings (key, value) values ('applicants_need_verified', 'false')
--                                    on conflict (key) do update set value = excluded.value;
-- ---------------------------------------------------------------------

create or replace function public.employer_may_see_applicants()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = 'applicants_need_verified'), 'true') = 'false'
      or coalesce((select verified from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.employer_may_see_applicants() from public, anon;
grant execute on function public.employer_may_see_applicants() to authenticated;

drop policy if exists "applications recruiter read own" on public.applications;
create policy "applications recruiter read own" on public.applications
  for select to authenticated
  using (public.employer_may_see_applicants()
         and exists (select 1 from public.jobs j where j.id = job_id and j.recruiter_id = auth.uid()));

-- How many people applied to my ads (a number only, no names), so an unverified employer knows something is waiting.
create or replace function public.count_my_applications()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.applications a
   where exists (select 1 from public.jobs j where j.id = a.job_id and j.recruiter_id = auth.uid());
$$;
revoke all on function public.count_my_applications() from public, anon;
grant execute on function public.count_my_applications() to authenticated;

-- Jobs Abroad migration 0015
-- ---------------------------------------------------------------------
-- 17. FIXES FROM SUPABASE'S OWN SECURITY CHECKER (Database > Advisors)
--     - Trigger functions are not meant to be called from outside: take away the right to call them
--       (a trigger still fires; the right is only checked when the trigger is created).
--     - Two functions did not pin their search path.
--     The checker still lists is_admin(), is_blocked() and the other helper functions: that is expected, the security rules
--     themselves call them for every visitor and employer, and each one only answers about the caller.
-- ---------------------------------------------------------------------

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_profile_update() from public, anon, authenticated;
revoke all on function public.profiles_block_hides_ads() from public, anon, authenticated;
revoke all on function public.jobs_guard_insert() from public, anon, authenticated;
revoke all on function public.jobs_guard_update() from public, anon, authenticated;
revoke all on function public.applications_guard_insert() from public, anon, authenticated;
revoke all on function public.change_requests_guard_insert() from public, anon, authenticated;
revoke all on function public.change_requests_stamp() from public, anon, authenticated;
revoke all on function public.jobs_normalize_whatsapp() from public, anon, authenticated;

create or replace function public.change_requests_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.handled_at := case when new.status = 'open' then null else now() end;
  end if;
  return new;
end;
$$;

create or replace function public.jobs_normalize_whatsapp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.whatsapp := regexp_replace(coalesce(new.whatsapp, ''), '[^0-9]', '', 'g');
  if new.whatsapp ~ '^[6-9][0-9]{9}$' then
    new.whatsapp := '91' || new.whatsapp;
  end if;
  return new;
end;
$$;

-- create or replace keeps the earlier rights, so take them away again for the two re-made functions
revoke all on function public.change_requests_stamp() from public, anon, authenticated;
revoke all on function public.jobs_normalize_whatsapp() from public, anon, authenticated;

-- Jobs Abroad migration 0016
-- ---------------------------------------------------------------------
-- 18. FASTER SECURITY RULES (from Supabase's performance checker)
--     Same rules as before. "auth.uid()" is now written "(select auth.uid())", so the database works out who is asking ONCE
--     per request instead of once per row. This matters when the tables get big. Nothing changes for any user.
-- ---------------------------------------------------------------------

-- profiles
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- jobs
drop policy if exists "jobs recruiter read own" on public.jobs;
create policy "jobs recruiter read own" on public.jobs
  for select to authenticated using (recruiter_id = (select auth.uid()));

drop policy if exists "jobs recruiter insert" on public.jobs;
create policy "jobs recruiter insert" on public.jobs
  for insert to authenticated
  with check (recruiter_id = (select auth.uid()) and status = 'pending_payment' and not public.is_blocked());

drop policy if exists "jobs recruiter update own waiting" on public.jobs;
create policy "jobs recruiter update own waiting" on public.jobs
  for update to authenticated
  using (recruiter_id = (select auth.uid()) and status in ('pending_payment', 'rejected') and not public.is_blocked())
  with check (recruiter_id = (select auth.uid()));

drop policy if exists "jobs recruiter delete own" on public.jobs;
create policy "jobs recruiter delete own" on public.jobs
  for delete to authenticated
  using (recruiter_id = (select auth.uid())
         and (status in ('draft', 'pending_payment', 'rejected', 'expired')
              or (status = 'live' and expires_at <= now())));

-- payments
drop policy if exists "payments read own" on public.payments;
create policy "payments read own" on public.payments
  for select to authenticated using (recruiter_id = (select auth.uid()));

-- applications
drop policy if exists "applications recruiter read own" on public.applications;
create policy "applications recruiter read own" on public.applications
  for select to authenticated
  using (public.employer_may_see_applicants()
         and exists (select 1 from public.jobs j where j.id = job_id and j.recruiter_id = (select auth.uid())));

-- change requests
drop policy if exists "change requests read own" on public.change_requests;
create policy "change requests read own" on public.change_requests
  for select to authenticated using (recruiter_id = (select auth.uid()));

drop policy if exists "change requests insert own" on public.change_requests;
create policy "change requests insert own" on public.change_requests
  for insert to authenticated
  with check (
    recruiter_id = (select auth.uid())
    and not public.is_blocked()
    and exists (select 1 from public.jobs j
                 where j.id = job_id and j.recruiter_id = (select auth.uid()) and j.status <> 'pending_payment')
  );

-- file storage rules are NOT changed here on purpose: a version with "(select auth.uid())" inside the upload rule failed
-- ("infinite recursion in policy") in the tests, so the three storage rules in migrations 0007 and 0009 stay as they are.

-- Jobs Abroad migration 0017
-- ---------------------------------------------------------------------
-- 19. LAUNCH HARDENING
--     a) signup keeps working for Supabase's own login service (explicit right to run the signup trigger)
--     b) flood limits on the Apply form without any outside service: per visitor address, per hour and per day
--     c) blocked contacts: a banned employer cannot come back with a new login and the same phone number
--     d) error log: the website reports crashes here, the admin reads them (Admin > Problems)
-- ---------------------------------------------------------------------

-- ===== a) signup trigger: Supabase's login service must be allowed to run it =====
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end;
$$;

-- ===== private salt used to scramble visitor addresses (we never store an address, only a scrambled value) =====
insert into public.app_settings (key, value) values ('ip_salt', md5(random()::text || clock_timestamp()::text))
  on conflict (key) do nothing;

-- The scrambled address of the caller, or null when unknown (SQL editor, scheduled jobs).
create or replace function public.request_client_hash()
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_headers json;
  v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''), nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''));
  if v_ip is null then
    return null;
  end if;
  return md5(v_ip || coalesce((select value from public.app_settings where key = 'ip_salt'), ''));
end;
$$;
revoke all on function public.request_client_hash() from public, anon, authenticated;

-- ===== b) Apply form: limits per visitor =====
alter table public.applications add column if not exists client_hash text;
create index if not exists applications_client_idx on public.applications (client_hash, created_at) where client_hash is not null;

create or replace function public.applications_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  if (select count(*) from public.applications where job_id = new.job_id) >= 1000 then
    raise exception 'This ad cannot take more applications.' using errcode = '54000';
  end if;
  v_hash := public.request_client_hash();
  new.client_hash := v_hash;
  if v_hash is not null then
    -- generous limits on purpose: many phones on one mobile network share one address
    if (select count(*) from public.applications where client_hash = v_hash and created_at > now() - interval '1 hour') >= 30
       or (select count(*) from public.applications where client_hash = v_hash and created_at > now() - interval '1 day') >= 100 then
      raise exception 'Too many forms from this connection. Try again later.' using errcode = '54001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.applications_guard_insert() from public, anon, authenticated;

-- ===== c) blocked contacts =====
create table if not exists public.blocked_contacts (
  phone_last10 text primary key,
  note         text not null default '',
  created_at   timestamptz not null default now()
);
alter table public.blocked_contacts enable row level security;
drop policy if exists "blocked contacts admin all" on public.blocked_contacts;
create policy "blocked contacts admin all" on public.blocked_contacts
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.blocked_contacts from anon;

create or replace function public.phone_last10(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 10), '');
$$;

-- When an employer is blocked, their phone and the WhatsApp numbers of their ads are remembered; when unblocked, forgotten.
create or replace function public.profiles_block_hides_ads()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.blocked and not old.blocked then
    update public.jobs set status = 'hidden' where recruiter_id = new.id and status = 'live';
    insert into public.blocked_contacts (phone_last10, note)
      select distinct x.p, 'blocked employer ' || new.id
        from (select public.phone_last10(new.phone) as p
              union select public.phone_last10(whatsapp) from public.jobs where recruiter_id = new.id) x
       where x.p is not null
      on conflict (phone_last10) do nothing;
  elsif old.blocked and not new.blocked then
    delete from public.blocked_contacts where note = 'blocked employer ' || new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_block_hides_ads() from public, anon, authenticated;

-- A new login with a banned phone number starts as blocked.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phone text := coalesce(left(new.raw_user_meta_data ->> 'phone', 20), '');
begin
  insert into public.profiles (id, email, role, company_name, phone, ra_number, blocked)
  values (
    new.id,
    new.email,
    'recruiter',
    coalesce(left(new.raw_user_meta_data ->> 'company_name', 120), ''),
    v_phone,
    coalesce(left(new.raw_user_meta_data ->> 'ra_number', 40), ''),
    exists (select 1 from public.blocked_contacts where phone_last10 = public.phone_last10(v_phone))
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end;
$$;

-- An ad cannot be made with a banned WhatsApp number (same rules as before otherwise).
create or replace function public.jobs_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;                                   -- admin / SQL editor / scheduled jobs
  end if;
  if public.is_blocked() then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  if exists (select 1 from public.blocked_contacts where phone_last10 = public.phone_last10(new.whatsapp)) then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  if new.package_id is null
     or not exists (select 1 from public.packages where id = new.package_id and active) then
    raise exception 'Please choose a package.' using errcode = '23514';
  end if;
  if (select count(*) from public.jobs where recruiter_id = auth.uid() and status = 'pending_payment') >= 20 then
    raise exception 'Too many unpaid ads.' using errcode = '53400';
  end if;
  if new.thumb_path is not null and new.file_path is null then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  new.file_url   := public.job_file_checked_url(auth.uid(), new.file_path);
  new.thumb_url  := public.job_file_checked_url(auth.uid(), new.thumb_path);
  new.file_type  := case when new.file_path ilike '%.pdf' then 'pdf' else 'image' end;
  select price_paise, duration_days into new.price_paise_at_order, new.days_at_order
    from public.packages where id = new.package_id;
  new.recruiter_id   := auth.uid();
  new.status         := 'pending_payment';
  new.starts_at      := null;
  new.expires_at     := null;
  new.reject_reason  := null;
  new.posted_date    := current_date;
  return new;
end;
$$;
revoke all on function public.jobs_guard_insert() from public, anon, authenticated;

-- ===== d) error log =====
create table if not exists public.error_log (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  page       text not null default '',
  agent      text not null default '',
  times      integer not null default 1,
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now()
);
create index if not exists error_log_last_idx on public.error_log (last_at);
alter table public.error_log enable row level security;
drop policy if exists "error log admin all" on public.error_log;
create policy "error log admin all" on public.error_log
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.error_log from anon;

-- The website reports a crash here. Short texts only; the same crash on the same page within an hour is counted, not repeated;
-- and at most 300 new lines a day, so nobody can fill the database through this door.
create or replace function public.log_client_error(p_message text, p_page text default '', p_agent text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_msg text := left(btrim(coalesce(p_message, '')), 300);
  v_page text := left(btrim(coalesce(p_page, '')), 200);
  v_id uuid;
begin
  if v_msg = '' then
    return;
  end if;
  select id into v_id from public.error_log
   where message = v_msg and page = v_page and last_at > now() - interval '1 hour' limit 1;
  if v_id is not null then
    update public.error_log set times = times + 1, last_at = now() where id = v_id;
    return;
  end if;
  if (select count(*) from public.error_log where created_at > now() - interval '1 day') >= 300 then
    return;
  end if;
  insert into public.error_log (message, page, agent) values (v_msg, v_page, left(btrim(coalesce(p_agent, '')), 150));
end;
$$;
revoke all on function public.log_client_error(text, text, text) from public;
grant execute on function public.log_client_error(text, text, text) to anon, authenticated;

-- clean-up now also forgets old error lines (30 days)
create or replace function public.cleanup_old_data()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.applications where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  delete from public.error_log where last_at < now() - interval '30 days';
  return n;
end;
$$;
revoke all on function public.cleanup_old_data() from public, anon, authenticated;

-- Jobs Abroad migration 0018
-- ---------------------------------------------------------------------
-- 20. FLEXIBLE PLANS AND OFFERS
--     - plans: description, order, badge, max files; a plan that has ads cannot be deleted
--     - offers (percent, flat, bonus days, free), coupon codes, who they apply to, dates, usage limits
--     - redemptions, a change log (audit_log) for plans and offers
--     - the price saved with every ad and payment: list price, discount, final price, offer, final days
--     - quote_price(): the ONLY place a price is worked out; create_ad_order(): saves the order
--     - admin: extend days, toggle featured on one ad, give a free ad
--     Phase 1 only: no online payment. Phase 2 can call quote_price_for() from its order function.
-- ---------------------------------------------------------------------

-- ===== plans =====
alter table public.packages add column if not exists description text not null default '';
alter table public.packages add column if not exists sort_order integer not null default 0;
alter table public.packages add column if not exists badge_text text not null default '';
alter table public.packages add column if not exists max_files integer not null default 1;
alter table public.packages drop constraint if exists packages_description_length;
alter table public.packages add constraint packages_description_length check (char_length(description) <= 200);
alter table public.packages drop constraint if exists packages_badge_length;
alter table public.packages add constraint packages_badge_length check (char_length(badge_text) <= 30);
alter table public.packages drop constraint if exists packages_max_files_range;
alter table public.packages add constraint packages_max_files_range check (max_files between 1 and 10);

update public.packages p set sort_order = x.rn * 10
  from (select id, row_number() over (order by price_paise, created_at) as rn from public.packages) x
 where p.id = x.id and p.sort_order = 0;

-- a new plan goes to the end of the list
create or replace function public.packages_set_order()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from public.packages), 0) + 10;
  end if;
  return new;
end;
$$;
revoke all on function public.packages_set_order() from public, anon, authenticated;
drop trigger if exists packages_set_order_trg on public.packages;
create trigger packages_set_order_trg before insert on public.packages for each row execute function public.packages_set_order();

-- a plan that has ads cannot be deleted (turn it off instead)
create or replace function public.packages_guard_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.jobs where package_id = old.id) then
    raise exception 'This plan has ads. Turn it off instead.' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.packages_guard_delete() from public, anon, authenticated;
drop trigger if exists packages_guard_delete_trg on public.packages;
create trigger packages_guard_delete_trg before delete on public.packages for each row execute function public.packages_guard_delete();

-- visitors and employers read only plans that are on, plus the plan of their own ads (so an old ad never loses its plan name)
drop policy if exists "packages read all" on public.packages;
drop policy if exists "packages read active" on public.packages;
create policy "packages read active" on public.packages
  for select using (
    active
    or public.is_admin()
    or exists (select 1 from public.jobs j where j.package_id = packages.id and j.recruiter_id = (select auth.uid()))
  );

-- ===== offers =====
create table if not exists public.offers (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(btrim(name)) between 1 and 80),
  type                   text not null check (type in ('percent', 'flat', 'bonus_days', 'free')),
  value                  numeric not null default 0 check (value >= 0),   -- percent (1-100), rupees in PAISE (flat), or days (bonus_days)
  applies_to             text not null default 'all' check (applies_to in ('all', 'package', 'recruiter')),
  package_id             uuid references public.packages (id) on delete cascade,
  recruiter_id           uuid references public.profiles (id) on delete cascade,
  coupon_code            text check (coupon_code is null or coupon_code ~ '^[A-Za-z0-9_-]{3,30}$'),
  starts_at              timestamptz,
  ends_at                timestamptz,
  max_uses               integer check (max_uses is null or max_uses >= 1),
  max_uses_per_recruiter integer not null default 1 check (max_uses_per_recruiter >= 1),
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  constraint offers_value_by_type check (
    (type = 'percent' and value between 1 and 100)
    or (type = 'flat' and value >= 100 and value = trunc(value))
    or (type = 'bonus_days' and value between 1 and 365 and value = trunc(value))
    or (type = 'free')),
  constraint offers_target check (
    (applies_to = 'all' and package_id is null and recruiter_id is null)
    or (applies_to = 'package' and package_id is not null and recruiter_id is null)
    or (applies_to = 'recruiter' and recruiter_id is not null and package_id is null)),
  constraint offers_dates check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create unique index if not exists offers_coupon_unique on public.offers (lower(coupon_code)) where coupon_code is not null;
create index if not exists offers_active_idx on public.offers (active, applies_to);

create table if not exists public.offer_redemptions (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references public.offers (id) on delete cascade,
  recruiter_id  uuid not null references public.profiles (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,   -- deleting an unpaid ad gives the use back
  discount_paise integer not null default 0 check (discount_paise >= 0),
  bonus_days    integer not null default 0 check (bonus_days >= 0),
  created_at    timestamptz not null default now()
);
create unique index if not exists offer_redemptions_job_unique on public.offer_redemptions (job_id);
create index if not exists offer_redemptions_offer_idx on public.offer_redemptions (offer_id, recruiter_id);

create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at);
create index if not exists audit_log_table_idx on public.audit_log (table_name, created_at);

alter table public.offers enable row level security;
alter table public.offer_redemptions enable row level security;
alter table public.audit_log enable row level security;

-- offers: admins do everything. Employers read only ACTIVE offers with no secret code that are for everyone or for their plan-wide use,
-- plus offers made for them personally. They never see coupon codes of other offers.
drop policy if exists "offers admin all" on public.offers;
create policy "offers admin all" on public.offers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "offers employer read" on public.offers;
create policy "offers employer read" on public.offers
  for select to authenticated
  using (active and ((coupon_code is null and applies_to in ('all', 'package')) or (applies_to = 'recruiter' and recruiter_id = (select auth.uid()))));

-- redemptions: admins everything; an employer reads only their own; nobody else writes (only create_ad_order does)
drop policy if exists "redemptions admin all" on public.offer_redemptions;
create policy "redemptions admin all" on public.offer_redemptions for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "redemptions read own" on public.offer_redemptions;
create policy "redemptions read own" on public.offer_redemptions for select to authenticated using (recruiter_id = (select auth.uid()));

-- audit log: admins read; nobody writes directly
drop policy if exists "audit log read" on public.audit_log;
create policy "audit log read" on public.audit_log for select using (public.is_admin());
revoke all on public.audit_log from anon;
revoke all on public.offers from anon;
revoke all on public.offer_redemptions from anon;

-- every change to a plan or an offer is written to the audit log
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  insert into public.audit_log (admin_id, action, table_name, record_id, old_value, new_value)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce((v_new ->> 'id'), (v_old ->> 'id'))::uuid, v_old, v_new);
  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_row() from public, anon, authenticated;
drop trigger if exists packages_audit_trg on public.packages;
create trigger packages_audit_trg after insert or update or delete on public.packages for each row execute function public.audit_row();
drop trigger if exists offers_audit_trg on public.offers;
create trigger offers_audit_trg after insert or update or delete on public.offers for each row execute function public.audit_row();

-- ===== the price saved with every ad and payment =====
alter table public.jobs add column if not exists list_price_paise integer;
alter table public.jobs add column if not exists discount_paise integer not null default 0;
alter table public.jobs add column if not exists final_price_paise integer;
alter table public.jobs add column if not exists offer_id uuid references public.offers (id) on delete set null;
alter table public.jobs add column if not exists duration_days_final integer;
alter table public.jobs add column if not exists featured_override boolean;      -- admin can make one ad featured (or not), whatever its plan says
alter table public.payments add column if not exists list_price_paise integer;
alter table public.payments add column if not exists discount_paise integer not null default 0;
alter table public.payments add column if not exists final_price_paise integer;
alter table public.payments add column if not exists offer_id uuid references public.offers (id) on delete set null;
alter table public.payments add column if not exists duration_days_final integer;
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('manual', 'razorpay', 'free_offer', 'complimentary'));

update public.jobs set list_price_paise = price_paise_at_order, final_price_paise = price_paise_at_order, duration_days_final = days_at_order
 where list_price_paise is null and price_paise_at_order is not null;

-- deleting an unpaid ad also removes its waiting ("created") payment; its offer use is given back by the foreign key
create or replace function public.jobs_clear_waiting_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.payments where job_id = old.id and status = 'created';
  return old;
end;
$$;
revoke all on function public.jobs_clear_waiting_payment() from public, anon, authenticated;
drop trigger if exists jobs_clear_waiting_payment_trg on public.jobs;
create trigger jobs_clear_waiting_payment_trg before delete on public.jobs for each row execute function public.jobs_clear_waiting_payment();

-- ===== guards: new price columns are locked for employers; the order function may change them =====
create or replace function public.jobs_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if public.is_blocked() then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  if exists (select 1 from public.blocked_contacts where phone_last10 = public.phone_last10(new.whatsapp)) then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  if new.package_id is null
     or not exists (select 1 from public.packages where id = new.package_id and active) then
    raise exception 'Please choose a package.' using errcode = '23514';
  end if;
  if (select count(*) from public.jobs where recruiter_id = auth.uid() and status = 'pending_payment') >= 20 then
    raise exception 'Too many unpaid ads.' using errcode = '53400';
  end if;
  if new.thumb_path is not null and new.file_path is null then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  new.file_url   := public.job_file_checked_url(auth.uid(), new.file_path);
  new.thumb_url  := public.job_file_checked_url(auth.uid(), new.thumb_path);
  new.file_type  := case when new.file_path ilike '%.pdf' then 'pdf' else 'image' end;
  select price_paise, duration_days into new.price_paise_at_order, new.days_at_order
    from public.packages where id = new.package_id;
  -- the first saved price is the plan's list price; create_ad_order replaces it with the quote (offers) right after
  new.list_price_paise     := new.price_paise_at_order;
  new.discount_paise       := 0;
  new.final_price_paise    := new.price_paise_at_order;
  new.duration_days_final  := new.days_at_order;
  new.offer_id             := null;
  new.featured_override    := null;
  new.recruiter_id   := auth.uid();
  new.status         := 'pending_payment';
  new.starts_at      := null;
  new.expires_at     := null;
  new.reject_reason  := null;
  new.posted_date    := current_date;
  return new;
end;
$$;
revoke all on function public.jobs_guard_insert() from public, anon, authenticated;

create or replace function public.jobs_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_resubmit boolean;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- create_ad_order (our own trusted function) switches this on for its own few statements only
  if current_setting('app.order_in_progress', true) = 'on' then
    return new;
  end if;
  v_resubmit := old.status = 'rejected' and new.status = 'paid_pending_review' and new.reject_reason is null;
  if (new.status is distinct from old.status and not v_resubmit)
     or (new.reject_reason is distinct from old.reject_reason and not v_resubmit)
     or new.package_id    is distinct from old.package_id
     or new.starts_at     is distinct from old.starts_at
     or new.expires_at    is distinct from old.expires_at
     or new.recruiter_id  is distinct from old.recruiter_id
     or new.posted_date   is distinct from old.posted_date
     or new.price_paise_at_order is distinct from old.price_paise_at_order
     or new.days_at_order is distinct from old.days_at_order
     or new.list_price_paise     is distinct from old.list_price_paise
     or new.discount_paise       is distinct from old.discount_paise
     or new.final_price_paise    is distinct from old.final_price_paise
     or new.offer_id             is distinct from old.offer_id
     or new.duration_days_final  is distinct from old.duration_days_final
     or new.featured_override    is distinct from old.featured_override then
    raise exception 'You cannot change this.' using errcode = '42501';
  end if;
  if new.file_path is distinct from old.file_path or new.file_url is distinct from old.file_url
     or new.thumb_path is distinct from old.thumb_path or new.thumb_url is distinct from old.thumb_url then
    if new.thumb_path is not null and new.file_path is null then
      raise exception 'Bad file.' using errcode = '42501';
    end if;
    new.file_url  := public.job_file_checked_url(auth.uid(), new.file_path);
    new.thumb_url := public.job_file_checked_url(auth.uid(), new.thumb_path);
    new.file_type := case when new.file_path ilike '%.pdf' then 'pdf' else 'image' end;
  end if;
  return new;
end;
$$;
revoke all on function public.jobs_guard_update() from public, anon, authenticated;

-- the public list: an ad is featured when the admin says so for that ad, otherwise when its plan is featured
drop view if exists public.public_jobs;
create view public.public_jobs as
select
  j.id, j.title, j.company, j.country, j.city, j.category,
  j.file_url, j.file_type, j.whatsapp, j.posted_date, j.starts_at, j.expires_at,
  coalesce(j.featured_override, pk.featured, false) as featured,
  coalesce(p.verified, false)  as recruiter_verified,
  j.thumb_url, j.details
from public.jobs j
left join public.profiles p  on p.id  = j.recruiter_id
left join public.packages pk on pk.id = j.package_id
where j.status = 'live' and j.expires_at > now();
revoke all on public.public_jobs from anon, authenticated;
grant select on public.public_jobs to anon, authenticated;

-- ===== THE price calculation: the only place a price is worked out =====
-- Returns a JSON answer: ok, code (a short word the website turns into plain text in the person's language), prices, bonus days.
create or replace function public.quote_price_for(p_recruiter uuid, p_package uuid, p_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_pkg    public.packages;
  v_code   text := nullif(btrim(coalesce(p_code, '')), '');
  v_offer  public.offers;
  v_best   public.offers;
  v_best_v numeric := -1;
  v_v      numeric;
  o        public.offers;
  v_list   integer;
  v_days   integer;
  v_disc   integer := 0;
  v_bonus  integer := 0;
  v_final  integer;
  v_fail   text;
  v_applied boolean := false;

  -- how many times an offer was used in total / by this employer
  v_total  integer;
  v_mine   integer;
begin
  select * into v_pkg from public.packages where id = p_package;
  if not found or not v_pkg.active then
    return jsonb_build_object('ok', false, 'code', 'plan_unavailable');
  end if;
  v_list := v_pkg.price_paise;
  v_days := v_pkg.duration_days;

  if v_code is not null then
    select * into v_offer from public.offers where lower(coupon_code) = lower(v_code);
    if not found then v_fail := 'not_found';
    elsif not v_offer.active then v_fail := 'inactive';
    elsif v_offer.starts_at is not null and v_offer.starts_at > now() then v_fail := 'not_started';
    elsif v_offer.ends_at is not null and v_offer.ends_at <= now() then v_fail := 'expired';
    elsif v_offer.applies_to = 'package' and v_offer.package_id is distinct from p_package then v_fail := 'wrong_plan';
    elsif v_offer.applies_to = 'recruiter' and v_offer.recruiter_id is distinct from p_recruiter then v_fail := 'wrong_recruiter';
    else
      select count(*) into v_total from public.offer_redemptions where offer_id = v_offer.id;
      select count(*) into v_mine from public.offer_redemptions where offer_id = v_offer.id and recruiter_id = p_recruiter;
      if v_offer.max_uses is not null and v_total >= v_offer.max_uses then v_fail := 'used_up';
      elsif v_mine >= v_offer.max_uses_per_recruiter then v_fail := 'already_used';
      end if;
    end if;
    if v_fail is not null then
      return jsonb_build_object('ok', false, 'code', v_fail, 'list_price_paise', v_list, 'discount_paise', 0, 'final_price_paise', v_list,
                                'bonus_days', 0, 'base_days', v_days, 'final_days', v_days);
    end if;
    v_best := v_offer;
  else
    -- no code: the single best automatic offer (never several together)
    for o in
      select * from public.offers f
       where f.active and f.coupon_code is null
         and (f.starts_at is null or f.starts_at <= now())
         and (f.ends_at is null or f.ends_at > now())
         and (f.applies_to = 'all'
              or (f.applies_to = 'package' and f.package_id = p_package)
              or (f.applies_to = 'recruiter' and f.recruiter_id = p_recruiter))
         and (f.max_uses is null or (select count(*) from public.offer_redemptions r where r.offer_id = f.id) < f.max_uses)
         and (select count(*) from public.offer_redemptions r where r.offer_id = f.id and r.recruiter_id = p_recruiter) < f.max_uses_per_recruiter
       order by f.created_at desc
    loop
      v_v := case o.type
               when 'percent' then v_list * o.value / 100.0
               when 'flat' then least(o.value, v_list)
               when 'free' then v_list
               else v_list::numeric / v_days * o.value          -- bonus days: worth the daily price of the plan
             end;
      if v_v > v_best_v then
        v_best_v := v_v;
        v_best := o;
      end if;
    end loop;
  end if;

  if v_best.id is not null then
    v_applied := true;
    case v_best.type
      when 'percent' then v_disc := round(v_list * v_best.value / 100.0)::integer;
      when 'flat' then v_disc := least(v_best.value::integer, v_list);
      when 'free' then v_disc := v_list;
      when 'bonus_days' then v_bonus := v_best.value::integer;
    end case;
  end if;
  v_disc  := least(greatest(v_disc, 0), v_list);
  v_final := greatest(v_list - v_disc, 0);                      -- never below zero

  return jsonb_build_object(
    'ok', true,
    'code', case when v_applied then v_best.type else 'no_offer' end,
    'list_price_paise', v_list, 'discount_paise', v_disc, 'final_price_paise', v_final,
    'bonus_days', v_bonus, 'base_days', v_days, 'final_days', v_days + v_bonus,
    'offer_id', v_best.id, 'offer_name', v_best.name, 'offer_type', v_best.type, 'offer_value', v_best.value,
    'via_code', v_code is not null and v_applied,
    'percent', case when v_best.type = 'percent' then v_best.value end
  );
end;
$$;
revoke all on function public.quote_price_for(uuid, uuid, text) from public, anon, authenticated;

-- What the website calls: the quote for the logged-in employer.
create or replace function public.quote_price(p_package uuid, p_coupon_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in.' using errcode = '42501';
  end if;
  return public.quote_price_for(auth.uid(), p_package, p_coupon_code);
end;
$$;
revoke all on function public.quote_price(uuid, text) from public, anon;
grant execute on function public.quote_price(uuid, text) to authenticated;

-- Saves the order: the price snapshot on the ad, a waiting payment record, the offer use. A free total is paid at once.
create or replace function public.create_ad_order(p_job uuid, p_package uuid, p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_job  public.jobs;
  v_q    jsonb;
  v_pay  uuid;
  v_final integer;
  v_offer uuid;
  v_name  text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Please log in.' using errcode = '42501';
  end if;
  if public.is_blocked() then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('create_ad_order'));     -- orders one after another, so offer limits cannot be beaten by two at once
  select * into v_job from public.jobs where id = p_job and recruiter_id = auth.uid() for update;
  if not found then
    raise exception 'Ad not found.' using errcode = 'P0002';
  end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;

  delete from public.offer_redemptions where job_id = p_job;     -- ordering again gives the earlier offer use back first
  v_q := public.quote_price_for(auth.uid(), p_package, p_coupon_code);
  if not (v_q ->> 'ok')::boolean then
    raise exception 'offer: %', v_q ->> 'code' using errcode = 'P0001';
  end if;
  if v_q ->> 'code' = 'plan_unavailable' then
    raise exception 'offer: plan_unavailable' using errcode = 'P0001';
  end if;
  v_final := (v_q ->> 'final_price_paise')::integer;
  v_offer := nullif(v_q ->> 'offer_id', '')::uuid;
  v_name  := v_q ->> 'offer_name';

  perform set_config('app.order_in_progress', 'on', true);
  update public.jobs set
    package_id = p_package,
    list_price_paise = (v_q ->> 'list_price_paise')::integer,
    discount_paise = (v_q ->> 'discount_paise')::integer,
    final_price_paise = v_final,
    offer_id = v_offer,
    duration_days_final = (v_q ->> 'final_days')::integer,
    price_paise_at_order = v_final,
    days_at_order = (v_q ->> 'final_days')::integer
   where id = p_job;
  perform set_config('app.order_in_progress', '', true);

  select id into v_pay from public.payments where job_id = p_job and status = 'created' order by created_at desc limit 1 for update;
  if v_pay is null then
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, list_price_paise, discount_paise, final_price_paise, offer_id, duration_days_final)
    values (p_job, auth.uid(), v_final, 'manual', 'created', '', (v_q ->> 'list_price_paise')::integer, (v_q ->> 'discount_paise')::integer, v_final, v_offer, (v_q ->> 'final_days')::integer)
    returning id into v_pay;
  else
    update public.payments set amount_paise = v_final, list_price_paise = (v_q ->> 'list_price_paise')::integer, discount_paise = (v_q ->> 'discount_paise')::integer,
           final_price_paise = v_final, offer_id = v_offer, duration_days_final = (v_q ->> 'final_days')::integer
     where id = v_pay;
  end if;

  if v_offer is not null then
    insert into public.offer_redemptions (offer_id, recruiter_id, job_id, discount_paise, bonus_days)
    values (v_offer, auth.uid(), p_job, (v_q ->> 'discount_paise')::integer, (v_q ->> 'bonus_days')::integer);
  end if;

  v_status := 'pending_payment';
  if v_final = 0 then
    update public.payments set status = 'paid', method = 'free_offer', note = left('Free offer: ' || coalesce(v_name, ''), 200) where id = v_pay;
    perform set_config('app.order_in_progress', 'on', true);
    update public.jobs set status = 'paid_pending_review' where id = p_job;
    perform set_config('app.order_in_progress', '', true);
    v_status := 'paid_pending_review';
  end if;

  return v_q || jsonb_build_object('job_status', v_status, 'payment_id', v_pay);
end;
$$;
revoke all on function public.create_ad_order(uuid, uuid, text) from public, anon;
grant execute on function public.create_ad_order(uuid, uuid, text) to authenticated;

-- ===== admin: approve and mark-paid now use the final saved price and days =====
create or replace function public.admin_approve_job(p_job uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  v_job  public.jobs;
  v_days integer;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status not in ('paid_pending_review', 'rejected') then
    raise exception 'This ad cannot be approved now.' using errcode = '23514';
  end if;
  v_days := coalesce(v_job.duration_days_final, v_job.days_at_order, (select duration_days from public.packages where id = v_job.package_id), 30);
  update public.jobs
     set status = 'live', starts_at = now(), expires_at = now() + make_interval(days => v_days), reject_reason = null
   where id = p_job
   returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'approve_job', p_job, v_days || ' days');
  return v_job;
end;
$$;

create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '', p_reference text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
  v_ref     text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;
  v_amount := coalesce(p_amount_paise, v_job.final_price_paise, v_job.price_paise_at_order, (select price_paise from public.packages where id = v_job.package_id), 0);
  select * into v_payment from public.payments where job_id = v_job.id and status = 'created' order by created_at desc limit 1 for update;
  if found then
    update public.payments set status = 'paid', method = 'manual', amount_paise = v_amount, note = coalesce(p_note, ''), reference = v_ref
     where id = v_payment.id returning * into v_payment;
  else
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, reference, list_price_paise, discount_paise, final_price_paise, offer_id, duration_days_final)
    values (v_job.id, v_job.recruiter_id, v_amount, 'manual', 'paid', coalesce(p_note, ''), v_ref, v_job.list_price_paise, v_job.discount_paise, v_job.final_price_paise, v_job.offer_id, v_job.duration_days_final)
    returning * into v_payment;
  end if;
  update public.jobs set status = 'paid_pending_review' where id = v_job.id;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'mark_paid', p_job, v_amount || ' paise');
  return v_payment;
end;
$$;

-- ===== admin: three actions on one ad =====
create or replace function public.admin_extend_job(p_job uuid, p_days integer, p_reason text)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Days must be between 1 and 365.' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status not in ('live', 'hidden') or v_job.expires_at is null then
    raise exception 'Only a live or hidden ad can get more days.' using errcode = '23514';
  end if;
  update public.jobs set expires_at = greatest(expires_at, now()) + make_interval(days => p_days) where id = p_job returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'extend_job', p_job, '+' || p_days || ' days: ' || left(btrim(p_reason), 200));
  return v_job;
end;
$$;

create or replace function public.admin_set_featured(p_job uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  update public.jobs set featured_override = p_featured where id = p_job;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'set_featured', p_job, p_featured::text);
end;
$$;

create or replace function public.admin_give_free_ad(p_job uuid, p_note text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_pay public.payments;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(v_note) < 3 then raise exception 'Please write a note.' using errcode = '23514'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then raise exception 'This ad is not waiting for payment.' using errcode = '23514'; end if;
  select * into v_pay from public.payments where job_id = p_job and status = 'created' order by created_at desc limit 1 for update;
  if found then
    update public.payments set status = 'paid', method = 'complimentary', amount_paise = 0, discount_paise = coalesce(list_price_paise, 0), final_price_paise = 0, note = v_note
     where id = v_pay.id returning * into v_pay;
  else
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, list_price_paise, discount_paise, final_price_paise, duration_days_final)
    values (p_job, v_job.recruiter_id, 0, 'complimentary', 'paid', v_note, v_job.list_price_paise, coalesce(v_job.list_price_paise, 0), 0, v_job.duration_days_final)
    returning * into v_pay;
  end if;
  update public.jobs set status = 'paid_pending_review', discount_paise = coalesce(list_price_paise, 0), final_price_paise = 0 where id = p_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'give_free_ad', p_job, v_note);
  return v_pay;
end;
$$;

revoke all on function public.admin_extend_job(uuid, integer, text) from public, anon;
revoke all on function public.admin_set_featured(uuid, boolean) from public, anon;
revoke all on function public.admin_give_free_ad(uuid, text) from public, anon;
revoke all on function public.admin_approve_job(uuid) from public, anon;
revoke all on function public.admin_mark_paid(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_extend_job(uuid, integer, text) to authenticated;
grant execute on function public.admin_set_featured(uuid, boolean) to authenticated;
grant execute on function public.admin_give_free_ad(uuid, text) to authenticated;
grant execute on function public.admin_approve_job(uuid) to authenticated;
grant execute on function public.admin_mark_paid(uuid, integer, text, text) to authenticated;

-- Jobs Abroad migration 0019
-- 21. Ads that waited for payment for more than 30 days are removed by the daily clean-up.
--     Their waiting payment and offer use go with them (migration 0018 triggers and foreign keys).
--     Their picture files are NOT removed here (Supabase does not allow deleting stored files from SQL);
--     Admin > Problems > "Look for unused files" finds and removes them.
create or replace function public.cleanup_old_data()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.applications where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  delete from public.error_log where last_at < now() - interval '30 days';
  delete from public.jobs where status = 'pending_payment' and created_at < now() - interval '30 days';
  return n;
end;
$$;
revoke all on function public.cleanup_old_data() from public, anon, authenticated;

-- Jobs Abroad migration 0020
-- ---------------------------------------------------------------------
-- 22. STRUCTURED JOB FIELDS, REPORTS, DELETION REQUESTS, PUBLIC COUNTERS
--     - jobs: salary_min, salary_max, currency, experience_level, vacancies, last_date, visa_type (all optional)
--     - public_jobs view carries them, plus the employer's registration number ONLY when admin has verified the employer
--     - reports: a visitor reports an ad (reason + short message), limited per visitor address; only admins read
--     - deletion_requests: someone asks us to delete their account or data; limited; only admins read
--     - public_counts(): three numbers for the home page
-- ---------------------------------------------------------------------

-- ===== job facts =====
alter table public.jobs add column if not exists salary_min integer;
alter table public.jobs add column if not exists salary_max integer;
alter table public.jobs add column if not exists currency text;
alter table public.jobs add column if not exists experience_level text;
alter table public.jobs add column if not exists vacancies integer;
alter table public.jobs add column if not exists last_date date;
alter table public.jobs add column if not exists visa_type text;

alter table public.jobs drop constraint if exists jobs_salary_range;
alter table public.jobs add constraint jobs_salary_range check (
  (salary_min is null or salary_min between 0 and 10000000)
  and (salary_max is null or salary_max between 0 and 10000000)
  and (salary_min is null or salary_max is null or salary_max >= salary_min));
alter table public.jobs drop constraint if exists jobs_currency_list;
alter table public.jobs add constraint jobs_currency_list check (currency is null or currency in ('AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'INR', 'USD'));
alter table public.jobs drop constraint if exists jobs_currency_needs_salary;
alter table public.jobs add constraint jobs_currency_needs_salary check (currency is null or salary_min is not null or salary_max is not null);
alter table public.jobs drop constraint if exists jobs_experience_list;
alter table public.jobs add constraint jobs_experience_list check (experience_level is null or experience_level in ('fresher', '1-2', '2-5', '5+'));
alter table public.jobs drop constraint if exists jobs_vacancies_range;
alter table public.jobs add constraint jobs_vacancies_range check (vacancies is null or vacancies between 1 and 9999);
alter table public.jobs drop constraint if exists jobs_visa_length;
alter table public.jobs add constraint jobs_visa_length check (visa_type is null or char_length(visa_type) <= 40);

-- the public list: facts, and the registration number only for a verified employer
drop view if exists public.public_jobs;
create view public.public_jobs as
select
  j.id, j.title, j.company, j.country, j.city, j.category,
  j.file_url, j.file_type, j.whatsapp, j.posted_date, j.starts_at, j.expires_at,
  coalesce(j.featured_override, pk.featured, false) as featured,
  coalesce(p.verified, false)  as recruiter_verified,
  case when p.verified then nullif(btrim(p.ra_number), '') end as recruiter_ra_number,
  j.thumb_url, j.details,
  j.salary_min, j.salary_max, j.currency, j.experience_level, j.vacancies, j.last_date, j.visa_type
from public.jobs j
left join public.profiles p  on p.id  = j.recruiter_id
left join public.packages pk on pk.id = j.package_id
where j.status = 'live' and j.expires_at > now();
revoke all on public.public_jobs from anon, authenticated;
grant select on public.public_jobs to anon, authenticated;

-- ===== reports (someone reports an ad) =====
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  reason      text not null check (reason in ('asked_money', 'fake_company', 'wrong_details', 'other')),
  message     text not null default '' check (char_length(message) <= 300),
  contact     text not null default '' check (char_length(contact) <= 40),
  status      text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  client_hash text,
  created_at  timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at);
create index if not exists reports_client_idx on public.reports (client_hash, created_at) where client_hash is not null;
alter table public.reports enable row level security;

-- only for an ad that is live now; 10 reports an hour and one per ad from one visitor address
create or replace function public.reports_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  if not exists (select 1 from public.jobs where id = new.job_id and status = 'live' and expires_at > now()) then
    raise exception 'This ad is not open.' using errcode = '23514';
  end if;
  new.status := 'open';
  new.message := btrim(new.message);
  new.contact := btrim(new.contact);
  v_hash := public.request_client_hash();
  new.client_hash := v_hash;
  if v_hash is not null then
    if exists (select 1 from public.reports where client_hash = v_hash and job_id = new.job_id) then
      raise exception 'You already reported this ad.' using errcode = '23505';
    end if;
    if (select count(*) from public.reports where client_hash = v_hash and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Too many reports from this connection. Try again later.' using errcode = '54001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.reports_guard_insert() from public, anon, authenticated;
drop trigger if exists reports_guard_insert_trg on public.reports;
create trigger reports_guard_insert_trg before insert on public.reports for each row execute function public.reports_guard_insert();

drop policy if exists "reports anyone insert" on public.reports;
create policy "reports anyone insert" on public.reports for insert to anon, authenticated with check (true);
drop policy if exists "reports admin all" on public.reports;
create policy "reports admin all" on public.reports for all using (public.is_admin()) with check (public.is_admin());

-- ===== account deletion requests =====
create table if not exists public.deletion_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (char_length(email) between 5 and 120 and email like '%_@_%._%'),
  note        text not null default '' check (char_length(note) <= 300),
  status      text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  client_hash text,
  created_at  timestamptz not null default now()
);
create index if not exists deletion_requests_status_idx on public.deletion_requests (status, created_at);
alter table public.deletion_requests enable row level security;

create or replace function public.deletion_requests_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  new.status := 'open';
  new.email := lower(btrim(new.email));
  new.note := btrim(new.note);
  v_hash := public.request_client_hash();
  new.client_hash := v_hash;
  if exists (select 1 from public.deletion_requests where email = new.email and status = 'open') then
    raise exception 'We already have your request.' using errcode = '23505';
  end if;
  if v_hash is not null and (select count(*) from public.deletion_requests where client_hash = v_hash and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many requests from this connection. Try again later.' using errcode = '54001';
  end if;
  return new;
end;
$$;
revoke all on function public.deletion_requests_guard_insert() from public, anon, authenticated;
drop trigger if exists deletion_requests_guard_insert_trg on public.deletion_requests;
create trigger deletion_requests_guard_insert_trg before insert on public.deletion_requests for each row execute function public.deletion_requests_guard_insert();

drop policy if exists "deletion requests anyone insert" on public.deletion_requests;
create policy "deletion requests anyone insert" on public.deletion_requests for insert to anon, authenticated with check (true);
drop policy if exists "deletion requests admin all" on public.deletion_requests;
create policy "deletion requests admin all" on public.deletion_requests for all using (public.is_admin()) with check (public.is_admin());

-- the clean-up also forgets finished reports and requests after a year
create or replace function public.cleanup_old_data()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.applications where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  delete from public.error_log where last_at < now() - interval '30 days';
  delete from public.jobs where status = 'pending_payment' and created_at < now() - interval '30 days';
  delete from public.reports where status <> 'open' and created_at < now() - interval '365 days';
  delete from public.deletion_requests where status <> 'open' and created_at < now() - interval '365 days';
  return n;
end;
$$;
revoke all on function public.cleanup_old_data() from public, anon, authenticated;

-- ===== numbers for the home page =====
create or replace function public.public_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'live_ads', (select count(*) from public.jobs where status = 'live' and expires_at > now()),
    'verified_recruiters', (select count(*) from public.profiles where verified and role = 'recruiter' and not blocked),
    'applications', (select count(*) from public.applications)
  );
$$;
revoke all on function public.public_counts() from public;
grant execute on function public.public_counts() to anon, authenticated;

-- Jobs Abroad migration 0021
-- ---------------------------------------------------------------------
-- 23. SITE SETTINGS THE ADMIN CAN CHANGE (no code change, no new build)
--     WhatsApp number, UPI ID and its name, contact email, complaints person and email, company name, site address.
--     - Public ones (WhatsApp, contact email, complaints person, company name, site address) are readable by everyone.
--     - The UPI ID and its name are readable by logged-in people only (employers need them to pay).
--     - Nobody writes the table directly: only admin_save_settings() does, checks every value and logs old and new value in admin_log.
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key check (key in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url')),
  value      text not null default '' check (char_length(value) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.site_settings enable row level security;

drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings
  for select to anon, authenticated
  using (key in ('whatsapp_number', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url'));
drop policy if exists "settings payee read" on public.site_settings;
create policy "settings payee read" on public.site_settings
  for select to authenticated using (key in ('upi_id', 'upi_name'));
drop policy if exists "settings admin read" on public.site_settings;
create policy "settings admin read" on public.site_settings
  for select using (public.is_admin());
revoke insert, update, delete, truncate on public.site_settings from anon, authenticated;

-- Saves a set of settings. Empty text clears a setting. A 10-digit WhatsApp number gets 91 in front.
create or replace function public.admin_save_settings(p_values jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v text;
  v_old text;
  v_detail text := '';
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if jsonb_typeof(p_values) <> 'object' then raise exception 'Bad settings.' using errcode = '22023'; end if;
  for r in select key, btrim(value) as value from jsonb_each_text(p_values) loop
    v := r.value;
    if r.key not in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url') then
      raise exception 'setting: unknown' using errcode = '22023';
    end if;
    if r.key = 'whatsapp_number' then
      v := regexp_replace(v, '[^0-9]', '', 'g');
      if char_length(v) = 10 then v := '91' || v; end if;
    end if;
    if v <> '' and not (
         (r.key = 'whatsapp_number' and v ~ '^[0-9]{10,15}$')
      or (r.key = 'upi_id' and v ~ '^[A-Za-z0-9._-]{2,50}@[A-Za-z0-9]{2,30}$')
      or (r.key in ('contact_email', 'grievance_email') and v ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(v) <= 120)
      or (r.key in ('upi_name', 'grievance_name', 'company_name') and char_length(v) between 2 and 80)
      or (r.key = 'site_url' and v ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]{2,5})?$')
    ) then
      raise exception 'setting: %', r.key using errcode = '22023';
    end if;
    select value into v_old from public.site_settings where key = r.key;
    if v_old is distinct from v and not (v_old is null and v = '') then
      insert into public.site_settings (key, value, updated_at, updated_by) values (r.key, v, now(), auth.uid())
        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
      v_detail := v_detail || r.key || ': ' || coalesce(v_old, '(empty)') || ' -> ' || coalesce(nullif(v, ''), '(empty)') || '; ';
    end if;
  end loop;
  if v_detail <> '' then
    insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'save_settings', null, left(v_detail, 500));
  end if;
end;
$$;
revoke all on function public.admin_save_settings(jsonb) from public, anon;
grant execute on function public.admin_save_settings(jsonb) to authenticated;

-- Jobs Abroad migration 0022
-- ---------------------------------------------------------------------
-- 24. GUIDES INSIDE THE APP, FOR ADMINS ONLY
--     The guides (admin, employer, job seeker, features) are saved as text in this table.
--     Only an admin can read them (Admin > Guides). Nobody can write them through the website:
--     they are published from the repository with `node scripts/publish-guides.mjs`.
--     (They are kept in the database and not in the website files, because a file in the website can be downloaded by anyone who knows its address.)
-- ---------------------------------------------------------------------
create table if not exists public.guides (
  slug       text primary key check (slug in ('admin-guide', 'employer-guide', 'job-seeker-guide', 'app-features')),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null check (char_length(body) <= 100000),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.guides enable row level security;

drop policy if exists "guides admin read" on public.guides;
create policy "guides admin read" on public.guides for select using (public.is_admin());
revoke insert, update, delete, truncate on public.guides from anon, authenticated;
revoke all on public.guides from anon;

-- 0023: online payments with Razorpay (Phase 2). See docs/08-phase2-payments.md.
-- The browser can never mark an ad paid. Only the two Edge Functions (service role) call the razorpay_* functions below,
-- and "paid" is decided in ONE place: mark_job_paid(), also used by the admin button.

-- ===== Razorpay ids on the payment =====
alter table public.payments add column if not exists razorpay_order_id text;
alter table public.payments add column if not exists razorpay_payment_id text;
create unique index if not exists payments_razorpay_order_unique on public.payments (razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists payments_razorpay_payment_unique on public.payments (razorpay_payment_id) where razorpay_payment_id is not null;

-- ===== every webhook event, so one event is never processed twice; admins can read it to reconcile =====
create table if not exists public.razorpay_events (
  event_id   text primary key,
  event_type text not null,
  outcome    text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.razorpay_events enable row level security;
drop policy if exists "razorpay events admin read" on public.razorpay_events;
create policy "razorpay events admin read" on public.razorpay_events for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.razorpay_events from anon, authenticated;
revoke all on public.razorpay_events from anon;

-- ===== the one place that makes an ad "paid" =====
create or replace function public.mark_job_paid(p_job uuid, p_amount_paise integer, p_method text, p_reference text, p_note text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_payment public.payments;
  v_ref     text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;
  select * into v_payment from public.payments where job_id = v_job.id and status = 'created' order by created_at desc limit 1 for update;
  if found then
    update public.payments set status = 'paid', method = p_method, amount_paise = p_amount_paise, note = coalesce(p_note, ''), reference = v_ref
     where id = v_payment.id returning * into v_payment;
  else
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, reference, list_price_paise, discount_paise, final_price_paise, offer_id, duration_days_final)
    values (v_job.id, v_job.recruiter_id, p_amount_paise, p_method, 'paid', coalesce(p_note, ''), v_ref, v_job.list_price_paise, v_job.discount_paise, v_job.final_price_paise, v_job.offer_id, v_job.duration_days_final)
    returning * into v_payment;
  end if;
  update public.jobs set status = 'paid_pending_review' where id = v_job.id;
  return v_payment;
end;
$$;
revoke all on function public.mark_job_paid(uuid, integer, text, text, text) from public, anon, authenticated;

-- the admin button now goes through mark_job_paid (same rules and same answer as before)
create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '', p_reference text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  v_amount := coalesce(p_amount_paise, v_job.final_price_paise, v_job.price_paise_at_order, (select price_paise from public.packages where id = v_job.package_id), 0);
  v_payment := public.mark_job_paid(p_job, v_amount, 'manual', p_reference, p_note);
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'mark_paid', p_job, v_amount || ' paise');
  return v_payment;
end;
$$;
revoke all on function public.admin_mark_paid(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_mark_paid(uuid, integer, text, text) to authenticated;

-- ===== for the Edge Function "create-razorpay-order" (service role only) =====
-- Checks the caller owns the ad and it waits for payment; the amount is the price SAVED with the order, never one from the browser.
create or replace function public.razorpay_order_info(p_job uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_pay public.payments;
begin
  select * into v_job from public.jobs where id = p_job and recruiter_id = p_user for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then raise exception 'This ad is not waiting for payment.' using errcode = '23514'; end if;
  select * into v_pay from public.payments where job_id = p_job and status = 'created' order by created_at desc limit 1 for update;
  if not found then raise exception 'Choose a plan first.' using errcode = '23514'; end if;
  if coalesce(v_pay.amount_paise, 0) <= 0 then raise exception 'Nothing to pay.' using errcode = '23514'; end if;
  return jsonb_build_object('payment_id', v_pay.id, 'amount_paise', v_pay.amount_paise, 'job_id', v_job.id);
end;
$$;

create or replace function public.razorpay_attach_order(p_payment uuid, p_order_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments set razorpay_order_id = p_order_id where id = p_payment and status = 'created';
  if not found then raise exception 'Payment not found.' using errcode = 'P0002'; end if;
end;
$$;

-- ===== for the Edge Function "razorpay-webhook" (service role only) =====
-- Returns what happened: paid, duplicate, unknown_order, amount_mismatch, not_waiting. Never raises for a bad event, so Razorpay does not retry forever.
create or replace function public.razorpay_capture(p_event_id text, p_order_id text, p_payment_id text, p_amount_paise integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay     public.payments;
  v_job     public.jobs;
  v_outcome text;
begin
  insert into public.razorpay_events (event_id, event_type, outcome) values (p_event_id, 'payment.captured', 'working') on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  select * into v_pay from public.payments where razorpay_order_id = p_order_id for update;
  if not found then
    v_outcome := 'unknown_order';
  elsif v_pay.status <> 'created' then
    v_outcome := case when v_pay.razorpay_payment_id = p_payment_id then 'duplicate' else 'not_waiting' end;
  elsif v_pay.amount_paise is distinct from p_amount_paise then
    v_outcome := 'amount_mismatch';
  else
    select * into v_job from public.jobs where id = v_pay.job_id for update;
    if not found or v_job.status <> 'pending_payment' then
      v_outcome := 'not_waiting';
    else
      perform public.mark_job_paid(v_job.id, p_amount_paise, 'razorpay', p_payment_id, 'Razorpay');
      update public.payments set razorpay_payment_id = p_payment_id where job_id = v_job.id and status = 'paid';
      insert into public.admin_log (admin_id, action, target_id, detail) values (null, 'razorpay_paid', v_job.id, p_amount_paise || ' paise');
      v_outcome := 'paid';
    end if;
  end if;
  update public.razorpay_events set outcome = v_outcome, detail = left(p_order_id || ' ' || p_payment_id, 200) where event_id = p_event_id;
  return v_outcome;
end;
$$;

create or replace function public.razorpay_refund(p_event_id text, p_payment_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay     public.payments;
  v_outcome text;
begin
  insert into public.razorpay_events (event_id, event_type, outcome) values (p_event_id, 'refund.processed', 'working') on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;
  select * into v_pay from public.payments where razorpay_payment_id = p_payment_id for update;
  if not found then
    v_outcome := 'unknown_payment';
  elsif v_pay.status <> 'paid' then
    v_outcome := 'not_paid';
  else
    update public.payments set status = 'refunded' where id = v_pay.id;
    insert into public.admin_log (admin_id, action, target_id, detail) values (null, 'razorpay_refund', v_pay.id, 'refunded in Razorpay');
    v_outcome := 'refunded';
  end if;
  update public.razorpay_events set outcome = v_outcome, detail = left(p_payment_id, 200) where event_id = p_event_id;
  return v_outcome;
end;
$$;

revoke all on function public.razorpay_order_info(uuid, uuid) from public, anon, authenticated;
revoke all on function public.razorpay_attach_order(uuid, text) from public, anon, authenticated;
revoke all on function public.razorpay_capture(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.razorpay_refund(text, text) from public, anon, authenticated;

-- 0024: the admin's own payment QR picture, and payment proof from the employer (UTR number + screenshot) for the admin to check.
-- Nothing here marks an ad paid: the admin still checks the money in the bank / UPI app and uses "Mark paid".

-- ===== two storage buckets =====
-- shop-assets: PUBLIC to read (the QR picture is shown on the payment screen), only admins write. 1 MB, pictures only.
-- payment-proofs: PRIVATE; an employer writes in their own folder, reads their own files; admins read all. 3 MB, pictures and PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-assets', 'shop-assets', true, 1048576, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop-assets admin all" on storage.objects;
create policy "shop-assets admin all" on storage.objects
  for all to authenticated using (bucket_id = 'shop-assets' and public.is_admin()) with check (bucket_id = 'shop-assets' and public.is_admin());

drop policy if exists "payment-proofs read own or admin" on storage.objects;
create policy "payment-proofs read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "payment-proofs upload own folder" on storage.objects;
create policy "payment-proofs upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_blocked());
drop policy if exists "payment-proofs delete own or admin" on storage.objects;
create policy "payment-proofs delete own or admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ===== the QR picture is a site setting: qr_path = a file in shop-assets, readable by logged-in people like the UPI ID =====
alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
  check (key in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url', 'qr_path'));
drop policy if exists "settings payee read" on public.site_settings;
create policy "settings payee read" on public.site_settings
  for select to authenticated using (key in ('upi_id', 'upi_name', 'qr_path'));

create or replace function public.admin_save_settings(p_values jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v text;
  v_old text;
  v_detail text := '';
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if jsonb_typeof(p_values) <> 'object' then raise exception 'Bad settings.' using errcode = '22023'; end if;
  for r in select key, btrim(value) as value from jsonb_each_text(p_values) loop
    v := r.value;
    if r.key not in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url', 'qr_path') then
      raise exception 'setting: unknown' using errcode = '22023';
    end if;
    if r.key = 'whatsapp_number' then
      v := regexp_replace(v, '[^0-9]', '', 'g');
      if char_length(v) = 10 then v := '91' || v; end if;
    end if;
    if v <> '' and not (
         (r.key = 'whatsapp_number' and v ~ '^[0-9]{10,15}$')
      or (r.key = 'upi_id' and v ~ '^[A-Za-z0-9._-]{2,50}@[A-Za-z0-9]{2,30}$')
      or (r.key in ('contact_email', 'grievance_email') and v ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(v) <= 120)
      or (r.key in ('upi_name', 'grievance_name', 'company_name') and char_length(v) between 2 and 80)
      or (r.key = 'site_url' and v ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]{2,5})?$')
      -- the QR picture must be a file that really exists in our own bucket
      or (r.key = 'qr_path' and v ~ '^qr/[0-9a-f-]{36}\.(png|jpg|webp)$'
          and exists (select 1 from storage.objects o where o.bucket_id = 'shop-assets' and o.name = v))
    ) then
      raise exception 'setting: %', r.key using errcode = '22023';
    end if;
    select value into v_old from public.site_settings where key = r.key;
    if v_old is distinct from v and not (v_old is null and v = '') then
      insert into public.site_settings (key, value, updated_at, updated_by) values (r.key, v, now(), auth.uid())
        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
      v_detail := v_detail || r.key || ': ' || coalesce(v_old, '(empty)') || ' -> ' || coalesce(nullif(v, ''), '(empty)') || '; ';
    end if;
  end loop;
  if v_detail <> '' then
    insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'save_settings', null, left(v_detail, 500));
  end if;
end;
$$;
revoke all on function public.admin_save_settings(jsonb) from public, anon;
grant execute on function public.admin_save_settings(jsonb) to authenticated;

-- ===== payment proof: one per ad (sending again replaces it) =====
create table if not exists public.payment_proofs (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null unique references public.jobs (id) on delete cascade,
  recruiter_id  uuid not null references public.profiles (id) on delete cascade,
  reference     text not null check (reference ~ '^[A-Z0-9]{6,30}$'),
  file_path     text not null check (char_length(file_path) between 10 and 200),
  status        text not null default 'submitted' check (status in ('submitted', 'rejected', 'accepted')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- one UTR number can back only one live proof (a rejected one frees it)
create unique index if not exists payment_proofs_reference_unique on public.payment_proofs (reference) where status <> 'rejected';
alter table public.payment_proofs enable row level security;
drop policy if exists "proofs read own or admin" on public.payment_proofs;
create policy "proofs read own or admin" on public.payment_proofs
  for select to authenticated using (recruiter_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.payment_proofs from anon, authenticated;
revoke all on public.payment_proofs from anon;

-- The employer sends the UTR number and the screenshot (already uploaded to their own folder).
create or replace function public.submit_payment_proof(p_job uuid, p_reference text, p_file_path text)
returns public.payment_proofs language plpgsql security definer set search_path = public as $$
declare
  v_job   public.jobs;
  v_ref   text := upper(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9]', '', 'g'));
  v_proof public.payment_proofs;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if public.is_blocked() then raise exception 'This account is blocked.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job and recruiter_id = auth.uid() for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then raise exception 'This ad is not waiting for payment.' using errcode = '23514'; end if;
  if v_ref !~ '^[A-Z0-9]{6,30}$' then raise exception 'proof: reference' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where upper(reference) = v_ref) then raise exception 'proof: reference_used' using errcode = '23505'; end if;
  if (storage.foldername(p_file_path))[1] is distinct from auth.uid()::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'payment-proofs' and o.name = p_file_path) then
    raise exception 'proof: file' using errcode = '22023';
  end if;
  insert into public.payment_proofs (job_id, recruiter_id, reference, file_path)
  values (p_job, auth.uid(), v_ref, p_file_path)
  on conflict (job_id) do update
    set reference = excluded.reference, file_path = excluded.file_path, status = 'submitted', reject_reason = null, updated_at = now()
  returning * into v_proof;
  return v_proof;
end;
$$;
revoke all on function public.submit_payment_proof(uuid, text, text) from public, anon;
grant execute on function public.submit_payment_proof(uuid, text, text) to authenticated;

-- The admin did not find the money: the proof is rejected with a reason the employer reads.
create or replace function public.admin_reject_proof(p_proof uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 1 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select status into v_status from public.payment_proofs where id = p_proof for update;
  if not found then raise exception 'Proof not found.' using errcode = 'P0002'; end if;
  if v_status <> 'submitted' then raise exception 'This proof cannot be rejected now.' using errcode = '23514'; end if;
  update public.payment_proofs set status = 'rejected', reject_reason = left(btrim(p_reason), 300), updated_at = now() where id = p_proof;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'reject_proof', p_proof, left(btrim(p_reason), 300));
end;
$$;
revoke all on function public.admin_reject_proof(uuid, text) from public, anon;
grant execute on function public.admin_reject_proof(uuid, text) to authenticated;

-- Marking an ad paid closes its open proof as accepted.
create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '', p_reference text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  v_amount := coalesce(p_amount_paise, v_job.final_price_paise, v_job.price_paise_at_order, (select price_paise from public.packages where id = v_job.package_id), 0);
  v_payment := public.mark_job_paid(p_job, v_amount, 'manual', p_reference, p_note);
  update public.payment_proofs set status = 'accepted', updated_at = now() where job_id = p_job and status = 'submitted';
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'mark_paid', p_job, v_amount || ' paise');
  return v_payment;
end;
$$;
revoke all on function public.admin_mark_paid(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_mark_paid(uuid, integer, text, text) to authenticated;

-- 0025: online payments with Razorpay are not used (decision of the owner). Removes what migration 0023 added for it.
-- Kept on purpose: mark_job_paid() (the admin's "Mark as paid" still uses it) and the payment method list from migration 0018.
-- Safety: stops if any Razorpay money record exists, so a real payment record is never dropped.
do $$
begin
  if exists (select 1 from public.razorpay_events)
     or exists (select 1 from public.payments where razorpay_order_id is not null or razorpay_payment_id is not null or method = 'razorpay') then
    raise exception 'Razorpay payment records exist: keep them and do not run this migration.';
  end if;
end;
$$;

drop function if exists public.razorpay_order_info(uuid, uuid);
drop function if exists public.razorpay_attach_order(uuid, text);
drop function if exists public.razorpay_capture(text, text, text, integer);
drop function if exists public.razorpay_refund(text, text);
drop table if exists public.razorpay_events;
drop index if exists public.payments_razorpay_order_unique;
drop index if exists public.payments_razorpay_payment_unique;
alter table public.payments drop column if exists razorpay_order_id;
alter table public.payments drop column if exists razorpay_payment_id;

-- 0026: payments are recorded as manual (UPI, checked by the admin), a free offer, or a complimentary ad. No other method exists.
-- Fails (and changes nothing) if any payment row has a different method.
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('manual', 'free_offer', 'complimentary'));

-- Jobs Abroad sample data. Safe to run more than once (adds packages only when there are none).

-- Placeholder packages: change prices in the Admin > Packages screen.
insert into public.packages (name, price_paise, duration_days, featured)
select * from (values
  ('7 Days',             29900::integer,  7, false),
  ('30 Days',            79900::integer, 30, false),
  ('30 Days Featured',  149900::integer, 30, true)
) as seed (name, price_paise, duration_days, featured)
where not exists (select 1 from public.packages);
