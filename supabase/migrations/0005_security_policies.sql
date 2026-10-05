-- Jobs Abroad migration 0005
-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY: who can see and change what, on every table
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.packages     enable row level security;
alter table public.jobs         enable row level security;
alter table public.payments     enable row level security;
alter table public.applications enable row level security;

-- profiles: you see and edit yourself; admins see and edit everyone.
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles admin all" on public.profiles;
create policy "profiles admin all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- packages: everyone can read (prices are public); only admins change them.
drop policy if exists "packages read all" on public.packages;
create policy "packages read all" on public.packages for select using (true);
drop policy if exists "packages admin all" on public.packages;
create policy "packages admin all" on public.packages
  for all using (public.is_admin()) with check (public.is_admin());

-- jobs
drop policy if exists "jobs public read live" on public.jobs;
create policy "jobs public read live" on public.jobs
  for select using (status = 'live' and expires_at > now());

drop policy if exists "jobs recruiter read own" on public.jobs;
create policy "jobs recruiter read own" on public.jobs
  for select to authenticated using (recruiter_id = auth.uid());

drop policy if exists "jobs recruiter insert" on public.jobs;
create policy "jobs recruiter insert" on public.jobs
  for insert to authenticated
  with check (recruiter_id = auth.uid() and status = 'pending_payment' and not public.is_blocked());

drop policy if exists "jobs recruiter update own waiting" on public.jobs;
create policy "jobs recruiter update own waiting" on public.jobs
  for update to authenticated
  using (recruiter_id = auth.uid() and status = 'pending_payment' and not public.is_blocked())
  with check (recruiter_id = auth.uid());

drop policy if exists "jobs recruiter delete own" on public.jobs;
create policy "jobs recruiter delete own" on public.jobs
  for delete to authenticated using (recruiter_id = auth.uid());

drop policy if exists "jobs admin all" on public.jobs;
create policy "jobs admin all" on public.jobs
  for all using (public.is_admin()) with check (public.is_admin());

-- payments: recruiters only READ their own. Nobody but admins writes.
drop policy if exists "payments read own" on public.payments;
create policy "payments read own" on public.payments
  for select to authenticated using (recruiter_id = auth.uid());
drop policy if exists "payments admin all" on public.payments;
create policy "payments admin all" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- applications: anyone can apply to a live ad; recruiters read applications for their own ads.
drop policy if exists "applications anyone insert" on public.applications;
create policy "applications anyone insert" on public.applications
  for insert to anon, authenticated
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.status = 'live' and j.expires_at > now()));

drop policy if exists "applications recruiter read own" on public.applications;
create policy "applications recruiter read own" on public.applications
  for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.recruiter_id = auth.uid()));

drop policy if exists "applications admin all" on public.applications;
create policy "applications admin all" on public.applications
  for all using (public.is_admin()) with check (public.is_admin());
