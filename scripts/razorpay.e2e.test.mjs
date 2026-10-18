// END TO END (without the real Razorpay): the real Edge Function logic + the real helpers + the real migrations in a real Postgres.
// Only Razorpay's own server is faked. Flow: employer orders an ad -> create-razorpay-order -> Razorpay signs a webhook -> razorpay-webhook -> admin approves -> live.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleCreateOrder, handleWebhook } from '../supabase/functions/_shared/handlers.js';
import { hmacHex } from '../supabase/functions/_shared/razorpay.js';
import { addUser, as, makeDb, rowsOf } from './rls/harness.mjs';

const SECRETS = { RAZORPAY_KEY_ID: 'rzp_test_KEY', RAZORPAY_KEY_SECRET: 'key_secret', RAZORPAY_WEBHOOK_SECRET: 'whsec' };
let db; let admin; let e1; let e2; let pkg30;
let orderSeq = 0;
const razorpayCalls = [];

/** The database as the Edge Function sees it (service role): rpc(name, args) in argument order. */
const rpc = async (name, args) => {
  const values = Object.values(args);
  try {
    const { rows } = await db.query(`select public.${name}(${values.map((_, i) => `$${i + 1}`).join(', ')}) as r`, values);
    return { data: rows[0].r, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/** A fake Razorpay /v1/orders that remembers what was asked. */
const fakeRazorpay = async (url, init) => {
  const sent = JSON.parse(init.body);
  razorpayCalls.push({ url, auth: init.headers.Authorization, sent });
  orderSeq += 1;
  return { ok: true, json: async () => ({ id: `order_E2E${orderSeq}`, amount: sent.amount, currency: sent.currency }) };
};

const createOrder = (jobId, userId, over = {}) => handleCreateOrder(jobId, { env: SECRETS, getUserId: async () => userId, rpc, fetchFn: fakeRazorpay, ...over });

/** What Razorpay sends: the raw body and its signature. */
async function razorpayEvent(event, entity, secret = SECRETS.RAZORPAY_WEBHOOK_SECRET) {
  const body = JSON.stringify({ event, payload: event === 'refund.processed' ? { refund: { entity } } : { payment: { entity } } });
  return { body, signature: await hmacHex(secret, body) };
}
const sendWebhook = (ev, id) => handleWebhook(ev.body, ev.signature, id, { env: SECRETS, rpc });
const captured = (orderId, paymentId, amount) => razorpayEvent('payment.captured', { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' });

async function newAd(owner) {
  const job = (await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp)
     values ($1, $2, 'Welder wanted', 'uae', 'Dubai', 'plumber', '919999999999') returning id`, [owner, pkg30])).rows[0].id;
  await as(db, owner, () => db.query('select public.create_ad_order($1, $2, null)', [job, pkg30]));
  return job;
}
const jobStatus = async (job) => (await rowsOf(db, 'select status from public.jobs where id = $1', [job]))[0].status;

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('Razorpay end to end', () => {
  it('the full journey: order, pay, webhook, repeat, admin approval, refund', async () => {
    const job = await newAd(e1);
    const price = (await rowsOf(db, 'select final_price_paise from public.jobs where id = $1', [job]))[0].final_price_paise;

    // 1. the browser asks for an order: the price is the saved one, Razorpay is called with the server's keys
    const res = await createOrder(job, e1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ amountPaise: price, keyId: 'rzp_test_KEY', currency: 'INR' });
    const call = razorpayCalls.at(-1);
    expect(call.url).toBe('https://api.razorpay.com/v1/orders');
    expect(call.auth).toBe(`Basic ${btoa('rzp_test_KEY:key_secret')}`);
    expect(call.sent.amount).toBe(price);
    expect(JSON.stringify(res.body)).not.toContain('key_secret');
    expect(await jobStatus(job)).toBe('pending_payment'); // asking for an order never marks anything paid

    // 2. Razorpay says "paid": signed webhook
    const ev = await captured(res.body.orderId, 'pay_E2E1', price);
    expect((await sendWebhook(ev, 'evt_E2E1')).status).toBe(200);
    expect(await jobStatus(job)).toBe('paid_pending_review');
    const [pay] = await rowsOf(db, "select * from public.payments where job_id = $1 and status = 'paid'", [job]);
    expect(pay).toMatchObject({ method: 'razorpay', amount_paise: price, razorpay_payment_id: 'pay_E2E1', razorpay_order_id: res.body.orderId });

    // 3. Razorpay sends the same event again (it does): nothing doubles
    expect((await sendWebhook(ev, 'evt_E2E1')).status).toBe(200);
    expect((await sendWebhook(ev, 'evt_E2E1_resend')).status).toBe(200);
    expect((await rowsOf(db, "select count(*)::int as n from public.payments where job_id = $1 and status = 'paid'", [job]))[0].n).toBe(1);

    // 4. an admin still approves; the ad goes live for the plan's days
    await as(db, admin, () => db.query('select public.admin_approve_job($1)', [job]));
    expect(await jobStatus(job)).toBe('live');
    const [row] = await rowsOf(db, "select expires_at > now() + interval '29 days' as ok from public.jobs where id = $1", [job]);
    expect(row.ok).toBe(true);

    // 5. a refund started in the Razorpay dashboard
    const refund = await razorpayEvent('refund.processed', { id: 'rfnd_1', payment_id: 'pay_E2E1' });
    expect((await sendWebhook(refund, 'evt_E2E_ref')).status).toBe(200);
    expect((await rowsOf(db, 'select status from public.payments where job_id = $1', [job]))[0].status).toBe('refunded');
  });

  it("refuses the order for someone else's ad, a missing login, a bad id, missing keys", async () => {
    const job = await newAd(e1);
    const before = razorpayCalls.length;
    expect((await createOrder(job, e2)).status).toBe(400);
    expect((await createOrder(job, null)).status).toBe(401);
    expect((await createOrder('not-an-id', e1)).status).toBe(400);
    expect((await createOrder(job, e1, { env: { RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' } })).status).toBe(503);
    expect(razorpayCalls.length).toBe(before); // Razorpay was never called for any of these
  });

  it('refuses a webhook with a wrong signature or a wrong secret; the ad stays unpaid', async () => {
    const job = await newAd(e1);
    const { body: order } = await createOrder(job, e1);
    const forged = await captured(order.orderId, 'pay_FAKE', order.amountPaise);
    expect((await handleWebhook(forged.body, 'deadbeef', 'evt_f1', { env: SECRETS, rpc })).status).toBe(401);
    expect((await handleWebhook(forged.body, '', 'evt_f2', { env: SECRETS, rpc })).status).toBe(401);
    const wrongSecret = await razorpayEvent('payment.captured', { id: 'pay_FAKE', order_id: order.orderId, amount: order.amountPaise, currency: 'INR' }, 'attacker');
    expect((await sendWebhook(wrongSecret, 'evt_f3')).status).toBe(401);
    expect((await handleWebhook(forged.body, forged.signature, 'evt_f4', { env: { RAZORPAY_WEBHOOK_SECRET: '' }, rpc })).status).toBe(401);
    expect(await jobStatus(job)).toBe('pending_payment');
  });

  it('a signed event for the wrong amount, or one we do not act on, changes nothing and answers 200', async () => {
    const job = await newAd(e1);
    const { body: order } = await createOrder(job, e1);
    expect((await sendWebhook(await captured(order.orderId, 'pay_LOW', order.amountPaise - 100), 'evt_w1')).status).toBe(200);
    expect(await jobStatus(job)).toBe('pending_payment');
    expect((await rowsOf(db, "select outcome from public.razorpay_events where event_id = 'evt_w1'"))[0].outcome).toBe('amount_mismatch');
    expect((await sendWebhook(await razorpayEvent('payment.failed', { id: 'pay_x' }), 'evt_w2')).text).toBe('ignored');
  });

  it('a database failure answers 500 so Razorpay tries again, and the retry then works', async () => {
    const job = await newAd(e1);
    const { body: order } = await createOrder(job, e1);
    const ev = await captured(order.orderId, 'pay_RETRY', order.amountPaise);
    const broken = await handleWebhook(ev.body, ev.signature, 'evt_retry', { env: SECRETS, rpc: async () => ({ data: null, error: new Error('db down') }) });
    expect(broken.status).toBe(500);
    expect(await jobStatus(job)).toBe('pending_payment');
    expect((await sendWebhook(ev, 'evt_retry')).status).toBe(200);
    expect(await jobStatus(job)).toBe('paid_pending_review');
  });

  it('an ad with nothing to pay never gets a Razorpay order', async () => {
    const job = await newAd(e1);
    await db.query("update public.payments set amount_paise = 0 where job_id = $1 and status = 'created'", [job]);
    const before = razorpayCalls.length;
    expect((await createOrder(job, e1)).status).toBe(400);
    expect(razorpayCalls.length).toBe(before);
  });
});
