-- 0037: least privilege, written out in full. Supabase used to give the visitor role (anon) and the signed-in role (authenticated) every right on every new table and
-- let Row Level Security decide; it is stopping that for new tables, and some rights (TRUNCATE) are not covered by Row Level Security at all. So the rights are now
-- stated here, explicitly, and the result is the same whether Supabase grants things by itself or not.
-- After this file: nobody has TRUNCATE, REFERENCES or TRIGGER; visitors can read only the two public views and the public settings and can only ADD forms
-- (applications, reports, deletion requests); the two public views are read-only for everyone; the two logs cannot be written by a signed-in user
-- (only our database functions write them); and a table made later gives no rights to anyone until its own file grants exactly what its policies need.

-- Start from nothing for the two website roles (service_role, which the Edge Functions use, and the table owner keep their rights).
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

-- Visitors: read what is public, add what forms collect.
grant select on public.public_jobs, public.verified_agencies, public.site_settings to anon;
grant insert on public.applications, public.reports, public.deletion_requests to anon;

-- Signed-in people (employers and admins; Row Level Security still decides which rows).
-- Read only (the rows are written by our database functions, the admin screens never write them directly):
grant select on public.public_jobs, public.verified_agencies, public.site_settings, public.guides, public.notifications, public.ad_views,
  public.admin_log, public.audit_log, public.verification_requests to authenticated;
-- The clean-up list of old files: the admin reads it and clears what was removed.
grant select, delete on public.file_cleanup_queue to authenticated;
-- Everything else the app reads and writes through the policies (employers their own rows, admins all):
grant select, insert, update, delete on public.applications, public.blocked_contacts, public.change_requests, public.deletion_requests, public.error_log,
  public.jobs, public.offer_redemptions, public.offers, public.packages, public.payments, public.profiles, public.reports to authenticated;

-- Closed to both website roles (only database functions and the Edge Functions touch them): alert_outbox, app_settings, human_passes, job_alerts.
