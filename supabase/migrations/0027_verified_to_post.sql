-- 0027: only a VERIFIED employer (or an admin) can start a new ad. An unverified employer waits until the admin verifies them.
-- Ads that already exist are not touched: the employer can still pay for, edit and renew what they started before.
create or replace function public.jobs_require_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and verified) then
    raise exception 'Your account is not verified yet.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.jobs_require_verified() from public, anon, authenticated;

drop trigger if exists jobs_require_verified on public.jobs;
create trigger jobs_require_verified before insert on public.jobs
  for each row execute function public.jobs_require_verified();
