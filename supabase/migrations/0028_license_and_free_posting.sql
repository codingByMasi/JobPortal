-- 0028: employers are VERIFIED by the admin after sending their license, and a verified employer posts ads with NO payment.
--   1. License: an employer sends the license number and a picture/PDF of the license (private bucket). The admin checks it, then verifies or rejects.
--      The admin cannot verify an employer who has not sent a license.
--   2. Posting: a new ad from a verified employer goes straight to "waiting for approval" (no package, no price, no payment).
--   3. Approval: the admin chooses the days when approving. An ended ad can be extended and goes live again.
-- Ads that were already waiting for payment before this migration are left as they are.

-- ===== private bucket for licenses =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('licenses', 'licenses', false, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "licenses read own or admin" on storage.objects;
create policy "licenses read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'licenses' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "licenses upload own folder" on storage.objects;
create policy "licenses upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'licenses' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_blocked());
drop policy if exists "licenses delete own or admin" on storage.objects;
create policy "licenses delete own or admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'licenses' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ===== verification requests: one per employer =====
create table if not exists public.verification_requests (
  id             uuid primary key default gen_random_uuid(),
  recruiter_id   uuid not null unique references public.profiles (id) on delete cascade,
  license_number text not null check (char_length(license_number) between 3 and 40),
  file_path      text not null check (char_length(file_path) between 10 and 200),
  status         text not null default 'submitted' check (status in ('submitted', 'rejected', 'approved')),
  reject_reason  text check (reject_reason is null or char_length(reject_reason) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.verification_requests enable row level security;
drop policy if exists "verification read own or admin" on public.verification_requests;
create policy "verification read own or admin" on public.verification_requests
  for select to authenticated using (recruiter_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.verification_requests from anon, authenticated;
revoke all on public.verification_requests from anon;

-- The employer sends (or sends again) the license number and the license file, already uploaded to their own folder.
create or replace function public.submit_verification(p_license_number text, p_file_path text)
returns public.verification_requests language plpgsql security definer set search_path = public as $$
declare
  v_number text := btrim(coalesce(p_license_number, ''));
  v_req    public.verification_requests;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if public.is_blocked() then raise exception 'This account is blocked.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and verified) then
    raise exception 'Your company is already verified.' using errcode = '23514';
  end if;
  if char_length(v_number) < 3 or char_length(v_number) > 40 then raise exception 'license: number' using errcode = '22023'; end if;
  if (storage.foldername(p_file_path))[1] is distinct from auth.uid()::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'licenses' and o.name = p_file_path) then
    raise exception 'license: file' using errcode = '22023';
  end if;
  insert into public.verification_requests (recruiter_id, license_number, file_path)
  values (auth.uid(), v_number, p_file_path)
  on conflict (recruiter_id) do update
    set license_number = excluded.license_number, file_path = excluded.file_path, status = 'submitted', reject_reason = null, updated_at = now()
  returning * into v_req;
  return v_req;
end;
$$;
revoke all on function public.submit_verification(text, text) from public, anon;
grant execute on function public.submit_verification(text, text) to authenticated;

-- The admin is not satisfied with the license: the employer reads the reason and can send again.
create or replace function public.admin_reject_verification(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 1 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select status into v_status from public.verification_requests where id = p_request for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if v_status <> 'submitted' then raise exception 'This request cannot be rejected now.' using errcode = '23514'; end if;
  update public.verification_requests set status = 'rejected', reject_reason = left(btrim(p_reason), 300), updated_at = now() where id = p_request;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'reject_verification', p_request, left(btrim(p_reason), 300));
end;
$$;
revoke all on function public.admin_reject_verification(uuid, text) from public, anon;
grant execute on function public.admin_reject_verification(uuid, text) to authenticated;

-- Verifying an employer (the admin's Verify button) needs a license on file; it then closes the request as approved.
create or replace function public.profiles_verified_needs_license()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verified and not old.verified then
    if auth.uid() is not null
       and not exists (select 1 from public.verification_requests where recruiter_id = new.id and status in ('submitted', 'approved')) then
      raise exception 'license: needed' using errcode = 'P0001';
    end if;
    update public.verification_requests set status = 'approved', reject_reason = null, updated_at = now()
     where recruiter_id = new.id and status = 'submitted';
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_verified_needs_license() from public, anon, authenticated;
drop trigger if exists profiles_verified_needs_license on public.profiles;
create trigger profiles_verified_needs_license before update of verified on public.profiles
  for each row execute function public.profiles_verified_needs_license();

-- ===== posting: no package, no price, no payment =====
-- a package is still stored on the ad (the table needs one): the first active plan, so the employer never has to choose
create or replace function public.jobs_default_package()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.package_id is null and auth.uid() is not null and not public.is_admin() then
    new.package_id := (select id from public.packages where active order by sort_order, created_at limit 1);
  end if;
  return new;
end;
$$;
revoke all on function public.jobs_default_package() from public, anon, authenticated;
drop trigger if exists jobs_default_package on public.jobs;
create trigger jobs_default_package before insert on public.jobs
  for each row execute function public.jobs_default_package();

-- runs after jobs_guard_insert (triggers run in name order): a verified employer's new ad waits for approval, at no price
create or replace function public.jobs_submit_for_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.jobs where recruiter_id = auth.uid() and status = 'paid_pending_review') >= 20 then
    raise exception 'Too many ads waiting for approval.' using errcode = '53400';
  end if;
  new.status              := 'paid_pending_review';
  new.price_paise_at_order := 0;
  new.list_price_paise     := 0;
  new.discount_paise       := 0;
  new.final_price_paise    := 0;
  new.days_at_order        := 30; -- the admin chooses the real number of days when approving
  new.duration_days_final  := 30;
  return new;
end;
$$;
revoke all on function public.jobs_submit_for_review() from public, anon, authenticated;
drop trigger if exists jobs_submit_for_review on public.jobs;
create trigger jobs_submit_for_review before insert on public.jobs
  for each row execute function public.jobs_submit_for_review();

-- the stored status is decided by the triggers (never by the employer), so the policies accept both of the two possible results.
-- An employer may also withdraw (delete) an ad that is still waiting for approval: nothing was paid.
drop policy if exists "jobs recruiter insert" on public.jobs;
create policy "jobs recruiter insert" on public.jobs
  for insert to authenticated
  with check (recruiter_id = (select auth.uid()) and status in ('pending_payment', 'paid_pending_review') and not public.is_blocked());
drop policy if exists "jobs recruiter delete own" on public.jobs;
create policy "jobs recruiter delete own" on public.jobs
  for delete to authenticated
  using (recruiter_id = (select auth.uid())
         and (status in ('draft', 'pending_payment', 'paid_pending_review', 'rejected', 'expired')
              or (status = 'live' and expires_at <= now())));

-- ===== approving: the admin chooses the days (empty = the ad's saved days, or 30) =====
drop function if exists public.admin_approve_job(uuid);
create or replace function public.admin_approve_job(p_job uuid, p_days integer default null)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  v_job  public.jobs;
  v_days integer;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if p_days is not null and (p_days < 1 or p_days > 365) then raise exception 'Days must be between 1 and 365.' using errcode = '23514'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status not in ('paid_pending_review', 'rejected') then
    raise exception 'This ad cannot be approved now.' using errcode = '23514';
  end if;
  v_days := coalesce(p_days, nullif(v_job.duration_days_final, 0), nullif(v_job.days_at_order, 0), (select duration_days from public.packages where id = v_job.package_id), 30);
  update public.jobs
     set status = 'live', starts_at = now(), expires_at = now() + make_interval(days => v_days), reject_reason = null
   where id = p_job
   returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'approve_job', p_job, v_days || ' days');
  return v_job;
end;
$$;
revoke all on function public.admin_approve_job(uuid, integer) from public, anon;
grant execute on function public.admin_approve_job(uuid, integer) to authenticated;

-- ===== extending: a live, hidden or ENDED ad gets more days; an ended ad goes live again =====
create or replace function public.admin_extend_job(p_job uuid, p_days integer, p_reason text)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Days must be between 1 and 365.' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status not in ('live', 'hidden', 'expired') or v_job.expires_at is null then
    raise exception 'Only a live, hidden or ended ad can get more days.' using errcode = '23514';
  end if;
  update public.jobs
     set expires_at = greatest(expires_at, now()) + make_interval(days => p_days),
         status = case when status = 'expired' then 'live' else status end
   where id = p_job returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'extend_job', p_job, '+' || p_days || ' days: ' || left(btrim(p_reason), 200));
  return v_job;
end;
$$;
