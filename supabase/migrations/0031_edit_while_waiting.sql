-- 0031: an employer can edit an ad while it WAITS FOR APPROVAL (before, only a rejected ad could be edited).
-- Nothing is locked less: the guard trigger still stops them from changing the status, dates, owner, plan, price or verification.
-- Once the admin approves (or rejects) the ad, the policy no longer matches and the change is refused.
drop policy if exists "jobs recruiter update own waiting" on public.jobs;
create policy "jobs recruiter update own waiting" on public.jobs
  for update to authenticated
  using (recruiter_id = (select auth.uid()) and status in ('pending_payment', 'paid_pending_review', 'rejected') and not public.is_blocked())
  with check (recruiter_id = (select auth.uid()));
