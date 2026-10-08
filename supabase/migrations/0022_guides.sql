-- Jobs Abroad migration 0022
-- ---------------------------------------------------------------------
-- 24. GUIDES INSIDE THE APP, FOR ADMINS ONLY
--     The guides (admin, employer, job seeker, features) are saved as text in this table.
--     Only an admin can read them (Admin > Guides). Nobody can write them through the website:
--     they are published from the repository with `node scripts/publish-guides.mjs`.
--     (They are kept in the database and not in the website files, because a file in the website can be downloaded by anyone who knows its address.)
-- ---------------------------------------------------------------------
create table if not exists public.guides (
  slug       text primary key check (slug in ('admin-guide', 'employer-guide', 'job-seeker-guide', 'app-features')),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null check (char_length(body) <= 100000),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.guides enable row level security;

drop policy if exists "guides admin read" on public.guides;
create policy "guides admin read" on public.guides for select using (public.is_admin());
revoke insert, update, delete, truncate on public.guides from anon, authenticated;
revoke all on public.guides from anon;
