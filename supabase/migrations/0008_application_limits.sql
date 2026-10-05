-- Jobs Abroad migration 0008
-- ---------------------------------------------------------------------
-- 10. APPLICATION LIMITS (spam and duplicate protection for the no-login Apply form)
-- ---------------------------------------------------------------------

-- One application per ad per phone number. Only the last 10 digits count, so
-- "98765 43210" and "+91 98765-43210" are the same person.
create unique index if not exists applications_one_per_phone
  on public.applications (job_id, (right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)));

-- One ad cannot collect more than 1000 applications (stops someone flooding an employer's list).
-- SECURITY DEFINER: visitors cannot read applications, but this check must still be able to count them.
create or replace function public.applications_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.applications where job_id = new.job_id) >= 1000 then
    raise exception 'This ad cannot take more applications.' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_guard_insert_trg on public.applications;
create trigger applications_guard_insert_trg before insert on public.applications
  for each row execute function public.applications_guard_insert();
