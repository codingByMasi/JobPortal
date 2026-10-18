-- LIVE END-TO-END TEST (run with: node scripts/live-e2e.mjs). Everything happens inside ONE do-block that ends with an error on purpose,
-- so every test row (users, ads, payments, files) is rolled back and nothing stays in your project. It needs the CLI linked to the project.
create or replace function pg_temp.try(p_sql text, p_who uuid default null, p_aal text default 'aal1') returns text language plpgsql as $f$
declare v text; n int;
begin
  if p_who is null then
    execute 'set local role anon';
    perform set_config('request.jwt.claims', '', true);
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated', 'aal', p_aal)::text, true);
  end if;
  begin
    if lower(ltrim(p_sql)) like 'select%' then
      execute p_sql into v;
      v := coalesce(v, '(none)');
    else
      execute p_sql;
      get diagnostics n = row_count;
      v := 'ok rows=' || n;
    end if;
  exception when others then
    v := 'ERR ' || sqlstate || ': ' || left(sqlerrm, 110);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $f$;

create or replace function pg_temp.chk(p_area text, p_test text, p_expect text, p_actual text) returns jsonb language sql as $f$
  select jsonb_build_object('area', p_area, 'test', p_test, 'expect', p_expect, 'actual', p_actual,
    'ok', case p_expect when 'allowed' then p_actual not like 'ERR%' when 'denied' then p_actual like 'ERR%' else p_actual = p_expect end);
$f$;

do $t$
declare
  res jsonb := '[]'::jsonb;
  u_admin uuid := gen_random_uuid(); u_e1 uuid := gen_random_uuid(); u_e2 uuid := gen_random_uuid(); u_bl uuid := gen_random_uuid();
  pkg uuid; base text; r text; j1 uuid; j2 uuid; j3 uuid; j4 uuid; j5 uuid; pay1 uuid; n int;
  f1 text; t1 text; j6 uuid;
begin
  select value into base from public.app_settings where key = 'storage_base';
  select id into pkg from public.packages where name = '30 Days';

  -- ===== people (rolled back at the end) =====
  insert into auth.users (id, email, raw_user_meta_data) values
    (u_admin, 'admin@livetest.invalid', '{"company_name":"Admin Co"}'),
    (u_e1, 'e1@livetest.invalid', '{"company_name":"Employer One","phone":"9876500001","ra_number":"B-1/2020","role":"admin"}'),
    (u_e2, 'e2@livetest.invalid', '{"company_name":"Employer Two"}'),
    (u_bl, 'blocked@livetest.invalid', '{"company_name":"Blocked Co"}');
  update public.profiles set role = 'admin' where id = u_admin;
  f1 := u_e1 || '/live-ad.jpg'; t1 := u_e1 || '/live-ad-t.jpg';
  insert into storage.objects (bucket_id, name, owner) values ('job-files', f1, u_e1), ('job-files', t1, u_e1), ('job-files', u_e2 || '/theirs.jpg', u_e2);

  -- ===== 1. signup =====
  select role || '/' || company_name || '/' || ra_number into r from public.profiles where id = u_e1;
  res := res || pg_temp.chk('1 signup', 'new account is an employer even if the signup data says admin; company and registration kept', 'recruiter/Employer One/B-1/2020', r);

  -- ===== 2. employer posts an ad =====
  r := pg_temp.try(format($q$insert into public.jobs (package_id, title, whatsapp, file_path, file_url, thumb_path, details)
        values (%L, 'Live test plumber', '9876543210', %L, %L, %L, 'Salary 1500 AED')$q$, pkg, f1, 'https://evil.example.net/storage/v1/object/public/job-files/' || f1, t1), u_e1);
  res := res || pg_temp.chk('2 post ad', 'employer can post an ad with a file, thumbnail and details', 'allowed', r);
  select id into j1 from public.jobs where title = 'Live test plumber';
  select status || '/' || whatsapp || '/' || price_paise_at_order || '/' || days_at_order into r from public.jobs where id = j1;
  res := res || pg_temp.chk('2 post ad', 'stored as waiting for payment, WhatsApp got 91, price and days saved', 'pending_payment/919876543210/79900/30', r);
  select file_url into r from public.jobs where id = j1;
  res := res || pg_temp.chk('2 post ad', 'typed-in outside link replaced by our own storage link', base || '/storage/v1/object/public/job-files/' || f1, r);
  select thumb_url into r from public.jobs where id = j1;
  res := res || pg_temp.chk('2 post ad', 'thumbnail link built by the database', base || '/storage/v1/object/public/job-files/' || t1, r);
  r := pg_temp.try(format($q$insert into public.jobs (package_id, title, whatsapp, file_path) values (%L, 'Steal file', '9876543210', %L)$q$, pkg, u_e2 || '/theirs.jpg'), u_e1);
  res := res || pg_temp.chk('2 post ad', 'cannot use another employer''s file', 'denied', r);
  r := pg_temp.try(format($q$insert into public.jobs (package_id, title, whatsapp, file_path) values (%L, 'Ghost file', '9876543210', %L)$q$, pkg, u_e1 || '/never-uploaded.jpg'), u_e1);
  res := res || pg_temp.chk('2 post ad', 'cannot attach a file that was never uploaded', 'denied', r);
  r := pg_temp.try(format($q$insert into public.jobs (package_id, title, whatsapp) values (%L, 'No phone', '123')$q$, pkg), u_e1);
  res := res || pg_temp.chk('2 post ad', 'a bad WhatsApp number is refused', 'denied', r);
  r := pg_temp.try(format($q$update public.jobs set status = 'live' where id = %L$q$, j1), u_e1);
  res := res || pg_temp.chk('3 employer limits', 'employer cannot make own ad live', 'denied', r);
  r := pg_temp.try(format($q$update public.jobs set expires_at = now() + interval '90 days' where id = %L$q$, j1), u_e1);
  res := res || pg_temp.chk('3 employer limits', 'employer cannot set own end date', 'denied', r);
  r := pg_temp.try(format($q$update public.jobs set package_id = (select id from public.packages where name = '7 Days') where id = %L$q$, j1), u_e1);
  res := res || pg_temp.chk('3 employer limits', 'employer cannot change the package', 'denied', r);
  r := pg_temp.try(format($q$update public.jobs set price_paise_at_order = 1 where id = %L$q$, j1), u_e1);
  res := res || pg_temp.chk('3 employer limits', 'employer cannot change the saved price', 'denied', r);
  r := pg_temp.try(format($q$update public.jobs set title = 'Live test plumber (edited)' where id = %L$q$, j1), u_e1);
  res := res || pg_temp.chk('3 employer limits', 'employer can edit own waiting ad', 'ok rows=1', r);
  r := pg_temp.try(format($q$update public.jobs set title = 'hijack' where id = %L$q$, j1), u_e2);
  res := res || pg_temp.chk('3 employer limits', 'another employer cannot edit it', 'ok rows=0', r);
  r := pg_temp.try(format($q$select count(*)::text from public.jobs where id = %L$q$, j1), u_e2);
  res := res || pg_temp.chk('3 employer limits', 'another employer cannot even see it', '0', r);
  r := pg_temp.try($q$update public.profiles set role = 'admin' where email = 'e1@livetest.invalid'$q$, u_e1);
  res := res || pg_temp.chk('3 employer limits', 'employer cannot make themselves admin', 'denied', r);
  r := pg_temp.try($q$update public.profiles set verified = true where email = 'e1@livetest.invalid'$q$, u_e1);
  res := res || pg_temp.chk('3 employer limits', 'employer cannot verify themselves', 'denied', r);

  -- ===== 4. visitors =====
  r := pg_temp.try('select count(*)::text from public.jobs');
  res := res || pg_temp.chk('4 visitor', 'visitor cannot read the jobs table', '0', r);
  r := pg_temp.try('select count(*)::text from public.public_jobs');
  res := res || pg_temp.chk('4 visitor', 'unpaid ad is not on the public list', '0', r);
  r := pg_temp.try(format($q$insert into public.applications (job_id, name, phone) values (%L, 'Ram', '9811100001')$q$, j1));
  res := res || pg_temp.chk('4 visitor', 'cannot apply to an ad that is not live', 'denied', r);

  -- ===== 5. payment and approval =====
  r := pg_temp.try(format($q$select (public.admin_mark_paid(%L, null, 'x', 'HACK'))::text$q$, j1), u_e1);
  res := res || pg_temp.chk('5 payment', 'employer cannot mark an ad paid', 'denied', r);
  r := pg_temp.try(format($q$select (public.admin_mark_paid(%L, null, 'live test', 'LIVE-UTR-1')).id::text$q$, j1), u_admin);
  res := res || pg_temp.chk('5 payment', 'admin marks it paid with a bank reference', 'allowed', r);
  select amount_paise || '/' || reference || '/' || status into r from public.payments where job_id = j1;
  res := res || pg_temp.chk('5 payment', 'payment saved at the price saved with the ad', '79900/LIVE-UTR-1/paid', r);
  select status into r from public.jobs where id = j1;
  res := res || pg_temp.chk('5 payment', 'ad now waits for approval', 'paid_pending_review', r);
  select id into pay1 from public.payments where job_id = j1;
  r := pg_temp.try(format($q$select count(*)::text from public.payments where id = %L$q$, pay1), u_e1);
  res := res || pg_temp.chk('5 payment', 'employer sees own payment', '1', r);
  r := pg_temp.try(format($q$select count(*)::text from public.payments where id = %L$q$, pay1), u_e2);
  res := res || pg_temp.chk('5 payment', 'other employer does not see it', '0', r);
  r := pg_temp.try($q$insert into public.payments (recruiter_id, amount_paise) values (gen_random_uuid(), 1)$q$, u_e1);
  res := res || pg_temp.chk('5 payment', 'employer cannot write a payment', 'denied', r);
  insert into public.jobs (recruiter_id, package_id, title, whatsapp) values (u_e1, pkg, 'Second ad', '919876543210') returning id into j2;
  r := pg_temp.try(format($q$select (public.admin_mark_paid(%L, null, '', 'live-utr-1')).id::text$q$, j2), u_admin);
  res := res || pg_temp.chk('5 payment', 'the same reference cannot pay a second ad', 'denied', r);
  r := pg_temp.try(format($q$select public.admin_approve_job(%L)::text$q$, j2), u_admin);
  res := res || pg_temp.chk('5 payment', 'admin cannot approve an ad that was never paid', 'denied', r);
  r := pg_temp.try(format($q$select (public.admin_approve_job(%L)).id::text$q$, j1), u_admin);
  res := res || pg_temp.chk('5 payment', 'admin approves the paid ad', 'allowed', r);
  select status || '/' || round(extract(epoch from (expires_at - starts_at)) / 86400)::int into r from public.jobs where id = j1;
  res := res || pg_temp.chk('5 payment', 'ad is live for the 30 days saved with it', 'live/30', r);
  r := pg_temp.try(format($q$select public.admin_approve_job(%L)::text$q$, j1), u_admin);
  res := res || pg_temp.chk('5 payment', 'a live ad cannot be approved again (no free extension)', 'denied', r);

  -- ===== 6. what visitors see =====
  r := pg_temp.try(format($q$select count(*)::text from public.public_jobs where id = %L$q$, j1));
  res := res || pg_temp.chk('6 public', 'the live ad is on the public list', '1', r);
  r := pg_temp.try(format($q$select coalesce(details, '') || '|' || (thumb_url is not null)::text from public.public_jobs where id = %L$q$, j1));
  res := res || pg_temp.chk('6 public', 'public list carries the details text and the thumbnail', 'Salary 1500 AED|true', r);
  r := pg_temp.try('select count(*)::text from public.jobs');
  res := res || pg_temp.chk('6 public', 'visitor still cannot read the jobs table (owner ids hidden)', '0', r);
  r := pg_temp.try(format($q$delete from public.jobs where id = %L$q$, j1), u_e1);
  res := res || pg_temp.chk('6 public', 'employer cannot delete a paid, live ad', 'ok rows=0', r);

  -- ===== 7. applying =====
  r := pg_temp.try(format($q$insert into public.applications (job_id, name, phone, city, message) values (%L, 'Ram Kumar', '98111 00001', 'Lucknow', 'Plumber, 5 years')$q$, j1));
  res := res || pg_temp.chk('7 apply', 'visitor can apply to a live ad', 'ok rows=1', r);
  r := pg_temp.try(format($q$insert into public.applications (job_id, name, phone) values (%L, 'Ram again', '+91 9811100001')$q$, j1));
  res := res || pg_temp.chk('7 apply', 'the same phone cannot apply twice', 'denied', r);
  r := pg_temp.try(format($q$insert into public.applications (job_id, name, phone) values (%L, 'Bad', 'abc')$q$, j1));
  res := res || pg_temp.chk('7 apply', 'a bad phone is refused', 'denied', r);
  r := pg_temp.try('select count(*)::text from public.applications');
  res := res || pg_temp.chk('7 apply', 'visitor cannot read applications', '0', r);
  r := pg_temp.try('select count(*)::text from public.applications', u_e1);
  res := res || pg_temp.chk('7 apply', 'unverified employer does NOT see applicant details', '0', r);
  r := pg_temp.try('select public.count_my_applications()::text', u_e1);
  res := res || pg_temp.chk('7 apply', 'unverified employer sees only the count', '1', r);
  r := pg_temp.try(format($q$update public.profiles set verified = true where id = %L$q$, u_e1), u_admin);
  res := res || pg_temp.chk('7 apply', 'admin verifies the employer', 'ok rows=1', r);
  r := pg_temp.try('select count(*)::text from public.applications', u_e1);
  res := res || pg_temp.chk('7 apply', 'verified employer now sees the applicant', '1', r);
  r := pg_temp.try('select count(*)::text from public.applications', u_e2);
  res := res || pg_temp.chk('7 apply', 'a different employer sees nothing', '0', r);

  -- ===== 8. change requests =====
  r := pg_temp.try(format($q$insert into public.change_requests (job_id, message) values (%L, 'Please change the city')$q$, j1), u_e1);
  res := res || pg_temp.chk('8 change request', 'employer can ask for a change on a paid ad', 'ok rows=1', r);
  r := pg_temp.try(format($q$insert into public.change_requests (job_id, message) values (%L, 'Second')$q$, j1), u_e1);
  r := pg_temp.try(format($q$insert into public.change_requests (job_id, message) values (%L, 'Third')$q$, j1), u_e1);
  r := pg_temp.try(format($q$insert into public.change_requests (job_id, message) values (%L, 'Fourth')$q$, j1), u_e1);
  res := res || pg_temp.chk('8 change request', 'a fourth open request is refused', 'denied', r);
  r := pg_temp.try(format($q$insert into public.change_requests (job_id, message) values (%L, 'On waiting ad')$q$, j2), u_e1);
  res := res || pg_temp.chk('8 change request', 'not for an ad that still waits for payment', 'denied', r);
  r := pg_temp.try(format($q$insert into public.change_requests (job_id, message) values (%L, 'Not mine')$q$, j1), u_e2);
  res := res || pg_temp.chk('8 change request', 'not for another employer''s ad', 'denied', r);
  r := pg_temp.try($q$update public.change_requests set status = 'done'$q$, u_e1);
  res := res || pg_temp.chk('8 change request', 'employer cannot close their own request', 'ok rows=0', r);
  r := pg_temp.try($q$update public.change_requests set status = 'done' where message = 'Please change the city'$q$, u_admin);
  res := res || pg_temp.chk('8 change request', 'admin marks it done', 'ok rows=1', r);
  select (handled_at is not null)::text into r from public.change_requests where message = 'Please change the city';
  res := res || pg_temp.chk('8 change request', 'the time it was handled is saved', 'true', r);

  -- ===== 9. reject, fix, send again =====
  insert into public.jobs (recruiter_id, package_id, title, whatsapp, status, price_paise_at_order, days_at_order)
    values (u_e1, pkg, 'Rejected ad', '919876543210', 'paid_pending_review', 79900, 30) returning id into j3;
  r := pg_temp.try(format($q$select public.admin_reject_job(%L, '  ')::text$q$, j3), u_admin);
  res := res || pg_temp.chk('9 reject', 'a reason is required to reject', 'denied', r);
  r := pg_temp.try(format($q$select public.admin_reject_job(%L, 'Phone number missing')::text$q$, j3), u_admin);
  res := res || pg_temp.chk('9 reject', 'admin rejects with a reason', 'allowed', r);
  r := pg_temp.try(format($q$update public.jobs set title = 'Rejected ad (fixed)' where id = %L$q$, j3), u_e1);
  res := res || pg_temp.chk('9 reject', 'employer can fix a rejected ad', 'ok rows=1', r);
  r := pg_temp.try(format($q$update public.jobs set status = 'live' where id = %L$q$, j3), u_e1);
  res := res || pg_temp.chk('9 reject', 'employer cannot jump to live', 'denied', r);
  r := pg_temp.try(format($q$update public.jobs set status = 'paid_pending_review', reject_reason = null where id = %L$q$, j3), u_e1);
  res := res || pg_temp.chk('9 reject', 'employer can send the fixed ad for review again', 'ok rows=1', r);
  select status into r from public.jobs where id = j3;
  res := res || pg_temp.chk('9 reject', 'it is back waiting for approval (no new payment)', 'paid_pending_review', r);
  r := pg_temp.try(format($q$update public.jobs set status = 'paid_pending_review', reject_reason = null where id = %L$q$, j2), u_e1);
  res := res || pg_temp.chk('9 reject', 'an unpaid ad cannot skip payment this way', 'denied', r);
  r := pg_temp.try(format($q$delete from public.jobs where id = %L$q$, j2), u_e1);
  res := res || pg_temp.chk('9 reject', 'employer can delete an unpaid ad', 'ok rows=1', r);

  -- ===== 10. hide, show, refund =====
  r := pg_temp.try(format($q$select public.admin_set_hidden(%L, true)::text$q$, j1), u_admin);
  res := res || pg_temp.chk('10 hide/refund', 'admin hides a live ad', 'allowed', r);
  r := pg_temp.try(format($q$select count(*)::text from public.public_jobs where id = %L$q$, j1));
  res := res || pg_temp.chk('10 hide/refund', 'hidden ad leaves the public list', '0', r);
  r := pg_temp.try(format($q$select public.admin_set_hidden(%L, false)::text$q$, j1), u_admin);
  res := res || pg_temp.chk('10 hide/refund', 'admin shows it again', 'allowed', r);
  r := pg_temp.try(format($q$select public.admin_refund_payment(%L, true)::text$q$, pay1), u_admin);
  res := res || pg_temp.chk('10 hide/refund', 'admin refunds and hides the ad', 'allowed', r);
  select p.status || '/' || j.status into r from public.payments p join public.jobs j on j.id = p.job_id where p.id = pay1;
  res := res || pg_temp.chk('10 hide/refund', 'payment refunded and ad hidden', 'refunded/hidden', r);
  r := pg_temp.try(format($q$select public.admin_refund_payment(%L)::text$q$, pay1), u_admin);
  res := res || pg_temp.chk('10 hide/refund', 'cannot refund twice', 'denied', r);

  -- ===== 11. company changes, blocking =====
  r := pg_temp.try(format($q$update public.profiles set company_name = 'Famous Group' where id = %L$q$, u_e1), u_e1);
  select verified::text into r from public.profiles where id = u_e1;
  res := res || pg_temp.chk('11 trust', 'renaming the company removes the verified tag', 'false', r);
  insert into public.jobs (recruiter_id, package_id, title, whatsapp, status, starts_at, expires_at, price_paise_at_order, days_at_order)
    values (u_bl, pkg, 'Blocked employer live ad', '919876543210', 'live', now(), now() + interval '10 days', 79900, 30) returning id into j5;
  r := pg_temp.try(format($q$update public.profiles set blocked = true where id = %L$q$, u_bl), u_admin);
  select status into r from public.jobs where id = j5;
  res := res || pg_temp.chk('11 trust', 'blocking an employer hides their live ads', 'hidden', r);
  r := pg_temp.try(format($q$insert into public.jobs (package_id, title, whatsapp) values (%L, 'Blocked tries', '919876543210')$q$, pkg), u_bl);
  res := res || pg_temp.chk('11 trust', 'a blocked employer cannot post', 'denied', r);
  r := pg_temp.try(format($q$insert into storage.objects (bucket_id, name, owner) values ('job-files', %L, %L)$q$, u_bl || '/x.jpg', u_bl), u_bl);
  res := res || pg_temp.chk('11 trust', 'a blocked employer cannot upload', 'denied', r);

  -- ===== 12. storage rules =====
  r := pg_temp.try(format($q$insert into storage.objects (bucket_id, name, owner) values ('job-files', %L, %L)$q$, u_e2 || '/mine.jpg', u_e2), u_e2);
  res := res || pg_temp.chk('12 storage', 'employer can upload into own folder', 'ok rows=1', r);
  r := pg_temp.try(format($q$insert into storage.objects (bucket_id, name, owner) values ('job-files', %L, %L)$q$, u_e1 || '/steal.jpg', u_e2), u_e2);
  res := res || pg_temp.chk('12 storage', 'employer cannot upload into someone else''s folder', 'denied', r);
  r := pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('job-files', 'loose.jpg')$q$);
  res := res || pg_temp.chk('12 storage', 'visitor cannot upload', 'denied', r);

  -- ===== 13. admin two-step login (real Supabase tables) =====
  begin
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
      values (gen_random_uuid(), u_admin, 'live-test', 'totp', 'verified', now(), now());
    res := res || pg_temp.chk('13 two-step', 'can create a verified authenticator factor in the real table', 'allowed', 'ok');
  exception when others then
    res := res || pg_temp.chk('13 two-step', 'can create a verified authenticator factor in the real table', 'allowed', 'ERR ' || sqlstate || ': ' || left(sqlerrm, 110));
  end;
  r := pg_temp.try('select public.is_admin()::text', u_admin, 'aal1');
  res := res || pg_temp.chk('13 two-step', 'admin with the app on, password only: NOT admin', 'false', r);
  r := pg_temp.try('select public.is_admin()::text', u_admin, 'aal2');
  res := res || pg_temp.chk('13 two-step', 'admin with password + code: admin', 'true', r);
  r := pg_temp.try(format($q$select public.admin_set_hidden(%L, true)::text$q$, j1), u_admin, 'aal1');
  res := res || pg_temp.chk('13 two-step', 'password-only login cannot use admin functions', 'denied', r);
  r := pg_temp.try('select public.is_admin()::text', u_e2, 'aal2');
  res := res || pg_temp.chk('13 two-step', 'an employer is never admin', 'false', r);

  -- ===== 14. system parts =====
  r := pg_temp.try('select public.expire_jobs()::text', u_e1);
  res := res || pg_temp.chk('14 system', 'employer cannot run the expiry function', 'denied', r);
  r := pg_temp.try('select public.cleanup_old_data()::text', u_e1);
  res := res || pg_temp.chk('14 system', 'employer cannot run the clean-up function', 'denied', r);
  r := pg_temp.try('select count(*)::text from public.app_settings', u_e1);
  res := res || pg_temp.chk('14 system', 'employer cannot read private settings', 'denied', r);
  select public.expire_jobs()::text into r;
  res := res || pg_temp.chk('14 system', 'expiry function runs for the system', 'allowed', r);
  select public.cleanup_old_data()::text into r;
  res := res || pg_temp.chk('14 system', 'clean-up function runs for the system', 'allowed', r);
  r := pg_temp.try('select count(*)::text from public.admin_log', u_e1);
  res := res || pg_temp.chk('14 system', 'employer cannot read the admin log', '0', r);
  select count(*)::text into r from public.admin_log where created_at >= now(); -- only this test's own lines (the real log already holds real entries)
  res := res || pg_temp.chk('14 system', 'admin actions were logged (6 lines: mark paid, approve, reject, hide, show, refund)', '6', r);

  -- ===== 15. launch hardening (migration 0017) =====
  -- a fresh live ad to apply to (the first one was hidden by the refund test)
  insert into public.jobs (recruiter_id, package_id, title, whatsapp, status, starts_at, expires_at, price_paise_at_order, days_at_order)
    values (u_e2, pkg, 'Flood test ad', '919811100555', 'live', now(), now() + interval '10 days', 79900, 30) returning id into j6;
  select has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'execute')::text into r;
  res := res || pg_temp.chk('15 launch', 'Supabase''s login service may run the signup trigger', 'true', r);
  select has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')::text into r;
  res := res || pg_temp.chk('15 launch', 'but nobody can call it from the website', 'false', r);
  -- the visitor address arrives in the request headers, as it does through the real API
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.50"}', true);
  n := 0;
  for i in 1..30 loop
    r := pg_temp.try(format($q$insert into public.applications (job_id, name, phone) values (%L, 'Flood', %L)$q$, j6, '9712' || lpad(i::text, 6, '0')));
    if r like 'ok%' then n := n + 1; end if;
  end loop;
  res := res || pg_temp.chk('15 launch', 'a visitor address can send 30 forms an hour', '30', n::text);
  r := pg_temp.try(format($q$insert into public.applications (job_id, name, phone) values (%L, 'Flood', '9712999999')$q$, j6));
  res := res || pg_temp.chk('15 launch', 'the 31st form from the same address is refused', 'denied', r);
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.77"}', true);
  r := pg_temp.try(format($q$insert into public.applications (job_id, name, phone) values (%L, 'Other', '9712888888')$q$, j6));
  res := res || pg_temp.chk('15 launch', 'another address is not affected', 'ok rows=1', r);
  perform set_config('request.headers', '', true);
  select (count(*) filter (where client_hash is not null) > 0 and bool_and(client_hash is null or client_hash ~ '^[0-9a-f]{32}$'))::text into r from public.applications where job_id = j6;
  res := res || pg_temp.chk('15 launch', 'only a scrambled value of the address is stored', 'true', r);
  r := pg_temp.try($q$select public.log_client_error('Live test crash', '/jobs', 'LiveTest')::text$q$);
  res := res || pg_temp.chk('15 launch', 'a visitor can report a crash', 'allowed', r);
  r := pg_temp.try($q$select public.log_client_error('Live test crash', '/jobs', 'LiveTest')::text$q$, u_e1);
  select times::text into r from public.error_log where message = 'Live test crash';
  res := res || pg_temp.chk('15 launch', 'the same crash is counted, not repeated', '2', r);
  r := pg_temp.try('select count(*)::text from public.error_log', u_e1);
  res := res || pg_temp.chk('15 launch', 'employers cannot read the crash list', '0', r);
  r := pg_temp.try('select count(*)::text from public.error_log', null);
  res := res || pg_temp.chk('15 launch', 'visitors cannot read the crash list', 'denied', r);
  r := pg_temp.try('select count(*)::text from public.error_log where message = ''Live test crash''', u_admin, 'aal2');
  res := res || pg_temp.chk('15 launch', 'the admin can read it', '1', r);
  update public.profiles set phone = '9811100777' where id = u_e2;
  update public.profiles set blocked = true where id = u_e2;
  r := pg_temp.try(format($q$insert into public.jobs (package_id, title, whatsapp) values (%L, 'Banned number ad', '919811100777')$q$, pkg), u_e1);
  res := res || pg_temp.chk('15 launch', 'a banned employer''s phone cannot be used by another login', 'denied', r);
  insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'comeback@livetest.invalid', '{"company_name":"Comeback","phone":"+91 98111 00777"}');
  select blocked::text into r from public.profiles where email = 'comeback@livetest.invalid';
  res := res || pg_temp.chk('15 launch', 'a new signup with a banned phone starts blocked', 'true', r);

  raise exception 'LIVE_E2E_RESULTS %', res::text;
end
$t$;
