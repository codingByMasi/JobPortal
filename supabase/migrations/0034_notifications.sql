-- 0034: messages to employers (email): a queue the database fills, and functions the sender (an Edge Function) uses.
-- Events: license verified, license rejected, ad approved, ad rejected, days added, ad ending soon (3 days), ad ended.
-- The database only QUEUES. Nothing is sent until the sender function is deployed with an email key (docs/20-notifications.md).
-- An employer can turn the emails off in "My details" (profiles.email_notifications); blocked employers get none.

alter table public.profiles add column if not exists email_notifications boolean not null default true;
alter table public.jobs add column if not exists ending_reminder_at timestamptz; -- set when the "ends soon" message was queued; cleared when days are added

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('license_verified', 'license_rejected', 'ad_approved', 'ad_rejected', 'ad_extended', 'ad_ending_soon', 'ad_ended')),
  data         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  attempts     integer not null default 0,
  last_error   text
);
create index if not exists notifications_due_idx on public.notifications (created_at) where sent_at is null;
alter table public.notifications enable row level security;
drop policy if exists "notifications admin read" on public.notifications;
create policy "notifications admin read" on public.notifications for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.notifications from anon, authenticated;
revoke all on public.notifications from anon;

-- put one message in the queue (internal; called by the functions below)
create or replace function public.queue_notification(p_recipient uuid, p_kind text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (recipient_id, kind, data)
  select p.id, p_kind, coalesce(p_data, '{}') from public.profiles p where p.id = p_recipient and not p.blocked;
$$;
revoke all on function public.queue_notification(uuid, text, jsonb) from public, anon, authenticated;

-- ===== the events =====
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
     set status = 'live', starts_at = now(), expires_at = now() + make_interval(days => v_days), reject_reason = null, ending_reminder_at = null
   where id = p_job
   returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'approve_job', p_job, v_days || ' days');
  perform public.queue_notification(v_job.recruiter_id, 'ad_approved', jsonb_build_object('job_id', v_job.id, 'title', v_job.title, 'days', v_days, 'ends', v_job.expires_at));
  return v_job;
end;
$$;
revoke all on function public.admin_approve_job(uuid, integer) from public, anon;
grant execute on function public.admin_approve_job(uuid, integer) to authenticated;

create or replace function public.admin_reject_job(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_owner  uuid;
  v_title  text;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 1 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select status, recruiter_id, title into v_status, v_owner, v_title from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_status <> 'paid_pending_review' then raise exception 'This ad cannot be rejected now.' using errcode = '23514'; end if;
  update public.jobs set status = 'rejected', reject_reason = left(btrim(p_reason), 300) where id = p_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'reject_job', p_job, left(btrim(p_reason), 300));
  perform public.queue_notification(v_owner, 'ad_rejected', jsonb_build_object('job_id', p_job, 'title', v_title, 'reason', left(btrim(p_reason), 300)));
end;
$$;
revoke all on function public.admin_reject_job(uuid, text) from public, anon;
grant execute on function public.admin_reject_job(uuid, text) to authenticated;

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
         status = case when status = 'expired' then 'live' else status end,
         ending_reminder_at = null
   where id = p_job returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'extend_job', p_job, '+' || p_days || ' days: ' || left(btrim(p_reason), 200));
  perform public.queue_notification(v_job.recruiter_id, 'ad_extended', jsonb_build_object('job_id', v_job.id, 'title', v_job.title, 'days', p_days, 'ends', v_job.expires_at));
  return v_job;
end;
$$;

create or replace function public.admin_reject_verification(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_owner  uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 1 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select status, recruiter_id into v_status, v_owner from public.verification_requests where id = p_request for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if v_status <> 'submitted' then raise exception 'This request cannot be rejected now.' using errcode = '23514'; end if;
  update public.verification_requests set status = 'rejected', reject_reason = left(btrim(p_reason), 300), updated_at = now() where id = p_request;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'reject_verification', p_request, left(btrim(p_reason), 300));
  perform public.queue_notification(v_owner, 'license_rejected', jsonb_build_object('reason', left(btrim(p_reason), 300)));
end;
$$;
revoke all on function public.admin_reject_verification(uuid, text) from public, anon;
grant execute on function public.admin_reject_verification(uuid, text) to authenticated;

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
    perform public.queue_notification(new.id, 'license_verified', '{}');
  end if;
  return new;
end;
$$;

-- ads that end: one message each (the job runs every 10 minutes)
create or replace function public.expire_jobs()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    with ended as (
      update public.jobs set status = 'expired' where status = 'live' and expires_at <= now() returning id, recruiter_id, title
    )
    select * from ended
  loop
    perform public.queue_notification(r.recruiter_id, 'ad_ended', jsonb_build_object('job_id', r.id, 'title', r.title));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.expire_jobs() from public, anon, authenticated;

-- ads that end within 3 days: one message each, once (cleared when days are added)
create or replace function public.queue_ending_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    with soon as (
      update public.jobs set ending_reminder_at = now()
       where status = 'live' and expires_at > now() and expires_at <= now() + interval '3 days' and ending_reminder_at is null
       returning id, recruiter_id, title, expires_at
    )
    select * from soon
  loop
    perform public.queue_notification(r.recruiter_id, 'ad_ending_soon', jsonb_build_object('job_id', r.id, 'title', r.title, 'ends', r.expires_at));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.queue_ending_reminders() from public, anon, authenticated;

-- ===== for the sender (Edge Function, service role only) =====
-- Takes up to p_limit messages that are due: not sent, fewer than 5 tries, the employer wants emails, is not blocked and has an email address.
create or replace function public.claim_notifications(p_limit integer default 50)
returns table (id uuid, kind text, data jsonb, email text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select n.id
      from public.notifications n
      join public.profiles p on p.id = n.recipient_id
     where n.sent_at is null and n.attempts < 5 and p.email_notifications and not p.blocked and coalesce(p.email, '') like '%@%'
     order by n.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 100))
     for update of n skip locked
  )
  update public.notifications n set attempts = n.attempts + 1
    from due
   where n.id = due.id
  returning n.id, n.kind, n.data, (select p2.email from public.profiles p2 where p2.id = n.recipient_id);
end;
$$;
create or replace function public.mark_notification_sent(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications set sent_at = now(), last_error = null where id = p_id;
$$;
create or replace function public.mark_notification_failed(p_id uuid, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.notifications set last_error = left(coalesce(p_error, ''), 300) where id = p_id;
$$;
create or replace function public.purge_old_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.notifications where created_at < now() - interval '60 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_sent(uuid) from public, anon, authenticated;
revoke all on function public.mark_notification_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.purge_old_notifications() from public, anon, authenticated;

-- daily: queue the "ends soon" messages and drop old ones (when pg_cron is available; otherwise run these by hand, docs/20-notifications.md)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('queue-ending-reminders', '45 3 * * *', 'select public.queue_ending_reminders()');
  perform cron.schedule('purge-old-notifications', '50 3 * * *', 'select public.purge_old_notifications()');
exception when others then
  raise notice 'pg_cron is not available here: schedule queue_ending_reminders() and purge_old_notifications() by hand (docs/20-notifications.md).';
end;
$$;
