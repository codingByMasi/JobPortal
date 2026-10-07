// SECURITY TESTS, PART 8: job facts, reports, deletion requests, public counters, registration number (migration 0020).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db; let admin; let e1; let e2; let pkg30; let live1; let pending1;

async function seedJob(owner, status) {
  const { rows } = await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, status, starts_at, expires_at, whatsapp)
     values ($1, $2, 'Ad', 'uae', 'Dubai', 'plumber', $3, now() - interval '1 day', now() + interval '10 days', '919999999999') returning id`, [owner, pkg30, status]);
  return rows[0].id;
}
async function withAddress(ip, who, work) {
  await db.query("select set_config('request.headers', $1, false)", [JSON.stringify(ip ? { 'x-forwarded-for': ip } : {})]);
  try { return await as(db, who, work); } finally { await db.query("select set_config('request.headers', '', false)"); }
}
const report = (ip, job, reason = 'asked_money', who = null) => withAddress(ip, who, () => db.query('insert into public.reports (job_id, reason, message) values ($1, $2, $3)', [job, reason, 'They asked for 5000 rupees']));
const request = (ip, email, who = null) => withAddress(ip, who, () => db.query('insert into public.deletion_requests (email, note) values ($1, $2)', [email, 'please delete']));
const countFor = (who, sql) => as(db, who, async () => { try { return (await db.query(sql)).rows.length; } catch { return 0; } });

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  live1 = await seedJob(e1, 'live');
  pending1 = await seedJob(e1, 'pending_payment');
}, 120000);

describe('22. job facts', () => {
  it('saves salary, experience, vacancies, last date and visa; the public list shows them', async () => {
    await db.query("update public.jobs set salary_min = 1500, salary_max = 2200, currency = 'AED', experience_level = '2-5', vacancies = 12, last_date = current_date + 20, visa_type = 'Employment visa' where id = $1", [live1]);
    const rows = await as(db, null, async () => (await db.query('select * from public.public_jobs where id = $1', [live1])).rows);
    expect(rows[0]).toMatchObject({ salary_min: 1500, salary_max: 2200, currency: 'AED', experience_level: '2-5', vacancies: 12, visa_type: 'Employment visa' });
  });
  it('refuses wrong values: salary order, currency, experience, vacancies, negative salary, currency without salary', async () => {
    const wrong = ['salary_min = 3000, salary_max = 2000', "salary_min = 1000, currency = 'XXX'", "experience_level = '10+'", 'vacancies = 0', 'vacancies = 100000', 'salary_min = -5', "currency = 'AED'", "visa_type = repeat('x', 41)"];
    for (const set of wrong) await denied(db.query(`update public.jobs set ${set} where id = $1`, [pending1]));
  });
  it('an employer can set the facts on their own waiting ad, not on another employer ad', async () => {
    await as(db, e1, () => db.query("update public.jobs set salary_min = 900, salary_max = 1200, currency = 'SAR', experience_level = 'fresher' where id = $1", [pending1]));
    expect(await as(db, e2, async () => (await db.query('update public.jobs set vacancies = 3 where id = $1 returning id', [pending1])).rows.length)).toBe(0);
  });
  it('an employer cannot edit the facts of a live (paid) ad', async () => {
    expect(await as(db, e1, async () => (await db.query('update public.jobs set vacancies = 99 where id = $1 returning id', [live1])).rows.length)).toBe(0);
  });
  it('the registration number is public only for a verified employer', async () => {
    await db.query("update public.profiles set ra_number = 'B-1234/DEL/2020' where id = $1", [e1]);
    const read = async () => (await as(db, null, async () => (await db.query('select recruiter_ra_number, recruiter_verified from public.public_jobs where id = $1', [live1])).rows))[0];
    expect(await read()).toMatchObject({ recruiter_ra_number: null, recruiter_verified: false });
    await db.query('update public.profiles set verified = true where id = $1', [e1]);
    expect(await read()).toMatchObject({ recruiter_ra_number: 'B-1234/DEL/2020', recruiter_verified: true });
  });
  it('an employer cannot verify themselves', async () => {
    await denied(as(db, e2, () => db.query('update public.profiles set verified = true where id = $1', [e2])));
  });
});

describe('23. reports', () => {
  it('a visitor can report a live ad; it is saved as open with a scrambled address only', async () => {
    await report('203.0.113.1', live1);
    const [r] = await rowsOf(db, 'select status, client_hash from public.reports');
    expect(r.status).toBe('open');
    expect(r.client_hash).toMatch(/^[0-9a-f]{32}$/);
  });
  it('the same address cannot report the same ad twice; another address can', async () => {
    await denied(report('203.0.113.1', live1));
    await report('203.0.113.2', live1);
  });
  it('cannot report an ad that is not live, or with a wrong reason; ten an hour at most', async () => {
    await denied(report('198.51.100.1', pending1));
    await denied(report('198.51.100.1', live1, 'hate'));
    const jobs = [];
    for (let i = 0; i < 10; i += 1) jobs.push(await seedJob(e1, 'live'));
    for (const j of jobs) await report('198.51.100.7', j);
    expect((await denied(report('198.51.100.7', live1))).code).toBe('54001');
  });
  it('visitors and employers cannot read or change reports; the admin can', async () => {
    expect(await countFor(null, 'select * from public.reports')).toBe(0);
    expect(await countFor(e1, 'select * from public.reports')).toBe(0);
    expect(await countFor(e1, "update public.reports set status = 'done' returning id")).toBe(0);
    expect(await countFor(admin, 'select * from public.reports')).toBeGreaterThan(1);
    expect(await countFor(admin, "update public.reports set status = 'done' where id = (select id from public.reports limit 1) returning id")).toBe(1);
  });
  it('deleting an ad removes its reports', async () => {
    const j = await seedJob(e2, 'live');
    await report('192.0.2.5', j);
    await db.query('delete from public.jobs where id = $1', [j]);
    expect(await countOf(db, 'select 1 from public.reports where job_id = $1', [j])).toBe(0);
  });
});

describe('24. account deletion requests', () => {
  it('anyone can ask; the email is cleaned; a second open request for the same email is refused', async () => {
    await request('203.0.113.50', ' Person@Example.COM ');
    const [r] = await rowsOf(db, 'select email, status from public.deletion_requests');
    expect(r).toEqual({ email: 'person@example.com', status: 'open' });
    await denied(request('203.0.113.51', 'person@example.com'));
  });
  it('refuses a text that is not an email, and more than 5 a day from one address', async () => {
    await denied(request('203.0.113.60', 'not-an-email'));
    for (let i = 0; i < 5; i += 1) await request('203.0.113.61', `p${i}@example.com`);
    expect((await denied(request('203.0.113.61', 'p9@example.com'))).code).toBe('54001');
  });
  it('only the admin can read or change them', async () => {
    expect(await countFor(e1, 'select * from public.deletion_requests')).toBe(0);
    expect(await countFor(null, 'select * from public.deletion_requests')).toBe(0);
    expect(await countFor(admin, 'select * from public.deletion_requests')).toBeGreaterThan(0);
  });
});

describe('25. public counters', () => {
  it('a visitor can read three numbers and nothing private', async () => {
    const c = await as(db, null, async () => (await db.query('select public.public_counts() as c')).rows[0].c);
    expect(Object.keys(c).sort()).toEqual(['applications', 'live_ads', 'verified_recruiters']);
    expect(c.live_ads).toBeGreaterThan(0);
    expect(c.verified_recruiters).toBe(1);
  });
  it('a blocked employer is not counted as verified', async () => {
    await db.query('update public.profiles set blocked = true where id = $1', [e1]);
    expect((await as(db, null, async () => (await db.query('select public.public_counts() as c')).rows[0].c)).verified_recruiters).toBe(0);
    await db.query('update public.profiles set blocked = false where id = $1', [e1]);
  });
});
