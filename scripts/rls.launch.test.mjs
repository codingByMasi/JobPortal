// SECURITY TESTS, PART 4: launch hardening (migration 0017): apply flood limits, blocked contacts, error log, signup trigger.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30; let live1;

async function seedJob(owner, title, status, days = 10) {
  const { rows } = await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, status, starts_at, expires_at, whatsapp)
     values ($1, $2, $3, 'uae', 'Dubai', 'plumber', $4, now() - interval '1 day', now() + make_interval(days => $5::int), '919999999999') returning id`,
    [owner, pkg30, title, status, days],
  );
  return rows[0].id;
}

/** Runs `work` as `who` while the request carries the given visitor address (the way Supabase passes it on). */
async function withAddress(ip, who, work) {
  await db.query("select set_config('request.headers', $1, false)", [JSON.stringify(ip ? { 'x-forwarded-for': ip } : {})]);
  try {
    return await as(db, who, work);
  } finally {
    await db.query("select set_config('request.headers', '', false)");
  }
}

let phoneCounter = 1000;
const apply = (ip, jobId) => withAddress(ip, null, () => db.query("insert into public.applications (job_id, name, phone) values ($1, 'Visitor', $2)", [jobId, `98${String(phoneCounter++).padStart(8, '0')}`]));

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  await db.query('update public.profiles set verified = true where id = any($1)', [[e1, e2]]); // only verified employers can start an ad (migration 0027)
  live1 = await seedJob(e1, 'Live ad', 'live');
}, 120000);

describe('13. apply form flood limits (per visitor address)', () => {
  it('a visitor address can send 30 forms an hour, the 31st is refused with a clear code', async () => {
    for (let i = 0; i < 30; i += 1) await apply('203.0.113.7', live1);
    expect((await denied(apply('203.0.113.7', live1))).code).toBe('54001');
  });
  it('another address is not affected, and the first value of a forwarded list is the visitor', async () => {
    await expect(apply('198.51.100.9', live1)).resolves.toBeTruthy();
    await expect(apply('198.51.100.10, 10.0.0.1', live1)).resolves.toBeTruthy();
    await denied(apply('203.0.113.7, 10.0.0.2', live1)); // same visitor behind a proxy list
  });
  it('without an address (SQL editor, system) nothing is limited, and no address is stored in plain', async () => {
    await expect(apply(null, live1)).resolves.toBeTruthy();
    const stored = await rowsOf(db, 'select client_hash from public.applications where client_hash is not null limit 3');
    for (const r of stored) {
      expect(r.client_hash).toMatch(/^[0-9a-f]{32}$/);
      expect(r.client_hash).not.toContain('203.0.113');
    }
  });
  it('after an hour the visitor can send again, but a day limit of 100 still holds', async () => {
    await db.query("update public.applications set created_at = now() - interval '2 hours' where client_hash is not null");
    await expect(apply('203.0.113.7', live1)).resolves.toBeTruthy();
    const [{ client_hash: mine }] = await rowsOf(db, 'select client_hash from public.applications where client_hash is not null order by created_at desc limit 1');
    await db.query("insert into public.applications (job_id, name, phone, created_at) select $1, 'Old', '97' || lpad(n::text, 8, '0'), now() - interval '5 hours' from generate_series(1, 100) n", [live1]);
    await db.query("update public.applications set client_hash = $1 where name = 'Old'", [mine]); // the trigger stamps new rows itself, so set the older ones afterwards
    expect((await denied(apply('203.0.113.7', live1))).code).toBe('54001');
  });
  it('visitors cannot call the address function', async () => {
    await denied(as(db, null, () => db.query('select public.request_client_hash()')));
  });
});

describe('14. blocked contacts', () => {
  it('blocking an employer remembers their phone and the WhatsApp numbers of their ads', async () => {
    await db.query("update public.profiles set blocked = true where id = $1", [e2]);
    const numbers = (await rowsOf(db, 'select phone_last10 from public.blocked_contacts order by 1')).map((r) => r.phone_last10);
    expect(numbers).toContain('9876500002');
  });
  it('someone else cannot post an ad with a banned number, but can with another number', async () => {
    const ins = (n) => as(db, e1, () => db.query("insert into public.jobs (package_id, title, whatsapp) values ($1, 'Banned number', $2)", [pkg30, n]));
    await denied(ins('919876500002'));
    await denied(ins('9876500002'));
    await expect(ins('919876511111')).resolves.toBeTruthy();
  });
  it('a new login with a banned phone starts as blocked', async () => {
    const comeback = await addUser(db, 'comeback@x.co', { company_name: 'New Name', phone: '+91 98765 00002' });
    expect((await rowsOf(db, 'select blocked from public.profiles where id = $1', [comeback]))[0].blocked).toBe(true);
    const fine = await addUser(db, 'fine@x.co', { company_name: 'Fine Co', phone: '9811100000' });
    expect((await rowsOf(db, 'select blocked from public.profiles where id = $1', [fine]))[0].blocked).toBe(false);
  });
  it('unblocking forgets the number; only admins can read or change the list', async () => {
    await denied(as(db, e1, () => db.query("insert into public.blocked_contacts (phone_last10) values ('1111111111')")));
    expect(await as(db, e1, () => countOf(db, 'select * from public.blocked_contacts'))).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.blocked_contacts'))).toBeGreaterThan(0);
    await db.query('update public.profiles set blocked = false where id = $1', [e2]);
    expect((await rowsOf(db, "select count(*)::int n from public.blocked_contacts where phone_last10 = '9876500002'"))[0].n).toBe(0);
  });
});

describe('15. error log', () => {
  const log = (who, msg, page = '/jobs') => as(db, who, () => db.query('select public.log_client_error($1, $2, $3)', [msg, page, 'TestBrowser/1']));
  it('anyone can report a crash; the same crash on the same page is counted, not repeated', async () => {
    await log(null, 'TypeError: x is undefined');
    await log(null, 'TypeError: x is undefined');
    await log(e1, 'TypeError: x is undefined');
    const [row] = await rowsOf(db, "select times, page from public.error_log where message = 'TypeError: x is undefined'");
    expect(row).toEqual({ times: 3, page: '/jobs' });
  });
  it('texts are cut short, empty reports are ignored', async () => {
    await log(null, 'x'.repeat(1000), 'p'.repeat(500));
    const [row] = await rowsOf(db, "select length(message) m, length(page) p from public.error_log where message like 'xxxx%'");
    expect(row).toEqual({ m: 300, p: 200 });
    await log(null, '   ');
    expect(await countOf(db, "select * from public.error_log where btrim(message) = ''")).toBe(0);
  });
  it('at most 300 new lines a day, so the log cannot be used to fill the database', async () => {
    await db.query("insert into public.error_log (message, page) select 'filler ' || n, '/x' from generate_series(1, 300) n");
    const before = await countOf(db, 'select * from public.error_log');
    await log(null, 'one more new problem');
    expect(await countOf(db, 'select * from public.error_log')).toBe(before);
  });
  it('visitors and employers cannot read or change the log; the admin can, and the clean-up removes old lines', async () => {
    await denied(as(db, null, () => db.query('select * from public.error_log')));
    expect(await as(db, e1, () => countOf(db, 'select * from public.error_log'))).toBe(0);
    await denied(as(db, e1, () => db.query("insert into public.error_log (message) values ('fake')")));
    expect((await as(db, e1, () => db.query('delete from public.error_log'))).affectedRows).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.error_log'))).toBeGreaterThan(300);
    await db.query("update public.error_log set last_at = now() - interval '40 days'");
    await db.query('select public.cleanup_old_data()');
    expect(await countOf(db, 'select * from public.error_log')).toBe(0);
  });
});

describe('16. the signup trigger still works after the checker fixes', () => {
  it('creates an employer profile, whatever the signup data says', async () => {
    const u = await addUser(db, 'signup@x.co', { company_name: 'Signup Co', ra_number: 'B-9', role: 'admin' });
    expect((await rowsOf(db, 'select role, ra_number from public.profiles where id = $1', [u]))[0]).toEqual({ role: 'recruiter', ra_number: 'B-9' });
  });
});
