-- Jobs Abroad migration 0013
-- ---------------------------------------------------------------------
-- 15. ADMIN TWO-STEP LOGIN (authenticator app)
--     An admin who has turned on the authenticator app must have used it in the current login, otherwise the database
--     treats them like a normal employer. An admin who has NOT turned it on yet keeps working (so you cannot lock yourself out
--     while setting it up). Turn it on under Admin > Security.
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_needs_code boolean := false;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    return false;
  end if;
  begin
    select exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') into v_needs_code;
    if v_needs_code and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      return false;
    end if;
  exception when others then
    -- if the login system's tables cannot be read, behave as before (never lock everyone out by accident)
    null;
  end;
  return true;
end;
$$;
