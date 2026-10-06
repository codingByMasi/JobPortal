// SECURITY TESTS, PART 3: the admin two-step login (migration 0013).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb } from './rls/harness.mjs';

let db;
let admin; let employer; let job;

/** Runs `work` as `who` with a login token of the given level (aal1 = password only, aal2 = password + authenticator app). */
async function asWithLevel(who, aal, work) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ aal })]);
  try {
    return await as(db, who, work);
  } finally {
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

beforeAll(async () => {
  db = await makeDb();
  admin = await addUser(db, 'admin@x.co');
  employer = await addUser(db, 'e@x.co', { company_name: 'Employer' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  const pkg = (await db.query("select id from public.packages where name = '30 Days'")).rows[0].id;
  job = (await db.query("insert into public.jobs (recruiter_id, package_id, title, whatsapp, status) values ($1, $2, 'Waiting ad', '919999999999', 'paid_pending_review') returning id", [employer, pkg])).rows[0].id;
}, 120000);

const isAdminNow = (who, aal) => asWithLevel(who, aal, async () => (await db.query('select public.is_admin() a')).rows[0].a);

describe('10. admin two-step login', () => {
  it('an admin who has not turned it on works as before (no lock-out while setting it up)', async () => {
    expect(await isAdminNow(admin, 'aal1')).toBe(true);
    expect(await asWithLevel(admin, 'aal1', () => countOf(db, 'select * from public.jobs'))).toBeGreaterThan(0);
  });
  it('an unfinished set-up (factor not verified) does not count', async () => {
    await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')", [admin]);
    expect(await isAdminNow(admin, 'aal1')).toBe(true);
    await db.query('delete from auth.mfa_factors');
  });
  it('once the authenticator app is on, a password-only login is NOT an admin; password + code is', async () => {
    await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [admin]);
    expect(await isAdminNow(admin, 'aal1')).toBe(false);
    expect(await isAdminNow(admin, 'aal2')).toBe(true);
  });
  it('a password-only login then cannot read, approve or change anything an admin could', async () => {
    expect(await asWithLevel(admin, 'aal1', () => countOf(db, 'select * from public.jobs'))).toBe(0);
    await denied(asWithLevel(admin, 'aal1', () => db.query('select public.admin_approve_job($1)', [job])));
    await expect(asWithLevel(admin, 'aal2', () => db.query('select public.admin_approve_job($1)', [job]))).resolves.toBeTruthy();
  });
  it('a factor of someone else does not change anything for an employer, and employers are never admins', async () => {
    expect(await isAdminNow(employer, 'aal2')).toBe(false);
    expect(await isAdminNow(null, 'aal2')).toBe(false);
  });
});
