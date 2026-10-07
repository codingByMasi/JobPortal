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
