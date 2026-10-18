// The real logic of the two Edge Functions, with everything outside (login, database, Razorpay, secrets) passed in, so the tests can run it against a real Postgres.
import { createOrder, readEvent, verifySignature } from './razorpay.js';

/**
 * Create a Razorpay order for one of the caller's ads.
 * deps: { env: {RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET}, getUserId(): Promise<string|null>, rpc(name, args): Promise<{data, error}>, fetchFn }
 * Returns { status, body }.
 */
export async function handleCreateOrder(jobId, deps) {
  const { env, getUserId, rpc, fetchFn } = deps;
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return { status: 503, body: { error: 'not_ready' } };
  const userId = await getUserId();
  if (!userId) return { status: 401, body: { error: 'login' } };
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) return { status: 400, body: { error: 'bad_request' } };

  const { data: info, error } = await rpc('razorpay_order_info', { p_job: jobId, p_user: userId });
  if (error) return { status: 400, body: { error: 'not_payable' } };
  const orderId = await createOrder({
    keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, amountPaise: info.amount_paise, receipt: `ad-${jobId.slice(0, 8)}`, notes: { job_id: jobId }, fetchFn,
  });
  const { error: attachError } = await rpc('razorpay_attach_order', { p_payment: info.payment_id, p_order_id: orderId });
  if (attachError) return { status: 500, body: { error: 'server' } };
  return { status: 200, body: { orderId, amountPaise: info.amount_paise, keyId: env.RAZORPAY_KEY_ID, currency: 'INR' } };
}

/**
 * Handle one webhook call. `body` is the RAW text. deps: { env: {RAZORPAY_WEBHOOK_SECRET}, rpc }.
 * Returns { status, text }. 401 = bad signature, 500 = database problem (Razorpay retries), 200 = done or not our event.
 */
export async function handleWebhook(body, signature, eventId, deps) {
  const { env, rpc } = deps;
  if (!(await verifySignature(body, signature || '', env.RAZORPAY_WEBHOOK_SECRET || ''))) return { status: 401, text: 'bad signature' };
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 400, text: 'bad body' };
  }
  const event = readEvent(eventId || '', payload);
  if (!event) return { status: 200, text: 'ignored' };
  const { error } = event.kind === 'captured'
    ? await rpc('razorpay_capture', { p_event_id: event.eventId, p_order_id: event.orderId, p_payment_id: event.paymentId, p_amount_paise: event.amountPaise })
    : await rpc('razorpay_refund', { p_event_id: event.eventId, p_payment_id: event.paymentId });
  return error ? { status: 500, text: 'retry' } : { status: 200, text: 'ok' };
}
