-- 0035: job alerts. A visitor leaves an email (and optionally a country and a kind of work); after confirming the email
-- they get one short email a day with the new ads that match. Nothing else about the visitor is stored.
-- Visitors can only call the three functions below; the tables and the sender functions are closed to them.
create table if not exists public.job_alerts (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (char_length(email) between 5 and 120 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  country         text check (country is null or country in ('uae', 'saudi', 'qatar', 'kuwait', 'oman', 'others')),
  category        text check (category is null or category in ('plumber', 'electrician', 'driver', 'technician', 'cook', 'helper', 'office', 'other')),
  lang            text not null default 'en' check (lang in ('en', 'hi')),
  token           uuid not null unique default gen_random_uuid(),   -- the secret in the confirm and unsubscribe links
  confirmed_at    timestamptz,
  last_checked_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create unique index if not exists job_alerts_unique on public.job_alerts (email, coalesce(country, ''), coalesce(category, ''));
create index if not exists job_alerts_created_idx on public.job_alerts (created_at);

create table if not exists public.alert_outbox (
  id         uuid primary key default gen_random_uuid(),
  alert_id   uuid not null references public.job_alerts (id) on delete cascade,
  kind       text not null check (kind in ('confirm', 'digest')),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  last_error text
);
create index if not exists alert_outbox_due_idx on public.alert_outbox (created_at) where sent_at is null;

alter table public.job_alerts enable row level security;
alter table public.alert_outbox enable row level security;
revoke all on public.job_alerts from anon, authenticated;
revoke all on public.alert_outbox from anon, authenticated;

-- ===== what a visitor can do =====
-- Leave an email for alerts. Always looks the same from outside (an existing alert is not revealed); at most 5 alerts per email and 300 new alerts per hour.
create or replace function public.subscribe_job_alert(p_email text, p_country text default null, p_category text default null, p_lang text default 'en')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_country  text := nullif(btrim(coalesce(p_country, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_lang     text := case when p_lang = 'hi' then 'hi' else 'en' end;
  v_alert    public.job_alerts;
begin
  if char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please write a correct email address.' using errcode = '22023';
  end if;
  if v_country is not null and v_country not in ('uae', 'saudi', 'qatar', 'kuwait', 'oman', 'others') then
    raise exception 'Please choose a country from the list.' using errcode = '22023';
  end if;
  if v_category is not null and v_category not in ('plumber', 'electrician', 'driver', 'technician', 'cook', 'helper', 'office', 'other') then
    raise exception 'Please choose a kind of work from the list.' using errcode = '22023';
  end if;
  if (select count(*) from public.job_alerts where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many requests right now. Please try again later.' using errcode = '54000';
  end if;

  select * into v_alert from public.job_alerts
   where email = v_email and coalesce(country, '') = coalesce(v_country, '') and coalesce(category, '') = coalesce(v_category, '');
  if found then
    -- same alert again: if it is still waiting for confirmation, send the confirm mail once an hour at most
    if v_alert.confirmed_at is null and not exists (
      select 1 from public.alert_outbox where alert_id = v_alert.id and kind = 'confirm' and created_at > now() - interval '1 hour') then
      insert into public.alert_outbox (alert_id, kind) values (v_alert.id, 'confirm');
    end if;
    return;
  end if;
  if (select count(*) from public.job_alerts where email = v_email) >= 5 then
    raise exception 'This email already has 5 alerts.' using errcode = '54000';
  end if;
  insert into public.job_alerts (email, country, category, lang) values (v_email, v_country, v_category, v_lang) returning * into v_alert;
  insert into public.alert_outbox (alert_id, kind) values (v_alert.id, 'confirm');
end;
$$;

-- The link in the confirm mail. True when the alert exists (and is now confirmed). Only ads that start after this moment are sent.
create or replace function public.confirm_job_alert(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.job_alerts set confirmed_at = now(), last_checked_at = now()
   where token = p_token and confirmed_at is null returning id into v_id;
  if v_id is not null then return true; end if;
  return exists (select 1 from public.job_alerts where token = p_token);
end;
$$;

-- The link at the bottom of every mail: removes every alert of that email address. True when something was removed.
create or replace function public.unsubscribe_job_alert(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text; n integer;
begin
  select email into v_email from public.job_alerts where token = p_token;
  if v_email is null then return false; end if;
  delete from public.job_alerts where email = v_email;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.subscribe_job_alert(text, text, text, text) from public;
revoke all on function public.confirm_job_alert(uuid) from public;
revoke all on function public.unsubscribe_job_alert(uuid) from public;
grant execute on function public.subscribe_job_alert(text, text, text, text) to anon, authenticated;
grant execute on function public.confirm_job_alert(uuid) to anon, authenticated;
grant execute on function public.unsubscribe_job_alert(uuid) to anon, authenticated;

-- ===== daily work and the sender (nobody but the server) =====
-- For every confirmed alert: the live ads that started since it was last checked and match it become one digest message (up to 8 ads listed).
create or replace function public.queue_alert_digests()
returns integer language plpgsql security definer set search_path = public as $$
declare
  a       record;
  v_now   timestamptz := now();
  v_total integer;
  v_jobs  jsonb;
  n       integer := 0;
begin
  for a in select * from public.job_alerts where confirmed_at is not null loop
    select count(*)::integer,
           coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'company', x.company, 'city', x.city, 'country', x.country) order by x.starts_at desc) filter (where x.rn <= 8), '[]'::jsonb)
      into v_total, v_jobs
      from (
        select j.id, j.title, j.company, j.city, j.country, j.starts_at, row_number() over (order by j.starts_at desc) as rn
          from public.jobs j
         where j.status = 'live' and j.expires_at > v_now and j.starts_at > a.last_checked_at and j.starts_at <= v_now
           and (a.country is null or j.country = a.country) and (a.category is null or j.category = a.category)
      ) x;
    if v_total > 0 then
      insert into public.alert_outbox (alert_id, kind, data) values (a.id, 'digest', jsonb_build_object('total', v_total, 'jobs', v_jobs));
      n := n + 1;
    end if;
    update public.job_alerts set last_checked_at = v_now where id = a.id;
  end loop;
  return n;
end;
$$;

-- Takes up to p_limit due messages (not sent, fewer than 5 tries): confirm mails for unconfirmed alerts, digests for confirmed ones.
create or replace function public.claim_alert_mail(p_limit integer default 50)
returns table (id uuid, kind text, data jsonb, email text, token uuid, lang text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select o.id
      from public.alert_outbox o
      join public.job_alerts a on a.id = o.alert_id
     where o.sent_at is null and o.attempts < 5
       and ((o.kind = 'confirm' and a.confirmed_at is null) or (o.kind = 'digest' and a.confirmed_at is not null))
     order by o.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 100))
     for update of o skip locked
  )
  update public.alert_outbox o set attempts = o.attempts + 1
    from due, public.job_alerts a
   where o.id = due.id and a.id = o.alert_id
  returning o.id, o.kind, o.data, a.email, a.token, a.lang;
end;
$$;
create or replace function public.mark_alert_mail_sent(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.alert_outbox set sent_at = now(), last_error = null where id = p_id;
$$;
create or replace function public.mark_alert_mail_failed(p_id uuid, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.alert_outbox set last_error = left(coalesce(p_error, ''), 300) where id = p_id;
$$;
-- Housekeeping: alerts nobody confirmed within 7 days, and sent or give-up messages older than 30 days.
create or replace function public.purge_job_alerts()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer; m integer;
begin
  delete from public.job_alerts where confirmed_at is null and created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  delete from public.alert_outbox where created_at < now() - interval '30 days';
  get diagnostics m = row_count;
  return n + m;
end;
$$;
revoke all on function public.queue_alert_digests() from public, anon, authenticated;
revoke all on function public.claim_alert_mail(integer) from public, anon, authenticated;
revoke all on function public.mark_alert_mail_sent(uuid) from public, anon, authenticated;
revoke all on function public.mark_alert_mail_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.purge_job_alerts() from public, anon, authenticated;

-- daily at 04:00 UTC (9:30 in the morning in India) and a clean-up (when pg_cron is available; otherwise run these by hand, docs/21-job-alerts.md)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('queue-alert-digests', '0 4 * * *', 'select public.queue_alert_digests()');
  perform cron.schedule('purge-job-alerts', '55 3 * * *', 'select public.purge_job_alerts()');
exception when others then
  raise notice 'pg_cron is not available here: schedule queue_alert_digests() and purge_job_alerts() by hand (docs/21-job-alerts.md).';
end;
$$;
