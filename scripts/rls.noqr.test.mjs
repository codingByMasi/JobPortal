// SECURITY TESTS, PART 15: the QR picture and the payment proof are gone (migration 0030); the admin's payment tools still work.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let pkg30;

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('29. QR picture and payment proof removed (migration 0030)', () => {
  it('the proof table, its functions and the two storage buckets are gone', async () => {
    expect(await countOf(db, "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payment_proofs'")).toBe(0);
    expect(await countOf(db, "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('submit_payment_proof', 'admin_reject_proof')")).toBe(0);
    expect(await countOf(db, "select 1 from storage.buckets where id in ('shop-assets', 'payment-proofs')")).toBe(0);
    expect(await countOf(db, "select 1 from pg_policies where schemaname = 'storage' and (policyname like 'shop-assets%' or policyname like 'payment-proofs%')")).toBe(0);
  });

  it('the QR picture can no longer be saved as a setting; the other settings still work', async () => {
    await denied(as(db, admin, () => db.query('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ qr_path: 'qr/11111111-2222-3333-4444-555555555555.png' })])));
    await as(db, admin, () => db.query('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ contact_email: 'hello@example.com' })]));
    expect((await rowsOf(db, "select value from public.site_settings where key = 'contact_email'"))[0].value).toBe('hello@example.com');
  });

  it('"Mark as paid" still works for an ad that waits for payment (the admin tool is kept)', async () => {
    const job = (await db.query("insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp, status) values ($1, $2, 'Old ad', 'uae', 'Dubai', 'plumber', '919999999999', 'pending_payment') returning id", [e1, pkg30])).rows[0].id;
    await as(db, e1, () => db.query('select public.create_ad_order($1, $2, null)', [job, pkg30]));
    const [pay] = (await as(db, admin, () => db.query("select * from public.admin_mark_paid($1, null, 'ok', 'REF-NOQR-1')", [job]))).rows;
    expect(pay).toMatchObject({ status: 'paid', method: 'manual', reference: 'REF-NOQR-1' });
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [job]))[0].status).toBe('paid_pending_review');
  });

  it('only manual, free_offer and complimentary payments can be recorded (migration 0026)', async () => {
    const job = (await db.query("insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp) values ($1, $2, 'Method ad', 'uae', 'Dubai', 'plumber', '919999999999') returning id", [e1, pkg30])).rows[0].id;
    await denied(db.query("insert into public.payments (job_id, recruiter_id, amount_paise, method, status) values ($1, $2, 100, 'card', 'paid')", [job, e1]));
  });

  it('offers and the free ad still work (the admin tools are kept)', async () => {
    const job = (await db.query("insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp, status) values ($1, $2, 'Gift ad', 'uae', 'Dubai', 'plumber', '919999999999', 'pending_payment') returning id", [e1, pkg30])).rows[0].id;
    await as(db, e1, () => db.query('select public.create_ad_order($1, $2, null)', [job, pkg30]));
    await as(db, admin, () => db.query("select public.admin_give_free_ad($1, 'launch gift')", [job]));
    const [pay] = await rowsOf(db, "select method, amount_paise from public.payments where job_id = $1 and status = 'paid'", [job]);
    expect(pay).toEqual({ method: 'complimentary', amount_paise: 0 });
    const q = (await as(db, e1, () => db.query('select public.quote_price($1, null) as q', [pkg30]))).rows[0].q;
    expect(q.ok).toBe(true);
  });
});
