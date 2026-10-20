// SECURITY TESTS, PART 13: license verification, free posting for verified employers, approving with days, extending ended ads (migration 0028).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30;
let seq = 0;

const putLicense = async (owner) => {
  seq += 1;
  const name = `${owner}/license-${seq}.jpg`;
  await db.query("insert into storage.objects (bucket_id, name, owner) values ('licenses', $1, $2)", [name, owner]);
  return name;
};
const send = (who, number, file) => as(db, who, () => db.query('select * from public.submit_verification($1, $2)', [number, file]));
const adminDo = (sql, params) => as(db, admin, () => db.query(sql, params));
const verify = (id) => as(db, admin, () => db.query('update public.profiles set verified = true where id = $1', [id]));
const insertAd = (who, title = 'My ad', extra = {}) => as(db, who, () => db.query(
  `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp)
   values ($1, $2, $3, 'uae', 'Dubai', 'plumber', '919999999999') returning id`, [who, extra.package ?? null, title]));
const jobRow = async (id) => (await rowsOf(db, 'select * from public.jobs where id = $1', [id]))[0];

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('27a. license verification', () => {
  it('the license bucket is private and limited', async () => {
    const [b] = await rowsOf(db, "select * from storage.buckets where id = 'licenses'");
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(3145728);
    expect(b.allowed_mime_types).toContain('application/pdf');
  });

  it('an employer sends the license number and file from their own folder; the number is trimmed', async () => {
    const [r] = (await send(e1, '  LIC-2024/77  ', await putLicense(e1))).rows;
    expect(r).toMatchObject({ recruiter_id: e1, license_number: 'LIC-2024/77', status: 'submitted' });
  });

  it('refuses a file from another folder, a missing file, a too short number, a visitor, and an already verified employer', async () => {
    await denied(send(e2, 'LIC-1234', await putLicense(e1)));            // someone else's file
    await denied(send(e2, 'LIC-1234', `${e2}/not-uploaded.jpg`));       // no such file
    await denied(send(e2, 'AB', await putLicense(e2)));                  // too short
    await denied(send(null, 'LIC-1234', await putLicense(e2)));
    expect(await countOf(db, 'select * from public.verification_requests where recruiter_id = $1', [e2])).toBe(0);
    const vv = await addUser(db, 'already@x.co', { company_name: 'Already' });
    await db.query('update public.profiles set verified = true where id = $1', [vv]);
    await denied(send(vv, 'LIC-1234', await putLicense(vv)));
  });

  it('the admin cannot verify an employer who sent no license; after a license is sent it works and the request is approved', async () => {
    await denied(verify(e2));
    expect((await rowsOf(db, 'select verified from public.profiles where id = $1', [e2]))[0].verified).toBe(false);
    await send(e2, 'LIC-E2-001', await putLicense(e2));
    expect((await verify(e2)).affectedRows).toBe(1);
    expect((await rowsOf(db, 'select status from public.verification_requests where recruiter_id = $1', [e2]))[0].status).toBe('approved');
  });

  it('a rejected license needs a reason, only a waiting request can be rejected, and verifying is blocked until a new license is sent', async () => {
    const [req] = await rowsOf(db, 'select id from public.verification_requests where recruiter_id = $1', [e1]);
    await denied(as(db, e1, () => db.query("select public.admin_reject_verification($1, 'nope')", [req.id])));
    await denied(adminDo("select public.admin_reject_verification($1, '  ')", [req.id]));
    await adminDo("select public.admin_reject_verification($1, 'The picture is not readable')", [req.id]);
    await denied(adminDo("select public.admin_reject_verification($1, 'again')", [req.id]));
    await denied(verify(e1));
    const [again] = (await send(e1, 'LIC-2024/78', await putLicense(e1))).rows;
    expect(again).toMatchObject({ id: req.id, status: 'submitted', reject_reason: null, license_number: 'LIC-2024/78' });
    expect(await countOf(db, "select * from public.admin_log where action = 'reject_verification'")).toBe(1);
  });

  it('employers cannot write the table, see other licenses, or read other license files; the admin can read all', async () => {
    await denied(as(db, e1, () => db.query("update public.verification_requests set status = 'approved' where recruiter_id = $1", [e1])).then((r) => {
      if (r.affectedRows === 0) throw new Error('refused');
      return r;
    }));
    await denied(as(db, e1, () => db.query("insert into public.verification_requests (recruiter_id, license_number, file_path) values ($1, 'LIC-FAKE', 'x/aaaaaaaaaaa')", [e1])));
    expect(await as(db, e1, () => countOf(db, 'select * from public.verification_requests'))).toBe(1);
    expect(await as(db, null, () => countOf(db, 'select * from public.verification_requests')).catch(() => 0)).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.verification_requests'))).toBe(2);
    const file = await putLicense(e1);
    expect(await as(db, e2, () => countOf(db, "select * from storage.objects where name = $1", [file]))).toBe(0);
    expect(await as(db, e1, () => countOf(db, "select * from storage.objects where name = $1", [file]))).toBe(1);
    expect(await as(db, admin, () => countOf(db, "select * from storage.objects where name = $1", [file]))).toBe(1);
  });
});

describe('27b. posting is free for a verified employer and waits for the admin', () => {
  it('an unverified employer cannot post; a verified one posts with no package, no price, waiting for approval', async () => {
    await denied(insertAd(e1)); // e1 was never verified (the license was rejected)
    const [{ id }] = (await insertAd(e2, 'Free ad')).rows;
    const job = await jobRow(id);
    expect(job).toMatchObject({ status: 'paid_pending_review', recruiter_id: e2, final_price_paise: 0, list_price_paise: 0, price_paise_at_order: 0, starts_at: null, expires_at: null });
    expect(job.package_id).toBeTruthy(); // the default plan is stored; the employer never chose it
    expect(await countOf(db, 'select * from public.payments where job_id = $1', [id])).toBe(0); // no payment record at all
  });

  it('a verified employer cannot make an ad live, choose a status or a price, or post for someone else', async () => {
    for (const ask of [{ status: 'live' }, { status: 'pending_payment' }]) {
      const { rows } = await as(db, e2, () => db.query(
        `insert into public.jobs (recruiter_id, package_id, title, status, final_price_paise, whatsapp, country, city, category)
         values ($1, $2, 'Sneaky', $3, 99900, '919999999999', 'uae', 'Dubai', 'plumber') returning id`, [e2, pkg30, ask.status]));
      expect(await jobRow(rows[0].id)).toMatchObject({ status: 'paid_pending_review', final_price_paise: 0 });
    }
    // asking to post for someone else stores it as the asker's own ad
    const { rows } = await as(db, e2, () => db.query("insert into public.jobs (recruiter_id, title, whatsapp) values ($1, 'For another', '919999999999') returning id", [e1]));
    expect((await jobRow(rows[0].id)).recruiter_id).toBe(e2);
  });

  it('at most 20 ads can wait for approval at once', async () => {
    const busy = await addUser(db, 'busy@x.co', { company_name: 'Busy' });
    await db.query("insert into public.verification_requests (recruiter_id, license_number, file_path) values ($1, 'LIC-BUSY', $2)", [busy, `${busy}/license.jpg`]);
    await verify(busy);
    for (let i = 0; i < 20; i += 1) await insertAd(busy, `Waiting ${i}`);
    const err = await denied(insertAd(busy, 'One too many'));
    expect(err.code).toBe('53400');
  });

  it('an employer can withdraw (delete) an ad that is waiting for approval', async () => {
    const [{ id }] = (await insertAd(e2, 'Withdraw me')).rows;
    expect((await as(db, e2, () => db.query('delete from public.jobs where id = $1', [id]))).affectedRows).toBe(1);
  });

  it('an ad the admin adds for an employer keeps what the admin chose (no forced status or plan)', async () => {
    const { rows } = await as(db, admin, () => db.query(
      `insert into public.jobs (recruiter_id, title, status, whatsapp, country, city, category)
       values ($1, 'Admin made', 'live', '919999999999', 'uae', 'Dubai', 'plumber') returning id`, [e2]));
    expect(await jobRow(rows[0].id)).toMatchObject({ status: 'live', package_id: null });
  });
});

describe('27c. approving with days, and extending an ended ad', () => {
  const waiting = async () => (await insertAd(e2, `Wait ${++seq}`)).rows[0].id;
  const days = async (id) => Number((await rowsOf(db, 'select round(extract(epoch from (expires_at - starts_at)) / 86400) d from public.jobs where id = $1', [id]))[0].d);

  it('the admin chooses the days; with no choice the saved 30 days are used; 0 and 400 are refused', async () => {
    const a = await waiting();
    await adminDo('select public.admin_approve_job($1, 45)', [a]);
    expect(await days(a)).toBe(45);
    const b = await waiting();
    await adminDo('select public.admin_approve_job($1)', [b]);
    expect(await days(b)).toBe(30);
    const c = await waiting();
    await denied(adminDo('select public.admin_approve_job($1, 0)', [c]));
    await denied(adminDo('select public.admin_approve_job($1, 400)', [c]));
    await denied(as(db, e2, () => db.query('select public.admin_approve_job($1, 10)', [c])));
    expect((await jobRow(c)).status).toBe('paid_pending_review'); // nothing went live
  });

  it('an ended ad is not live; the admin extends it and it goes live again for the new days', async () => {
    const a = await waiting();
    await adminDo('select public.admin_approve_job($1, 5)', [a]);
    await db.query("update public.jobs set expires_at = now() - interval '2 days' where id = $1", [a]);
    await db.query('select public.expire_jobs()');
    expect((await jobRow(a)).status).toBe('expired');
    expect(await countOf(db, 'select * from public.public_jobs where id = $1', [a])).toBe(0);
    await denied(adminDo("select public.admin_extend_job($1, 10, 'x')", [a])); // a reason is needed
    await adminDo("select public.admin_extend_job($1, 10, 'Employer asked to run it again')", [a]);
    const row = await jobRow(a);
    expect(row.status).toBe('live');
    expect(await countOf(db, 'select * from public.public_jobs where id = $1', [a])).toBe(1);
    expect(Math.round((new Date(row.expires_at) - Date.now()) / 86400000)).toBe(10); // counted from now, not from the old end
  });

  it('extending keeps a hidden ad hidden, refuses ads that never went live, and only an admin can extend', async () => {
    const hidden = await waiting();
    await adminDo('select public.admin_approve_job($1, 5)', [hidden]);
    await adminDo('select public.admin_set_hidden($1, true)', [hidden]);
    await adminDo("select public.admin_extend_job($1, 3, 'More time')", [hidden]);
    expect((await jobRow(hidden)).status).toBe('hidden');
    const never = await waiting();
    await denied(adminDo("select public.admin_extend_job($1, 3, 'Too early')", [never]));
    await denied(as(db, e2, () => db.query("select public.admin_extend_job($1, 3, 'Me')", [hidden])));
  });
});
