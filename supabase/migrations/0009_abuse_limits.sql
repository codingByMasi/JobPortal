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
