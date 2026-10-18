// SECURITY TESTS, PART 10: online payments (migration 0023): only the server can mark an ad paid, each event once, wrong amounts refused.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30;

async function orderedJob(owner) {
  const job = (await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp)
     values ($1, $2, 'Ad', 'uae', 'Dubai', 'plumber', '919999999999') returning id`, [owner, pkg30])).rows[0].id;
  await as(db, owner, () => db.query('select public.create_ad_order($1, $2, null)', [job, pkg30]));
  return job;
}
const info = (job, user) => db.query('select public.razorpay_order_info($1, $2) as i', [job, user]).then((r) => r.rows[0].i);
const attach = (pay, order) => db.query('select public.razorpay_attach_order($1, $2)', [pay, order]);
const capture = (ev, order, pay, amount) => db.query('select public.razorpay_capture($1, $2, $3, $4) as r', [ev, order, pay, amount]).then((r) => r.rows[0].r);
const statusOf = async (job) => (await rowsOf(db, 'select status from public.jobs where id = $1', [job]))[0].status;
let seq = 0;
const next = () => { seq += 1; return seq; };

/** An ad with an order created at Razorpay, ready for the webhook. */
async function readyJob(owner = e1) {
  const job = await orderedJob(owner);
  const i = await info(job, owner);
  const orderId = `order_${next()}`;
  await attach(i.payment_id, orderId);
  return { job, orderId, amount: i.amount_paise };
}

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('23. Razorpay (migration 0023)', () => {
  it('nobody logged in (employer, admin, visitor) can call the server-only functions', async () => {
    const { job, orderId, amount } = await readyJob();
    for (const who of [e1, admin, null]) {
      await denied(as(db, who, () => capture(`evt_${next()}`, orderId, 'pay_x', amount)));
      await denied(as(db, who, () => db.query("select public.razorpay_refund('evt_r', 'pay_x')")));
      await denied(as(db, who, () => info(job, e1)));
      await denied(as(db, who, () => attach('00000000-0000-0000-0000-000000000000', 'order_z')));
    }
    expect(await statusOf(job)).toBe('pending_payment');
  });

  it('the order amount is the price saved with the ad, and only the owner of a waiting ad gets it', async () => {
    const job = await orderedJob(e1);
    const saved = (await rowsOf(db, 'select final_price_paise from public.jobs where id = $1', [job]))[0].final_price_paise;
    expect((await info(job, e1)).amount_paise).toBe(saved);
    await expect(info(job, e2)).rejects.toThrow(/not found/i);
  });

  it('an ad that was not ordered (no plan chosen) or is already paid gets no order', async () => {
    const bare = (await db.query("insert into public.jobs (recruiter_id, package_id, title, whatsapp) values ($1, $2, 'No order', '919999999999') returning id", [e1, pkg30])).rows[0].id;
    await expect(info(bare, e1)).rejects.toThrow(/plan/i);
    const { job } = await readyJob();
    await as(db, admin, () => db.query('select public.admin_mark_paid($1)', [job]));
    await expect(info(job, e1)).rejects.toThrow(/not waiting/i);
  });

  it('a verified payment marks the ad paid once, with the Razorpay ids, and a repeated event does nothing', async () => {
    const { job, orderId, amount } = await readyJob();
    expect(await capture('evt_a', orderId, 'pay_a', amount)).toBe('paid');
    expect(await statusOf(job)).toBe('paid_pending_review');
    const [pay] = await rowsOf(db, "select * from public.payments where job_id = $1 and status = 'paid'", [job]);
    expect(pay.method).toBe('razorpay');
    expect(pay.razorpay_payment_id).toBe('pay_a');
    expect(pay.razorpay_order_id).toBe(orderId);
    expect(pay.amount_paise).toBe(amount);
    expect(await capture('evt_a', orderId, 'pay_a', amount)).toBe('duplicate');
    expect(await capture('evt_a2', orderId, 'pay_a', amount)).toBe('duplicate');
    expect(await countOf(db, "select * from public.payments where job_id = $1 and status = 'paid'", [job])).toBe(1);
  });

  it('a wrong amount, an unknown order or an ad that no longer waits is recorded and changes nothing', async () => {
    const wrong = await readyJob();
    expect(await capture(`evt_${next()}`, wrong.orderId, 'pay_w', wrong.amount - 100)).toBe('amount_mismatch');
    expect(await statusOf(wrong.job)).toBe('pending_payment');
    expect(await capture(`evt_${next()}`, 'order_nobody', 'pay_u', 100)).toBe('unknown_order');
    const late = await readyJob();
    await as(db, admin, () => db.query('select public.admin_mark_paid($1)', [late.job]));
    expect(await capture(`evt_${next()}`, late.orderId, 'pay_l', late.amount)).toBe('not_waiting');
    expect(await countOf(db, "select * from public.razorpay_events where outcome in ('amount_mismatch', 'unknown_order', 'not_waiting')")).toBe(3);
  });

  it('a new order replaces the old one: paying the old order does nothing', async () => {
    const { job, orderId, amount } = await readyJob();
    const i = await info(job, e1);
    await attach(i.payment_id, 'order_new');
    expect(await capture(`evt_${next()}`, orderId, 'pay_old', amount)).toBe('unknown_order');
    expect(await capture(`evt_${next()}`, 'order_new', 'pay_new', amount)).toBe('paid');
  });

  it('a Razorpay refund marks the payment refunded once; an unknown payment changes nothing', async () => {
    const { job, orderId, amount } = await readyJob();
    await capture(`evt_${next()}`, orderId, 'pay_r', amount);
    expect(await db.query("select public.razorpay_refund('evt_ref', 'pay_r') as r").then((r) => r.rows[0].r)).toBe('refunded');
    expect(await db.query("select public.razorpay_refund('evt_ref', 'pay_r') as r").then((r) => r.rows[0].r)).toBe('duplicate');
    expect((await rowsOf(db, "select status from public.payments where job_id = $1", [job]))[0].status).toBe('refunded');
    expect(await db.query("select public.razorpay_refund('evt_ref2', 'pay_none') as r").then((r) => r.rows[0].r)).toBe('unknown_payment');
  });

  it('the admin button still works through the shared function, and an employer still cannot mark paid', async () => {
    const job = await orderedJob(e1);
    await denied(as(db, e1, () => db.query('select public.admin_mark_paid($1)', [job])));
    await denied(as(db, e1, () => db.query("select public.mark_job_paid($1, 100, 'manual', null, '')", [job])));
    const [pay] = (await as(db, admin, () => db.query('select * from public.admin_mark_paid($1, null, $2, $3)', [job, 'cash', 'REF-OK-1']))).rows;
    expect(pay.method).toBe('manual');
    expect(pay.reference).toBe('REF-OK-1');
    expect(await statusOf(job)).toBe('paid_pending_review');
  });

  it('employers cannot write or change payments, and only admins read the event list', async () => {
    const { job, orderId, amount } = await readyJob();
    await capture(`evt_${next()}`, orderId, 'pay_e', amount);
    await as(db, e1, () => db.query("update public.payments set razorpay_payment_id = 'pay_fake' where job_id = $1", [job])).catch(() => {});
    expect((await rowsOf(db, "select razorpay_payment_id from public.payments where job_id = $1 and status = 'paid'", [job]))[0].razorpay_payment_id).toBe('pay_e');
    await denied(as(db, e1, () => db.query("insert into public.razorpay_events (event_id, event_type, outcome) values ('x', 'x', 'x')")));
    expect(await as(db, e1, () => countOf(db, 'select * from public.razorpay_events'))).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.razorpay_events'))).toBeGreaterThan(0);
  });
});
