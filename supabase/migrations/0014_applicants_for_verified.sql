-- Jobs Abroad migration 0014
-- ---------------------------------------------------------------------
-- 16. APPLICANT DETAILS ONLY FOR VERIFIED EMPLOYERS
--     Names and phone numbers of job seekers are shown to an employer only after the admin has verified that company.
--     Until then the employer sees how many people applied. (Stops a fake "recruiter" collecting phone numbers with a cheap ad.)
--     To turn this rule off, run:  insert into public.app_settings (key, value) values ('applicants_need_verified', 'false')
--                                    on conflict (key) do update set value = excluded.value;
-- ---------------------------------------------------------------------

create or replace function public.employer_may_see_applicants()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = 'applicants_need_verified'), 'true') = 'false'
      or coalesce((select verified from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.employer_may_see_applicants() from public, anon;
grant execute on function public.employer_may_see_applicants() to authenticated;

drop policy if exists "applications recruiter read own" on public.applications;
create policy "applications recruiter read own" on public.applications
  for select to authenticated
  using (public.employer_may_see_applicants()
         and exists (select 1 from public.jobs j where j.id = job_id and j.recruiter_id = auth.uid()));

-- How many people applied to my ads (a number only, no names), so an unverified employer knows something is waiting.
create or replace function public.count_my_applications()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.applications a
   where exists (select 1 from public.jobs j where j.id = a.job_id and j.recruiter_id = auth.uid());
$$;
revoke all on function public.count_my_applications() from public, anon;
grant execute on function public.count_my_applications() to authenticated;
