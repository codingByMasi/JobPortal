-- Jobs Abroad migration 0015
-- ---------------------------------------------------------------------
-- 17. FIXES FROM SUPABASE'S OWN SECURITY CHECKER (Database > Advisors)
--     - Trigger functions are not meant to be called from outside: take away the right to call them
--       (a trigger still fires; the right is only checked when the trigger is created).
--     - Two functions did not pin their search path.
--     The checker still lists is_admin(), is_blocked() and the other helper functions: that is expected, the security rules
--     themselves call them for every visitor and employer, and each one only answers about the caller.
-- ---------------------------------------------------------------------

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_profile_update() from public, anon, authenticated;
revoke all on function public.profiles_block_hides_ads() from public, anon, authenticated;
revoke all on function public.jobs_guard_insert() from public, anon, authenticated;
revoke all on function public.jobs_guard_update() from public, anon, authenticated;
revoke all on function public.applications_guard_insert() from public, anon, authenticated;
revoke all on function public.change_requests_guard_insert() from public, anon, authenticated;
revoke all on function public.change_requests_stamp() from public, anon, authenticated;
revoke all on function public.jobs_normalize_whatsapp() from public, anon, authenticated;

create or replace function public.change_requests_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.handled_at := case when new.status = 'open' then null else now() end;
  end if;
  return new;
end;
$$;

create or replace function public.jobs_normalize_whatsapp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.whatsapp := regexp_replace(coalesce(new.whatsapp, ''), '[^0-9]', '', 'g');
  if new.whatsapp ~ '^[6-9][0-9]{9}$' then
    new.whatsapp := '91' || new.whatsapp;
  end if;
  return new;
end;
$$;

-- create or replace keeps the earlier rights, so take them away again for the two re-made functions
revoke all on function public.change_requests_stamp() from public, anon, authenticated;
revoke all on function public.jobs_normalize_whatsapp() from public, anon, authenticated;
