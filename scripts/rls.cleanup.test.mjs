// SECURITY TESTS, PART 7: the daily clean-up of ads that were never paid (migration 0019).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, countOf, makeDb, rowsOf } from './rls/harness.mjs';

let db; let owner; let pkg30;
const addJob = async (status, days) => (await db.query(
  `insert into public.jobs (recruiter_id, package_id, title, whatsapp, status, created_at) values ($1, $2, 'Ad', '919876543210', $3, now() - make_interval(days => $4::int)) returning id`,
  [owner, pkg30, status, days])).rows[0].id;

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  owner = await addUser(db, 'owner@x.co', { company_name: 'Owner Co', phone: '9876500001' });
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('21. clean-up of unpaid ads', () => {
  it('removes unpaid ads older than 30 days, with their waiting payment, and keeps everything else', async () => {
    const old = await addJob('pending_payment', 45);
    const fresh = await addJob('pending_payment', 5);
    const paidOld = await addJob('paid_pending_review', 45);
    await db.query("insert into public.payments (job_id, recruiter_id, amount_paise, method, status) values ($1, $2, 100, 'manual', 'created')", [old, owner]);
    await db.query('select public.cleanup_old_data()');
    expect(await countOf(db, 'select 1 from public.jobs where id = $1', [old])).toBe(0);
    expect(await countOf(db, 'select 1 from public.payments where job_id = $1', [old])).toBe(0);
    expect(await countOf(db, 'select 1 from public.jobs where id = any($1)', [[fresh, paidOld]])).toBe(2);
  });
});
