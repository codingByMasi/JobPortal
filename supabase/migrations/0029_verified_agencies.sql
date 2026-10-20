-- 0029: a public list of VERIFIED employers (company name, registration number, number of live ads).
-- Only employers the admin verified (after checking their license) appear. No phone, email or license is ever in this list.
create or replace view public.verified_agencies as
select
  p.company_name,
  nullif(btrim(p.ra_number), '') as ra_number,
  (select count(*) from public.jobs j where j.recruiter_id = p.id and j.status = 'live' and j.expires_at > now())::integer as live_ads
from public.profiles p
where p.verified
  and not p.blocked
  and p.role <> 'admin'
  and char_length(btrim(coalesce(p.company_name, ''))) >= 2
order by live_ads desc, p.company_name
limit 200;

grant select on public.verified_agencies to anon, authenticated;
