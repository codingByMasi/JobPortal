// SECURITY TESTS, PART 2: migration 0012 (hardening from docs/00-project-analysis.md).
// Same method as rls.test.mjs: the real migrations in a real Postgres, acting as visitor, employer or admin.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2;
let pkg7; let pkg30; let live1;

const STORAGE_URL = (path) => `https://abc.supabase.co/storage/v1/object/public/job-files/${path}`;
const putFile = (owner, path) => db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [path, owner]);

async function seedJob(owner, title, status, packageId, startsDays, endsDays) {
  const { rows } = await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, status, starts_at, expires_at, whatsapp)
     values ($1, $2, $3, 'uae', 'Dubai', 'plumber', $4,
             case when $5::int is null then null else now() + make_interval(days => $5::int) end,
             case when $6::int is null then null else now() + make_interval(days => $6::int) end, '919999999999')
     returning id`,
    [owner, packageId, title, status, startsDays, endsDays],
  );
  return rows[0].id;
}

const newJob = (owner, o = {}) => ({ recruiter_id: owner, package_id: pkg30, title: 'My new ad', status: 'pending_payment', whatsapp: '919999999999', ...o });

function insertJob(who, row) {
  const cols = Object.keys(row);
  return as(db, who, () => db.query(
    `insert into public.jobs (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    cols.map((c) => row[c]),
  ));
}

const adminDo = (sql, params) => as(db, admin, () => db.query(sql, params));

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co', { company_name: 'Admin Co' });
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  const id = async (name) => (await rowsOf(db, 'select id from public.packages where name = $1', [name]))[0].id;
  pkg7 = await id('7 Days');
  pkg30 = await id('30 Days');
  live1 = await seedJob(e1, 'Live one', 'live', pkg30, -1, 29);
}, 120000);

describe('9. hardening (migration 0012)', () => {
  it('the WhatsApp number must have 10 to 15 digits; a 10-digit Indian mobile number gets 91 in front', async () => {
    await denied(insertJob(e1, newJob(e1, { whatsapp: '' })));
    await denied(insertJob(e1, newJob(e1, { whatsapp: '12345' })));
    const save = async (n) => (await insertJob(e1, newJob(e1, { whatsapp: n }))).rows[0].id;
    expect((await rowsOf(db, 'select whatsapp from public.jobs where id = $1', [await save('98765 43210')]))[0].whatsapp).toBe('919876543210');
    expect((await rowsOf(db, 'select whatsapp from public.jobs where id = $1', [await save('+971 50 123 4567')]))[0].whatsapp).toBe('971501234567');
  });

  it('the price and days are saved with the ad; a later package change does not alter them, and employers cannot change them', async () => {
    const own = (await insertJob(e1, newJob(e1, { title: 'Snapshot ad', package_id: pkg7 }))).rows[0].id;
    expect((await rowsOf(db, 'select price_paise_at_order p, days_at_order d from public.jobs where id = $1', [own]))[0]).toEqual({ p: 29900, d: 7 });
    await denied(as(db, e1, () => db.query('update public.jobs set price_paise_at_order = 1 where id = $1', [own])));
    await db.query('update public.packages set price_paise = 999900 where id = $1', [pkg7]);
    const [pay] = (await adminDo('select * from public.admin_mark_paid($1)', [own])).rows;
    expect(pay.amount_paise).toBe(29900);
    await db.query('update public.packages set price_paise = 29900 where id = $1', [pkg7]);
  });

  it('approve works only for ads waiting for approval (or rejected after payment), never for unpaid, live, ended or hidden ads', async () => {
    for (const status of ['pending_payment', 'live', 'expired', 'hidden']) {
      const j = await seedJob(e1, `Approve ${status}`, status, pkg30, null, null);
      await denied(adminDo('select public.admin_approve_job($1)', [j]));
    }
    const rejected = await seedJob(e1, 'Approve rejected', 'rejected', pkg30, null, null);
    await expect(adminDo('select public.admin_approve_job($1)', [rejected])).resolves.toBeTruthy();
  });

  it('approve uses the days saved with the ad', async () => {
    const own = (await insertJob(e1, newJob(e1, { title: 'Seven day ad', package_id: pkg7 }))).rows[0].id;
    await db.query('update public.packages set duration_days = 90 where id = $1', [pkg7]);
    await adminDo('select * from public.admin_mark_paid($1)', [own]);
    await adminDo('select public.admin_approve_job($1)', [own]);
    expect(Number((await rowsOf(db, 'select extract(epoch from (expires_at - starts_at)) / 86400 d from public.jobs where id = $1', [own]))[0].d)).toBe(7);
    await db.query('update public.packages set duration_days = 7 where id = $1', [pkg7]);
  });

  it('reject, hide and show check the ad status; show refuses an ended ad; every admin action is logged', async () => {
    const review = await seedJob(e1, 'Review me', 'paid_pending_review', pkg30, null, null);
    await denied(adminDo("select public.admin_reject_job($1, '  ')", [review]));
    await adminDo("select public.admin_reject_job($1, 'No phone number')", [review]);
    expect((await rowsOf(db, 'select status, reject_reason from public.jobs where id = $1', [review]))[0]).toEqual({ status: 'rejected', reject_reason: 'No phone number' });
    await denied(adminDo("select public.admin_reject_job($1, 'again')", [review]));
    const live = await seedJob(e1, 'Hide me', 'live', pkg30, -1, 10);
    await denied(adminDo('select public.admin_set_hidden($1, false)', [live]));
    await adminDo('select public.admin_set_hidden($1, true)', [live]);
    await adminDo('select public.admin_set_hidden($1, false)', [live]);
    const gone = await seedJob(e1, 'Ended hidden', 'hidden', pkg30, -10, -1);
    await denied(adminDo('select public.admin_set_hidden($1, false)', [gone]));
    const log = await rowsOf(db, 'select action from public.admin_log where target_id = any($1)', [[review, live]]);
    expect(log.map((l) => l.action).sort()).toEqual(['hide_job', 'reject_job', 'show_job']);
  });

  it('only admins can use these functions or read the admin log', async () => {
    const j = await seedJob(e1, 'Nope', 'paid_pending_review', pkg30, null, null);
    for (const sql of ["select public.admin_reject_job($1, 'x')", 'select public.admin_set_hidden($1, true)', 'select public.admin_approve_job($1)']) {
      await denied(as(db, e1, () => db.query(sql, [j])));
      await denied(as(db, null, () => db.query(sql, [j])));
    }
    await denied(as(db, e1, () => db.query('select public.admin_refund_payment($1)', [j])));
    expect(await as(db, e1, () => countOf(db, 'select * from public.admin_log'))).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.admin_log'))).toBeGreaterThan(0);
    await denied(as(db, e1, () => db.query("insert into public.admin_log (action) values ('fake')")));
  });

  it('a payment reference can be used once; an ad has one paid payment; refund can hide the ad', async () => {
    const a = await seedJob(e1, 'Pay A', 'pending_payment', pkg30, null, null);
    const b = await seedJob(e1, 'Pay B', 'pending_payment', pkg30, null, null);
    await adminDo("select * from public.admin_mark_paid($1, null, '', 'UTR123')", [a]);
    await denied(adminDo("select * from public.admin_mark_paid($1, null, '', 'utr123')", [b]));
    await denied(adminDo('insert into public.payments (job_id, recruiter_id, amount_paise) values ($1, $2, 100)', [a, e1]));
    const [paid] = await rowsOf(db, 'select id from public.payments where job_id = $1', [a]);
    await adminDo('select public.admin_approve_job($1)', [a]);
    await adminDo('select public.admin_refund_payment($1, true)', [paid.id]);
    expect((await rowsOf(db, 'select status from public.payments where id = $1', [paid.id]))[0].status).toBe('refunded');
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [a]))[0].status).toBe('hidden');
    await denied(adminDo('select public.admin_refund_payment($1)', [paid.id]));
  });

  it('an employer with payment records cannot be deleted (money records are kept)', async () => {
    const keep = await addUser(db, 'keep@x.co', {});
    await db.query('insert into public.payments (recruiter_id, amount_paise) values ($1, 100)', [keep]);
    await expect(db.query('delete from auth.users where id = $1', [keep])).rejects.toBeTruthy();
    expect(await countOf(db, 'select 1 from public.payments where recruiter_id = $1', [keep])).toBe(1);
  });

  it('employers can delete unpaid, rejected or ended ads, but not a paid, live or hidden one', async () => {
    const del = (id) => as(db, e1, () => db.query('delete from public.jobs where id = $1', [id]));
    for (const [status, ok, a, b] of [['pending_payment', true, null, null], ['rejected', true, null, null], ['expired', true, -9, -1], ['live', true, -9, -1],
      ['live', false, -1, 5], ['hidden', false, -1, 5], ['paid_pending_review', false, null, null]]) {
      const id = await seedJob(e1, `To delete ${status}`, status, pkg30, a, b);
      expect((await del(id)).affectedRows).toBe(ok ? 1 : 0);
    }
  });

  it('visitors cannot read the jobs table at all, only the public view', async () => {
    expect(await as(db, null, () => countOf(db, 'select * from public.jobs'))).toBe(0);
    expect(await as(db, null, () => countOf(db, 'select * from public.public_jobs'))).toBeGreaterThan(0);
  });

  it('visitors can still apply to a live ad (through the check function), but not to others', async () => {
    const j = await seedJob(e2, 'Apply here', 'live', pkg30, -1, 10);
    const h = await seedJob(e2, 'Hidden one', 'hidden', pkg30, -1, 10);
    const apply = (id) => as(db, null, () => db.query("insert into public.applications (job_id, name, phone) values ($1, 'Ram', '9811100022')", [id]));
    await expect(apply(j)).resolves.toBeTruthy();
    await denied(apply(h));
  });

  it('blocking an employer hides their live ads', async () => {
    const u = await addUser(db, 'toblock@x.co', {});
    const live = await seedJob(u, 'Block me', 'live', pkg30, -1, 10);
    await adminDo('update public.profiles set blocked = true where id = $1', [u]);
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [live]))[0].status).toBe('hidden');
    expect(await as(db, null, () => countOf(db, 'select * from public.public_jobs where id = $1', [live]))).toBe(0);
    await db.query('delete from public.blocked_contacts'); // blocking also bans the number (tested in rls.launch.test.mjs); the other tests here reuse it
  });

  it('a verified employer who changes company name or registration number loses the verified tag; a phone change does not', async () => {
    const u = await addUser(db, 'verified@x.co', { company_name: 'Small Agency', ra_number: 'B-1/2020' });
    await db.query('update public.profiles set verified = true where id = $1', [u]);
    await as(db, u, () => db.query("update public.profiles set phone = '9876500000' where id = $1", [u]));
    expect((await rowsOf(db, 'select verified, ra_number from public.profiles where id = $1', [u]))[0]).toEqual({ verified: true, ra_number: 'B-1/2020' });
    await as(db, u, () => db.query("update public.profiles set company_name = 'Famous Group' where id = $1", [u]));
    expect((await rowsOf(db, 'select verified from public.profiles where id = $1', [u]))[0].verified).toBe(false);
    await denied(as(db, u, () => db.query('update public.profiles set ra_number = $2 where id = $1', [u, 'x'.repeat(41)])));
  });

  it('an employer can fix a rejected ad and send it for review again, but nothing else', async () => {
    const rej = await seedJob(e1, 'Rejected ad', 'rejected', pkg30, null, null);
    await db.query("update public.jobs set reject_reason = 'Number missing' where id = $1", [rej]);
    const edit = (set, id = rej) => as(db, e1, () => db.query(`update public.jobs set ${set} where id = $1`, [id]));
    expect((await edit("title = 'Fixed title'")).affectedRows).toBe(1);
    await denied(edit("status = 'live'"));
    await denied(edit("status = 'paid_pending_review'"));
    expect((await edit("status = 'paid_pending_review', reject_reason = null")).affectedRows).toBe(1);
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [rej]))[0].status).toBe('paid_pending_review');
    const waiting = await seedJob(e1, 'Waiting ad', 'pending_payment', pkg30, null, null);
    await denied(edit("status = 'paid_pending_review', reject_reason = null", waiting));
  });

  it('a thumbnail is checked and linked like the picture; the file type comes from the file name', async () => {
    const pdf = `${e1}/menu.pdf`; const th = `${e1}/menu-t.jpg`;
    await putFile(e1, pdf); await putFile(e1, th);
    const { rows } = await insertJob(e1, newJob(e1, { file_path: pdf, thumb_path: th, file_type: 'image', thumb_url: 'https://evil.example.com/t.jpg' }));
    expect((await rowsOf(db, 'select file_type, file_url, thumb_url from public.jobs where id = $1', [rows[0].id]))[0])
      .toEqual({ file_type: 'pdf', file_url: STORAGE_URL(pdf), thumb_url: STORAGE_URL(th) });
    await denied(insertJob(e1, newJob(e1, { thumb_path: th })));
    await denied(insertJob(e1, newJob(e1, { file_path: pdf, thumb_path: `${e2}/other-t.jpg` })));
  });

  it('the details text is limited to 600 letters and shown through the public view', async () => {
    await denied(insertJob(e1, newJob(e1, { details: 'x'.repeat(601) })));
    const j = await seedJob(e1, 'With details', 'live', pkg30, -1, 10);
    await db.query("update public.jobs set details = 'Salary 1500 AED' where id = $1", [j]);
    expect((await as(db, null, () => rowsOf(db, 'select details from public.public_jobs where id = $1', [j])))[0].details).toBe('Salary 1500 AED');
  });

  it('old applications are deleted after 180 days, and only the system can run the clean-up', async () => {
    await db.query("insert into public.applications (job_id, name, phone, created_at) values ($1, 'Old', '9000000001', now() - interval '200 days')", [live1]);
    expect((await db.query('select public.cleanup_old_data() n')).rows[0].n).toBeGreaterThanOrEqual(1);
    expect(await countOf(db, "select 1 from public.applications where name = 'Old'")).toBe(0);
    await denied(as(db, e1, () => db.query('select public.cleanup_old_data()')));
  });
});

describe('11. applicant details only for verified employers (migration 0014)', () => {
  it('an unverified employer sees how many people applied, but not who', async () => {
    const owner = await addUser(db, 'unverified@x.co', { company_name: 'New Agency' });
    const j = await seedJob(owner, 'Counted ad', 'live', pkg30, -1, 10);
    await db.query("insert into public.applications (job_id, name, phone) values ($1, 'Ram', '9811100099'), ($1, 'Sita', '9811100098')", [j]);
    expect(await as(db, owner, () => countOf(db, 'select * from public.applications'))).toBe(0);
    expect((await as(db, owner, () => db.query('select public.count_my_applications() n'))).rows[0].n).toBe(2);
  });
  it('after the admin verifies the company, the employer sees the details, and only for their own ads', async () => {
    const owner = await addUser(db, 'soon-verified@x.co', {});
    const other = await addUser(db, 'other-verified@x.co', {});
    const mine = await seedJob(owner, 'Mine', 'live', pkg30, -1, 10);
    await db.query("insert into public.applications (job_id, name, phone) values ($1, 'Ram', '9811100077')", [mine]);
    await db.query('update public.profiles set verified = true where id = any($1)', [[owner, other]]);
    expect(await as(db, owner, () => countOf(db, 'select * from public.applications where job_id = $1', [mine]))).toBe(1);
    expect(await as(db, other, () => countOf(db, 'select * from public.applications where job_id = $1', [mine]))).toBe(0);
    expect((await as(db, other, () => db.query('select public.count_my_applications() n'))).rows[0].n).toBe(0);
  });
  it('visitors cannot use the count function; the owner can switch the rule off in the settings', async () => {
    await denied(as(db, null, () => db.query('select public.count_my_applications()')));
    const owner = await addUser(db, 'rule-off@x.co', {});
    const j = await seedJob(owner, 'Rule off ad', 'live', pkg30, -1, 10);
    await db.query("insert into public.applications (job_id, name, phone) values ($1, 'Ram', '9811100066')", [j]);
    await db.query("insert into public.app_settings (key, value) values ('applicants_need_verified', 'false')");
    try {
      expect(await as(db, owner, () => countOf(db, 'select * from public.applications'))).toBe(1);
    } finally {
      await db.query("delete from public.app_settings where key = 'applicants_need_verified'");
    }
  });
});

describe('12. checker fixes (migration 0015)', () => {
  it('trigger functions cannot be called from outside, but the triggers still work for visitors and employers', async () => {
    for (const fn of ['handle_new_user', 'guard_profile_update', 'jobs_guard_insert', 'jobs_guard_update', 'applications_guard_insert', 'change_requests_guard_insert', 'profiles_block_hides_ads', 'change_requests_stamp', 'jobs_normalize_whatsapp']) {
      for (const role of ['anon', 'authenticated', 'public']) {
        const [{ ok }] = await rowsOf(db, `select has_function_privilege('${role}', 'public.${fn}()', 'execute') as ok`);
        expect(ok, `${role} may still call ${fn}`).toBe(false);
      }
    }
    // the triggers themselves still fire for the people who cause them
    const id = (await insertJob(e1, newJob(e1, { title: 'Trigger still fires', whatsapp: '9876543210' }))).rows[0].id;
    expect((await rowsOf(db, 'select status, whatsapp from public.jobs where id = $1', [id]))[0]).toEqual({ status: 'pending_payment', whatsapp: '919876543210' });
    await denied(insertJob(e1, newJob(e1, { status: 'live', title: 'Forced values', whatsapp: '12' })));
    const owner = await addUser(db, 'trigger-signup@x.co', { company_name: 'Signup Co' });
    expect((await rowsOf(db, 'select role from public.profiles where id = $1', [owner]))[0].role).toBe('recruiter');
  });
  it('the helper functions that the rules use stay callable by the people the rules apply to', async () => {
    expect((await as(db, e1, () => db.query('select public.is_admin() a'))).rows[0].a).toBe(false);
    expect((await as(db, null, () => db.query('select public.job_accepts_applications($1) a', [live1]))).rows[0].a).toBe(true);
  });
});
