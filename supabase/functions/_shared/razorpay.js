// Razorpay helpers shared by the two Edge Functions: webhook signature check, order creation, reading a webhook event. Plain JS, no imports (runs in Deno and in the tests).

const encoder = new TextEncoder();

/** Hex text of the HMAC-SHA256 of `body` with `secret`. */
export async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True only when `signature` is the correct HMAC of the RAW body (compared without stopping at the first wrong letter). */
export async function verifySignature(body, signature, secret) {
  if (!secret || !signature || typeof signature !== 'string') return false;
  const expected = await hmacHex(secret, body);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** Creates a Razorpay order for `amountPaise` (whole paise). Returns the order id. Throws on any Razorpay error. */
export async function createOrder({ keyId, keySecret, amountPaise, receipt, notes = {}, fetchFn = fetch }) {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) throw new Error('bad_amount');
  const res = await fetchFn('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: String(receipt).slice(0, 40), notes }),
  });
  if (!res.ok) throw new Error('razorpay_order_failed');
  const order = await res.json();
  if (typeof order.id !== 'string' || order.amount !== amountPaise) throw new Error('razorpay_order_bad_answer');
  return order.id;
}

/** What the webhook needs from an event, or null when it is not one we act on. */
export function readEvent(eventId, payload) {
  if (!eventId || !payload || typeof payload.event !== 'string') return null;
  if (payload.event === 'payment.captured') {
    const p = payload.payload?.payment?.entity;
    if (!p || typeof p.id !== 'string' || typeof p.order_id !== 'string' || !Number.isInteger(p.amount) || p.currency !== 'INR') return null;
    return { kind: 'captured', eventId, orderId: p.order_id, paymentId: p.id, amountPaise: p.amount };
  }
  if (payload.event === 'refund.processed') {
    const r = payload.payload?.refund?.entity;
    if (!r || typeof r.payment_id !== 'string') return null;
    return { kind: 'refund', eventId, paymentId: r.payment_id };
  }
  return null;
}
