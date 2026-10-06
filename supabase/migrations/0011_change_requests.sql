-- Jobs Abroad migration 0011
-- ---------------------------------------------------------------------
-- 13. CHANGE REQUESTS: an employer cannot edit an ad after payment, but can ask us to change it
-- ---------------------------------------------------------------------

create table if not exists public.change_requests (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  recruiter_id uuid not null references public.profiles (id) on delete cascade,
  message      text not null check (char_length(btrim(message)) between 3 and 300),
  status       text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at   timestamptz not null default now(),
  handled_at   timestamptz
);
create index if not exists change_requests_job_idx on public.change_requests (job_id, status);
create index if not exists change_requests_recruiter_idx on public.change_requests (recruiter_id);
create index if not exists change_requests_status_idx on public.change_requests (status, created_at);

alter table public.change_requests enable row level security;

-- Employers: read their own, and add a request for THEIR OWN ad once it is past "waiting for payment"
-- (while it waits for payment they can simply edit it). They can never change or delete a request.
drop policy if exists "change requests read own" on public.change_requests;
create policy "change requests read own" on public.change_requests
  for select to authenticated using (recruiter_id = auth.uid());

drop policy if exists "change requests insert own" on public.change_requests;
create policy "change requests insert own" on public.change_requests
  for insert to authenticated
  with check (
    recruiter_id = auth.uid()
    and not public.is_blocked()
    and exists (select 1 from public.jobs j
                 where j.id = job_id and j.recruiter_id = auth.uid() and j.status <> 'pending_payment')
  );

drop policy if exists "change requests admin all" on public.change_requests;
create policy "change requests admin all" on public.change_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- On INSERT by an employer: force safe values and allow at most 3 open requests per ad.
create or replace function public.change_requests_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.change_requests where job_id = new.job_id and status = 'open') >= 3 then
    raise exception 'Too many open requests for this ad.' using errcode = '53300';
  end if;
  new.recruiter_id := auth.uid();
  new.status       := 'open';
  new.handled_at   := null;
  new.message      := btrim(new.message);
  return new;
end;
$$;

drop trigger if exists change_requests_guard_insert_trg on public.change_requests;
create trigger change_requests_guard_insert_trg before insert on public.change_requests
  for each row execute function public.change_requests_guard_insert();

-- On UPDATE (admins only, by the policy above): stamp the time the request was handled.
create or replace function public.change_requests_stamp()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.handled_at := case when new.status = 'open' then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists change_requests_stamp_trg on public.change_requests;
create trigger change_requests_stamp_trg before update on public.change_requests
  for each row execute function public.change_requests_stamp();
