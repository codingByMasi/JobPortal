// SECURITY TESTS, PART 14: the public list of verified agencies (migration 0029).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let good; let unverified; let blocked; let nameless; let pkg30;

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co', { company_name: 'Admin Co' });
  good = await addUser(db, 'good@x.co', { company_name: 'Good Agency', phone: '9876500001', ra_number: ' B-1234/DEL/2020 ' });
  unverified = await addUser(db, 'new@x.co', { company_name: 'New Agency', phone: '9876500002' });
  blocked = await addUser(db, 'blocked@x.co', { company_name: 'Blocked Agency', phone: '9876500003' });
  nameless = await addUser(db, 'nameless@x.co', { company_name: '', phone: '9876500004' });
  await db.query("update public.profiles set role = 'admin', verified = true where id = $1", [admin]);
  await db.query('update public.profiles set verified = true where id = any($1)', [[good, blocked, nameless]]);
  await db.query('update public.profiles set blocked = true where id = $1', [blocked]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  const ad = (title, status, ends) => db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp, status, starts_at, expires_at)
     values ($1, $2, $3, 'uae', 'Dubai', 'plumber', '919999999999', $4, now() - interval '1 day', now() + make_interval(days => $5::int))`, [good, pkg30, title, status, ends]);
  await ad('Live one', 'live', 10);
  await ad('Live two', 'live', 10);
  await ad('Ended', 'live', -2); // the end time passed
  await ad('Waiting', 'paid_pending_review', 10);
}, 120000);

const list = (who) => as(db, who, () => db.query('select * from public.verified_agencies')).then((r) => r.rows);

describe('28. verified agencies list (migration 0029)', () => {
  it('visitors and employers see only verified, unblocked, named employers; never admins', async () => {
    for (const who of [null, unverified, good]) {
      const rows = await list(who);
      expect(rows.map((r) => r.company_name)).toEqual(['Good Agency']);
    }
  });

  it('shows the company, the trimmed registration number and only the ads that are live right now', async () => {
    const [row] = await list(null);
    expect(row).toEqual({ company_name: 'Good Agency', ra_number: 'B-1234/DEL/2020', live_ads: 2 });
  });

  it('carries no phone, email, id or license: only three columns', async () => {
    const [row] = await list(null);
    expect(Object.keys(row).sort()).toEqual(['company_name', 'live_ads', 'ra_number']);
  });

  it('an employer who loses the verified tag or is blocked leaves the list', async () => {
    await db.query('update public.profiles set verified = false where id = $1', [good]);
    expect(await list(null)).toEqual([]);
    await db.query('update public.profiles set verified = true where id = $1', [good]);
    await db.query('update public.profiles set blocked = true where id = $1', [good]);
    expect(await list(null)).toEqual([]);
    await db.query('update public.profiles set blocked = false where id = $1', [good]);
    expect((await list(null)).length).toBe(1);
  });
});
