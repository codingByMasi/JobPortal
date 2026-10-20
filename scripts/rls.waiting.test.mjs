// SECURITY TESTS, PART 16: an employer can edit an ad while it waits for approval, but nothing that matters is unlocked (migration 0031).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30; let pkg7;

const waitingAd = async (owner, title = 'Waiting ad') => (await db.query(
  `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp, status)
   values ($1, $2, $3, 'uae', 'Dubai', 'plumber', '919999999999', 'paid_pending_review') returning id`, [owner, pkg30, title])).rows[0].id;
const edit = (who, id, set, ...params) => as(db, who, () => db.query(`update public.jobs set ${set} where id = $1`, [id, ...params]));
const row = async (id) => (await rowsOf(db, 'select * from public.jobs where id = $1', [id]))[0];

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  pkg7 = (await rowsOf(db, "select id from public.packages where name = '7 Days'"))[0].id;
}, 120000);

describe('30. edit while waiting for approval (migration 0031)', () => {
  it('the employer can change the text of their own waiting ad', async () => {
    const id = await waitingAd(e1);
    expect((await edit(e1, id, "title = 'Better title', details = 'Salary 1800 AED'")).affectedRows).toBe(1);
    expect(await row(id)).toMatchObject({ title: 'Better title', details: 'Salary 1800 AED', status: 'paid_pending_review' });
  });

  it('but not the status, the dates, the plan, the price, the owner or the featured flag', async () => {
    const id = await waitingAd(e1);
    for (const set of ["status = 'live'", "starts_at = now()", "expires_at = now() + interval '30 days'", `package_id = '${pkg7}'`, 'final_price_paise = 99900', `recruiter_id = '${e2}'`, 'featured_override = true']) {
      await denied(edit(e1, id, set));
    }
    expect(await row(id)).toMatchObject({ status: 'paid_pending_review', recruiter_id: e1, starts_at: null, expires_at: null });
  });

  it('another employer cannot change it', async () => {
    const id = await waitingAd(e1);
    expect((await edit(e2, id, "title = 'Hijack'")).affectedRows).toBe(0);
    expect((await row(id)).title).toBe('Waiting ad');
  });

  it('once the admin approves, the employer can no longer edit it; a rejected ad is editable again', async () => {
    const id = await waitingAd(e1);
    await as(db, admin, () => db.query('select public.admin_approve_job($1, 10)', [id]));
    expect((await edit(e1, id, "title = 'Too late'")).affectedRows).toBe(0);
    const rejected = await waitingAd(e1, 'To reject');
    await as(db, admin, () => db.query("select public.admin_reject_job($1, 'Phone missing')", [rejected]));
    expect((await edit(e1, rejected, "title = 'Fixed'")).affectedRows).toBe(1);
  });

  it('a blocked employer cannot edit; hidden and ended ads stay locked', async () => {
    const id = await waitingAd(e2);
    await db.query('update public.profiles set blocked = true where id = $1', [e2]);
    expect((await edit(e2, id, "title = 'Blocked edit'")).affectedRows).toBe(0);
    await db.query('update public.profiles set blocked = false where id = $1', [e2]);
    for (const status of ['hidden', 'expired']) {
      const locked = await waitingAd(e1, `Locked ${status}`);
      await db.query('update public.jobs set status = $2 where id = $1', [locked, status]);
      expect((await edit(e1, locked, "title = 'Edited'")).affectedRows).toBe(0);
    }
  });
});
