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
