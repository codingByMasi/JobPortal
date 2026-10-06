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

-- Jobs Abroad sample data. Safe to run more than once (adds packages only when there are none).

-- Placeholder packages: change prices in the Admin > Packages screen.
insert into public.packages (name, price_paise, duration_days, featured)
select * from (values
  ('7 Days',             29900::integer,  7, false),
  ('30 Days',            79900::integer, 30, false),
  ('30 Days Featured',  149900::integer, 30, true)
) as seed (name, price_paise, duration_days, featured)
where not exists (select 1 from public.packages);
