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

-- Jobs Abroad sample data. Safe to run more than once (adds packages only when there are none).

-- Placeholder packages: change prices in the Admin > Packages screen.
insert into public.packages (name, price_paise, duration_days, featured)
select * from (values
  ('7 Days',             29900::integer,  7, false),
  ('30 Days',            79900::integer, 30, false),
  ('30 Days Featured',  149900::integer, 30, true)
) as seed (name, price_paise, duration_days, featured)
where not exists (select 1 from public.packages);
