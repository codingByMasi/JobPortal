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
