-- =====================================================================
-- Jobs Abroad - SAMPLE ADS for trying the public site on a real Supabase project.
-- NOT part of schema.sql. Run it only on a test project.
--
-- How to use:
--   1. Sign up once on your site, then make yourself admin (docs/06-deploy.md, step C).
--   2. Put your email in the LAST line of the block below ('you@example.com') AND in the first line of the update at the end.
--   3. Supabase > SQL Editor > paste this file > Run.
--
-- It creates 6 ads under your account and marks your account "verified":
--   3 live ads (the first one in a Featured package)   -> should show on the website, featured first
--   1 ad that ENDED yesterday but still says "live"    -> must NOT show (the website hides ended ads by itself)
--   1 hidden ad                                        -> must NOT show
--   1 ad waiting for payment                           -> must NOT show
-- All titles start with SAMPLE so you can delete them (last lines of this file).
-- =====================================================================

insert into public.jobs (recruiter_id, package_id, title, company, country, city, category, file_type, whatsapp, status, starts_at, expires_at)
select
  me.id,
  case when v.featured then pk.featured_id else pk.normal_id end,
  v.title, v.company, v.country, v.city, v.category, v.file_type, '919999999999', v.status,
  case when v.status in ('live', 'hidden') then now() + make_interval(days => v.starts_in) end,
  case when v.status in ('live', 'hidden') then now() + make_interval(days => v.ends_in) end
from (values
  ('SAMPLE Plumbers needed',     'Gulf Works',       'uae',    'Dubai',       'plumber',     'image', 'live',            -1,  29, true),
  ('SAMPLE Heavy driver',        'Desert Transport', 'saudi',  'Riyadh',      'driver',      'pdf',   'live',            -2,  28, false),
  ('SAMPLE Restaurant cook',     'Spice Garden',     'kuwait', 'Kuwait City', 'cook',        'image', 'live',            -3,  27, false),
  ('SAMPLE Ended yesterday',     'Gulf Works',       'qatar',  'Doha',        'electrician', 'image', 'live',           -30,  -1, false),
  ('SAMPLE Hidden ad',           'Gulf Works',       'oman',   'Muscat',      'helper',      'image', 'hidden',          -2,  20, false),
  ('SAMPLE Waiting for payment', 'Gulf Works',       'uae',    'Abu Dhabi',   'office',      'image', 'pending_payment',  0,   0, false)
) as v(title, company, country, city, category, file_type, status, starts_in, ends_in, featured)
cross join (select (select id from public.packages where featured and active order by price_paise limit 1) as featured_id,
                   (select id from public.packages where not featured and active order by duration_days desc limit 1) as normal_id) pk
cross join (select id from public.profiles where email = 'you@example.com') me;

update public.profiles set verified = true where email = 'you@example.com';

-- To remove the sample ads again (remove the two dashes and run):
-- delete from public.jobs where title like 'SAMPLE %';
