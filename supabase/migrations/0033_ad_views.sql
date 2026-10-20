-- 0033: how many times each live ad was opened (a plain number per ad per day, nothing about the visitor) and per-ad numbers for the employer.
create table if not exists public.ad_views (
  job_id uuid not null references public.jobs (id) on delete cascade,
  day    date not null default current_date,
  views  integer not null default 0 check (views >= 0),
  primary key (job_id, day)
);
alter table public.ad_views enable row level security;
drop policy if exists "ad views admin read" on public.ad_views;
create policy "ad views admin read" on public.ad_views for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.ad_views from anon, authenticated;
revoke all on public.ad_views from anon;

-- Anyone can count a view, but only for an ad that is live right now; nothing about the visitor is stored.
create or replace function public.record_ad_view(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.jobs where id = p_job and status = 'live' and expires_at > now()) then
    insert into public.ad_views (job_id, day, views) values (p_job, current_date, 1)
    on conflict (job_id, day) do update set views = public.ad_views.views + 1;
  end if;
end;
$$;
revoke all on function public.record_ad_view(uuid) from public;
grant execute on function public.record_ad_view(uuid) to anon, authenticated;

-- The employer's own numbers: views (all days) and applications (a number only) for each of THEIR ads.
create or replace function public.my_ad_stats()
returns table (job_id uuid, views bigint, applications bigint)
language sql stable security definer set search_path = public as $$
  select j.id,
         coalesce((select sum(v.views) from public.ad_views v where v.job_id = j.id), 0)::bigint,
         (select count(*) from public.applications a where a.job_id = j.id)::bigint
    from public.jobs j
   where j.recruiter_id = auth.uid()
$$;
revoke all on function public.my_ad_stats() from public, anon;
grant execute on function public.my_ad_stats() to authenticated;
