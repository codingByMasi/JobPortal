// SECURITY TESTS, PART 12: only a verified employer (or an admin) can start a new ad (migration 0027).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let newbie; let pkg30;

const insertAd = (who, owner, title = 'My ad') => as(db, who, () => db.query(
  `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp)
   values ($1, $2, $3, 'uae', 'Dubai', 'plumber', '919999999999') returning id`, [owner, pkg30, title]));

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  newbie = await addUser(db, 'new@x.co', { company_name: 'New Agency', phone: '9876500009' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('26. verified to post (migration 0027)', () => {
  it('an unverified employer cannot start an ad', async () => {
    const err = await denied(insertAd(newbie, newbie));
    expect(err.message).toMatch(/not verified/i);
    expect(await countOf(db, 'select * from public.jobs where recruiter_id = $1', [newbie])).toBe(0);
  });

  it('an admin can add an ad for an unverified employer', async () => {
    await insertAd(admin, newbie, 'Added by admin');
    expect(await countOf(db, 'select * from public.jobs where recruiter_id = $1', [newbie])).toBe(1);
  });

  it('an unverified employer keeps what they already have: edit and order still work', async () => {
    const [ad] = await rowsOf(db, 'select id from public.jobs where recruiter_id = $1', [newbie]);
    await as(db, newbie, () => db.query("update public.jobs set title = 'Changed by owner' where id = $1", [ad.id]));
    expect((await rowsOf(db, 'select title from public.jobs where id = $1', [ad.id]))[0].title).toBe('Changed by owner');
    await as(db, newbie, () => db.query('select public.create_ad_order($1, $2, null)', [ad.id, pkg30]));
  });

  it('once the admin verifies them they can start an ad; if they lose the tag they cannot again', async () => {
    await db.query('update public.profiles set verified = true where id = $1', [newbie]);
    await insertAd(newbie, newbie, 'Now allowed');
    expect(await countOf(db, 'select * from public.jobs where recruiter_id = $1', [newbie])).toBe(2);
    await db.query('update public.profiles set verified = false where id = $1', [newbie]);
    await denied(insertAd(newbie, newbie, 'Blocked again'));
  });

  it('an employer cannot verify themselves', async () => {
    await as(db, newbie, () => db.query('update public.profiles set verified = true where id = $1', [newbie])).catch(() => {});
    expect((await rowsOf(db, 'select verified from public.profiles where id = $1', [newbie]))[0].verified).toBe(false);
    await denied(insertAd(newbie, newbie, 'Still blocked'));
  });
});
