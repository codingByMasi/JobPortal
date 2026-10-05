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
