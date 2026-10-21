-- 0036: optional "are you a person" check (Cloudflare Turnstile) on the Apply and Report forms.
-- It is OFF until the owner switches it on (setting require_human = 'on'). When it is on, a form row is accepted only with a one-time pass
-- that the Edge Function verify-human hands out after Cloudflare confirmed the visitor. Direct inserts without a pass are refused by the database itself.
create table if not exists public.human_passes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
create index if not exists human_passes_created_idx on public.human_passes (created_at);
alter table public.human_passes enable row level security;
revoke all on public.human_passes from anon, authenticated;

insert into public.app_settings (key, value) values ('require_human', 'off') on conflict (key) do nothing;

-- the pass travels in the row and is never stored
alter table public.applications add column if not exists human_pass uuid;
alter table public.reports add column if not exists human_pass uuid;

-- Does nothing while the setting is off. When it is on: the pass must exist, be younger than 10 minutes and unused; it is used up here.
create or replace function public.human_check(p_pass uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_used uuid;
begin
  if coalesce((select value from public.app_settings where key = 'require_human'), 'off') <> 'on' then
    return;
  end if;
  if p_pass is not null then
    update public.human_passes set used_at = now()
     where id = p_pass and used_at is null and created_at > now() - interval '10 minutes'
     returning id into v_used;
  end if;
  if v_used is null then
    raise exception 'Please finish the human check and try again.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.human_check(uuid) from public, anon, authenticated;

-- The two form guards, as before (migrations 0012 and 0020), with the pass check first.
create or replace function public.applications_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  perform public.human_check(new.human_pass);
  new.human_pass := null;
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

create or replace function public.reports_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  perform public.human_check(new.human_pass);
  new.human_pass := null;
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

-- daily clean-up of passes older than a day
create or replace function public.purge_human_passes()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.human_passes where created_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_human_passes() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-human-passes', '58 3 * * *', 'select public.purge_human_passes()');
exception when others then
  raise notice 'pg_cron is not available here: run select public.purge_human_passes(); now and then by hand (docs/22-spam-protection.md).';
end;
$$;
