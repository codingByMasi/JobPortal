-- Jobs Abroad migration 0002
-- ---------------------------------------------------------------------
-- 2. PACKAGES (what an employer buys)
-- ---------------------------------------------------------------------

create table if not exists public.packages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  price_paise   integer not null check (price_paise >= 0),   -- 100 paise = Rs 1
  duration_days integer not null check (duration_days between 1 and 365),
  featured      boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
