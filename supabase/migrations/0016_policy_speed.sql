-- Jobs Abroad migration 0016
-- ---------------------------------------------------------------------
-- 18. FASTER SECURITY RULES (from Supabase's performance checker)
--     Same rules as before. "auth.uid()" is now written "(select auth.uid())", so the database works out who is asking ONCE
--     per request instead of once per row. This matters when the tables get big. Nothing changes for any user.
-- ---------------------------------------------------------------------

-- profiles
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- jobs
drop policy if exists "jobs recruiter read own" on public.jobs;
create policy "jobs recruiter read own" on public.jobs
  for select to authenticated using (recruiter_id = (select auth.uid()));

drop policy if exists "jobs recruiter insert" on public.jobs;
create policy "jobs recruiter insert" on public.jobs
  for insert to authenticated
  with check (recruiter_id = (select auth.uid()) and status = 'pending_payment' and not public.is_blocked());

drop policy if exists "jobs recruiter update own waiting" on public.jobs;
create policy "jobs recruiter update own waiting" on public.jobs
  for update to authenticated
  using (recruiter_id = (select auth.uid()) and status in ('pending_payment', 'rejected') and not public.is_blocked())
  with check (recruiter_id = (select auth.uid()));

drop policy if exists "jobs recruiter delete own" on public.jobs;
create policy "jobs recruiter delete own" on public.jobs
  for delete to authenticated
  using (recruiter_id = (select auth.uid())
         and (status in ('draft', 'pending_payment', 'rejected', 'expired')
              or (status = 'live' and expires_at <= now())));

-- payments
drop policy if exists "payments read own" on public.payments;
create policy "payments read own" on public.payments
  for select to authenticated using (recruiter_id = (select auth.uid()));

-- applications
drop policy if exists "applications recruiter read own" on public.applications;
create policy "applications recruiter read own" on public.applications
  for select to authenticated
  using (public.employer_may_see_applicants()
         and exists (select 1 from public.jobs j where j.id = job_id and j.recruiter_id = (select auth.uid())));

-- change requests
drop policy if exists "change requests read own" on public.change_requests;
create policy "change requests read own" on public.change_requests
  for select to authenticated using (recruiter_id = (select auth.uid()));

drop policy if exists "change requests insert own" on public.change_requests;
create policy "change requests insert own" on public.change_requests
  for insert to authenticated
  with check (
    recruiter_id = (select auth.uid())
    and not public.is_blocked()
    and exists (select 1 from public.jobs j
                 where j.id = job_id and j.recruiter_id = (select auth.uid()) and j.status <> 'pending_payment')
  );

-- file storage rules are NOT changed here on purpose: a version with "(select auth.uid())" inside the upload rule failed
-- ("infinite recursion in policy") in the tests, so the three storage rules in migrations 0007 and 0009 stay as they are.
