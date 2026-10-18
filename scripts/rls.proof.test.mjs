// SECURITY TESTS, PART 11: the admin's QR picture and the employer's payment proof (migration 0024).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30;
let seq = 0;

const putObject = (bucket, name, owner) => db.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [bucket, name, owner]);
const proofFile = async (owner) => {
  seq += 1;
  const name = `${owner}/proof-${seq}.jpg`;
  await putObject('payment-proofs', name, owner);
  return name;
};
async function newAd(owner) {
  const job = (await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp)
     values ($1, $2, 'Ad', 'uae', 'Dubai', 'plumber', '919999999999') returning id`, [owner, pkg30])).rows[0].id;
  await as(db, owner, () => db.query('select public.create_ad_order($1, $2, null)', [job, pkg30]));
  return job;
}
const submit = (who, job, ref, file) => as(db, who, () => db.query('select * from public.submit_payment_proof($1, $2, $3)', [job, ref, file]));
const adminDo = (sql, params) => as(db, admin, () => db.query(sql, params));

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('24a. the admin QR picture', () => {
  const QR = 'qr/11111111-2222-3333-4444-555555555555.png';
  it('the buckets exist with the right limits', async () => {
    const [shop] = await rowsOf(db, "select * from storage.buckets where id = 'shop-assets'");
    const [proofs] = await rowsOf(db, "select * from storage.buckets where id = 'payment-proofs'");
    expect(shop.public).toBe(true);
    expect(Number(shop.file_size_limit)).toBe(1048576);
    expect(proofs.public).toBe(false);
    expect(proofs.allowed_mime_types).toContain('application/pdf');
    expect(shop.allowed_mime_types).not.toContain('application/pdf');
  });

  it('only an admin can put a picture in shop-assets or remove it', async () => {
    await denied(as(db, e1, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('shop-assets', $1, $2)", [QR, e1])));
    await denied(as(db, null, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('shop-assets', $1, null)", [QR])));
    await as(db, admin, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('shop-assets', $1, $2)", [QR, admin]));
    await as(db, e1, () => db.query("delete from storage.objects where bucket_id = 'shop-assets'")).catch(() => {});
    expect(await countOf(db, "select * from storage.objects where bucket_id = 'shop-assets'")).toBe(1);
  });

  it('only an admin can save qr_path, and only for a file that exists in shop-assets', async () => {
    await denied(as(db, e1, () => db.query('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ qr_path: QR })])));
    await denied(adminDo('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ qr_path: 'qr/99999999-2222-3333-4444-555555555555.png' })])); // no such file
    await denied(adminDo('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ qr_path: 'https://evil.example/qr.png' })]));
    await denied(adminDo('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ qr_path: '../job-files/x.png' })]));
    await adminDo('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ qr_path: QR })]);
    expect((await rowsOf(db, "select value from public.site_settings where key = 'qr_path'"))[0].value).toBe(QR);
    expect(await countOf(db, "select * from public.admin_log where action = 'save_settings' and detail like '%qr_path%'")).toBe(1);
  });

  it('logged-in people can read qr_path; visitors cannot; and it can be removed', async () => {
    expect(await as(db, e1, () => countOf(db, "select * from public.site_settings where key = 'qr_path'"))).toBe(1);
    expect(await as(db, null, () => countOf(db, "select * from public.site_settings where key = 'qr_path'"))).toBe(0);
    await adminDo('select public.admin_save_settings($1::jsonb)', [JSON.stringify({ qr_path: '' })]);
    expect((await rowsOf(db, "select value from public.site_settings where key = 'qr_path'"))[0].value).toBe('');
  });
});

describe('24b. payment proof', () => {
  it('an employer sends a proof for their own waiting ad; the reference is cleaned up', async () => {
    const job = await newAd(e1);
    const file = await proofFile(e1);
    const [p] = (await submit(e1, job, ' 4021 5678-90ab ', file)).rows;
    expect(p).toMatchObject({ job_id: job, reference: '4021567890AB', status: 'submitted', file_path: file });
  });

  it('refuses someone else\'s ad, a file in another folder, a missing file, a bad reference, and an ad that is not waiting', async () => {
    const job = await newAd(e1);
    await denied(submit(e2, job, 'UTR123456789', await proofFile(e2)));
    await denied(submit(e1, job, 'UTR123456789', await proofFile(e2)));       // someone else's file
    await denied(submit(e1, job, 'UTR123456789', `${e1}/not-uploaded.jpg`)); // no such file
    await denied(submit(e1, job, '123', await proofFile(e1)));               // too short
    await denied(submit(null, job, 'UTR123456789', await proofFile(e1)));
    const paidJob = await newAd(e1);
    await adminDo('select public.admin_mark_paid($1)', [paidJob]);
    await denied(submit(e1, paidJob, 'UTR987654321', await proofFile(e1)));
    expect(await countOf(db, 'select * from public.payment_proofs where job_id = $1', [job])).toBe(0);
  });

  it('one reference number cannot back two ads, or an already recorded payment', async () => {
    const a = await newAd(e1);
    const b = await newAd(e2);
    await submit(e1, a, 'SAME000111', await proofFile(e1));
    await denied(submit(e2, b, 'same000111', await proofFile(e2)));
    const c = await newAd(e1);
    await adminDo("select public.admin_mark_paid($1, null, '', 'USEDREF999')", [c]);
    await denied(submit(e2, b, 'usedref999', await proofFile(e2)));
  });

  it('sending again replaces the proof and clears an old rejection', async () => {
    const job = await newAd(e1);
    const [first] = (await submit(e1, job, 'FIRST000AAA', await proofFile(e1))).rows;
    await adminDo('select public.admin_reject_proof($1, $2)', [first.id, 'No money found']);
    expect((await rowsOf(db, 'select status, reject_reason from public.payment_proofs where id = $1', [first.id]))[0]).toEqual({ status: 'rejected', reject_reason: 'No money found' });
    const [again] = (await submit(e1, job, 'SECOND00BBB', await proofFile(e1))).rows;
    expect(again).toMatchObject({ id: first.id, reference: 'SECOND00BBB', status: 'submitted', reject_reason: null });
    expect(await countOf(db, 'select * from public.payment_proofs where job_id = $1', [job])).toBe(1);
  });

  it('a rejected reference can be used again by another proof', async () => {
    const a = await newAd(e1);
    const b = await newAd(e2);
    const [pa] = (await submit(e1, a, 'REUSE00CCC', await proofFile(e1))).rows;
    await adminDo('select public.admin_reject_proof($1, $2)', [pa.id, 'Wrong amount']);
    await submit(e2, b, 'REUSE00CCC', await proofFile(e2));
  });

  it('only an admin rejects, with a reason, and only a proof that is waiting', async () => {
    const job = await newAd(e1);
    const [p] = (await submit(e1, job, 'REJECT00DDD', await proofFile(e1))).rows;
    await denied(as(db, e1, () => db.query("select public.admin_reject_proof($1, 'nope')", [p.id])));
    await denied(adminDo("select public.admin_reject_proof($1, '  ')", [p.id]));
    await adminDo("select public.admin_reject_proof($1, 'Amount is less')", [p.id]);
    await denied(adminDo("select public.admin_reject_proof($1, 'again')", [p.id]));
    expect(await countOf(db, "select * from public.admin_log where action = 'reject_proof' and target_id = $1", [p.id])).toBe(1);
  });

  it('marking the ad paid accepts its proof; the employer sees only their own proofs; nobody writes the table directly', async () => {
    const job = await newAd(e1);
    const other = await newAd(e2);
    const [p] = (await submit(e1, job, 'ACCEPT00EEE', await proofFile(e1))).rows;
    await submit(e2, other, 'OTHER000FFF', await proofFile(e2));
    await adminDo("select public.admin_mark_paid($1, null, '', 'ACCEPT00EEE')", [job]);
    expect((await rowsOf(db, 'select status from public.payment_proofs where id = $1', [p.id]))[0].status).toBe('accepted');
    expect(await as(db, e1, () => countOf(db, 'select * from public.payment_proofs where job_id = $1', [other]))).toBe(0);
    expect(await as(db, e1, () => countOf(db, 'select * from public.payment_proofs where job_id = $1', [job]))).toBe(1);
    expect(await as(db, null, () => countOf(db, 'select * from public.payment_proofs')).catch(() => 0)).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.payment_proofs'))).toBeGreaterThan(2);
    await denied(as(db, e1, () => db.query("update public.payment_proofs set status = 'accepted' where id = $1", [p.id])).then(async (r) => {
      if (r.affectedRows === 0) throw new Error('refused');
      return r;
    }));
    await denied(as(db, e1, () => db.query("insert into public.payment_proofs (job_id, recruiter_id, reference, file_path) values ($1, $2, 'DIRECT00GGG', 'x/aaaaaaaaaaa')", [job, e1])));
  });
});

describe('25. Razorpay removed (migration 0025)', () => {
  it('its functions, table and columns are gone, and "Mark as paid" still works', async () => {
    expect(await countOf(db, "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'razorpay%'")).toBe(0);
    expect(await countOf(db, "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'razorpay_events'")).toBe(0);
    expect(await countOf(db, "select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name like 'razorpay%'")).toBe(0);
    const job = await newAd(e1);
    const [pay] = (await adminDo('select * from public.admin_mark_paid($1)', [job])).rows;
    expect(pay.status).toBe('paid');
  });
});
