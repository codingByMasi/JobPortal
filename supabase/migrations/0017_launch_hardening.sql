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
