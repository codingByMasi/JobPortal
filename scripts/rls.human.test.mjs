// SECURITY TESTS, PART 20: the optional human check on the Apply and Report forms (migration 0036).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let owner; let pkg30; let job;

const setRule = (value) => db.query("update public.app_settings set value = $1 where key = 'require_human'", [value]);
const newPass = async (ageMinutes = 0) => (await db.query("insert into public.human_passes (created_at) values (now() - make_interval(mins => $1::int)) returning id", [ageMinutes])).rows[0].id;
const apply = (who, phone, pass = null) => as(db, who, () => db.query(
  'insert into public.applications (job_id, name, phone, city, message, human_pass) values ($1, $2, $3, $4, $5, $6)', [job, 'Seeker', phone, 'Delhi', 'Hello', pass]));
const report = (who, pass = null, reason = 'other') => as(db, who, () => db.query(
  'insert into public.reports (job_id, reason, message, contact, human_pass) values ($1, $2, $3, $4, $5)', [job, reason, 'x', '', pass]));
const passRow = async (id) => (await rowsOf(db, 'select * from public.human_passes where id = $1', [id]))[0];

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co') on conflict (key) do nothing");
  owner = await addUser(db, 'owner@x.co', { company_name: 'Gulf Works', phone: '9876500001' });
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  job = (await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, company, country, city, category, whatsapp, status, starts_at, expires_at)
     values ($1, $2, 'Live ad', 'Gulf Works', 'uae', 'Dubai', 'plumber', '919999999999', 'live', now() - interval '1 day', now() + interval '20 days') returning id`, [owner, pkg30])).rows[0].id;
}, 120000);

describe('36. human check on forms (migration 0036)', () => {
  it('is off by default: forms work with no pass, and a pass sent along is never stored', async () => {
    expect((await rowsOf(db, "select value from public.app_settings where key = 'require_human'"))[0].value).toBe('off');
    await apply(null, '9800000001');
    await report(null);
    const pass = await newPass();
    await apply(null, '9800000002', pass);
    expect(await countOf(db, 'select * from public.applications where human_pass is not null')).toBe(0);
    expect((await passRow(pass)).used_at).toBeNull(); // off: the pass is not even looked at
  });

  it('when on, an application without a pass, with an unknown pass, or with an old pass is refused', async () => {
    await setRule('on');
    const before = await countOf(db, 'select * from public.applications');
    const error = await denied(apply(null, '9800000010'));
    expect(error.message).toMatch(/human check/i);
    await denied(apply(null, '9800000011', '00000000-0000-4000-8000-000000000000'));
    await denied(apply(null, '9800000012', await newPass(11))); // older than 10 minutes
    expect(await countOf(db, 'select * from public.applications')).toBe(before);
  });

  it('when on, a fresh pass works once: the same pass cannot be used again, and it is not kept in the row', async () => {
    const pass = await newPass(2);
    await apply(null, '9800000020', pass);
    expect((await passRow(pass)).used_at).not.toBeNull();
    await denied(apply(null, '9800000021', pass));
    expect(await countOf(db, "select * from public.applications where phone = '9800000020' and human_pass is null")).toBe(1);
  });

  it('a form that fails its other rules does not use up the pass (a wrong phone repeat, then the same pass for a new phone)', async () => {
    const pass = await newPass();
    await denied(apply(null, '9800000020', pass)); // this phone already applied: refused by the existing rule
    expect((await passRow(pass)).used_at).toBeNull();
    await apply(null, '9800000022', pass);
    expect((await passRow(pass)).used_at).not.toBeNull();
  });

  it('the same gate guards the report form', async () => {
    await denied(report(null));
    await denied(report(null, '00000000-0000-4000-8000-000000000000'));
    const pass = await newPass();
    await report(null, pass);
    expect((await passRow(pass)).used_at).not.toBeNull();
    expect(await countOf(db, 'select * from public.reports where human_pass is not null')).toBe(0);
    await denied(report(null, pass)); // used up (and one report per ad per visitor anyway)
  });

  it('logged-in people are checked the same way; switching the rule off lets forms through again', async () => {
    await denied(apply(owner, '9800000030'));
    await setRule('off');
    await apply(owner, '9800000030');
    await setRule('on');
    await denied(apply(null, '9800000031'));
    await setRule('off');
  });

  it('nobody can read or write the passes, or call the helper functions', async () => {
    for (const who of [null, owner]) {
      await denied(as(db, who, () => db.query('select * from public.human_passes')));
      await denied(as(db, who, () => db.query('insert into public.human_passes default values')));
      await denied(as(db, who, () => db.query("select public.human_check('00000000-0000-4000-8000-000000000000')")));
      await denied(as(db, who, () => db.query('select public.purge_human_passes()')));
      await denied(as(db, who, () => db.query("update public.app_settings set value = 'on' where key = 'require_human'")));
    }
  });

  it('the daily clean-up removes passes older than a day and keeps fresh ones', async () => {
    await db.query("insert into public.human_passes (created_at) values (now() - interval '2 days')");
    const fresh = await newPass();
    await db.query('select public.purge_human_passes()');
    expect(await countOf(db, "select * from public.human_passes where created_at < now() - interval '1 day'")).toBe(0);
    expect(await passRow(fresh)).toBeTruthy();
  });
});
