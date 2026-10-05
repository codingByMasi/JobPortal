-- Jobs Abroad migration 0004
-- ---------------------------------------------------------------------
-- 4+5. PAYMENTS (only admins write) and APPLICATIONS (candidates apply, no login)
-- ---------------------------------------------------------------------

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs (id) on delete set null,
  recruiter_id uuid not null references public.profiles (id) on delete cascade,
  amount_paise integer not null check (amount_paise >= 0),
  currency     text not null default 'INR',
  method       text not null default 'manual' check (method in ('manual', 'razorpay')),
  status       text not null default 'paid' check (status in ('created', 'paid', 'refunded')),
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists payments_recruiter_idx on public.payments (recruiter_id);

create table if not exists public.applications (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  phone      text not null check (phone ~ '^[0-9+ -]{7,20}$'),
  city       text not null default '' check (char_length(city) <= 80),
  message    text not null default '' check (char_length(message) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists applications_job_idx on public.applications (job_id);
