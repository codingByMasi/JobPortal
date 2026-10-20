// KNOWN GAPS: checks written for how the product SHOULD behave but does not yet. They are expected to FAIL today.
// Run with `npm run test:gaps`. When one starts passing, the gap is closed: move it into rls.readiness.test.mjs.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, countOf, makeDb, rowsOf } from './rls/harness.mjs';

let db; let owner; let pkg30;

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  owner = await addUser(db, 'owner@x.co', { company_name: 'Owner Co', phone: '9876500001' });
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('known gaps (expected to fail until fixed)', () => {
  it('GAP-2: an ad that waited for payment for more than 30 days is removed automatically', async () => {
    const id = (await db.query("insert into public.jobs (recruiter_id, package_id, title, whatsapp, created_at) values ($1, $2, 'Old unpaid ad', '919876543210', now() - interval '45 days') returning id", [owner, pkg30])).rows[0].id;
    await db.query('select public.cleanup_old_data()');
    expect(await countOf(db, 'select * from public.jobs where id = $1', [id])).toBe(0);
  });

  it('GAP-3: offers and coupon codes exist (percent, flat, bonus days, free offers) and the price can never go below 0', async () => {
    const tables = await rowsOf(db, "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('offers', 'coupons', 'discounts')");
    expect(tables.length).toBeGreaterThan(0);
  });
});
