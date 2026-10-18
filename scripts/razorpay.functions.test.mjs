// Tests for the Razorpay Edge Function helpers: signature check, order request, reading webhook events.
import { describe, expect, it } from 'vitest';
import { createOrder, hmacHex, readEvent, verifySignature } from '../supabase/functions/_shared/razorpay.js';

describe('webhook signature', () => {
  it('matches the known HMAC-SHA256 value', async () => {
    expect(await hmacHex('key', 'The quick brown fox jumps over the lazy dog')).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });
  it('accepts the right signature and refuses everything else', async () => {
    const body = '{"event":"payment.captured"}';
    const good = await hmacHex('secret', body);
    expect(await verifySignature(body, good, 'secret')).toBe(true);
    expect(await verifySignature(`${body} `, good, 'secret')).toBe(false);
    expect(await verifySignature(body, good, 'other')).toBe(false);
    expect(await verifySignature(body, `${good.slice(0, -1)}0`, 'secret')).toBe(good.endsWith('0'));
    expect(await verifySignature(body, '', 'secret')).toBe(false);
    expect(await verifySignature(body, null, 'secret')).toBe(false);
    expect(await verifySignature(body, good, '')).toBe(false);
    expect(await verifySignature(body, 'abc', 'secret')).toBe(false);
  });
});

describe('createOrder', () => {
  const ok = (extra = {}) => async (_url, init) => {
    const sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ id: 'order_1', amount: sent.amount, ...extra }), _sent: sent };
  };
  it('sends whole paise in INR with basic login and returns the order id', async () => {
    let seen;
    const fetchFn = async (url, init) => { seen = { url, init }; return ok()(url, init); };
    expect(await createOrder({ keyId: 'rzp_test_1', keySecret: 's', amountPaise: 49900, receipt: 'ad-1234', fetchFn })).toBe('order_1');
    expect(seen.url).toBe('https://api.razorpay.com/v1/orders');
    expect(JSON.parse(seen.init.body)).toMatchObject({ amount: 49900, currency: 'INR', receipt: 'ad-1234' });
    expect(seen.init.headers.Authorization).toBe(`Basic ${btoa('rzp_test_1:s')}`);
  });
  it('refuses a bad amount before calling Razorpay', async () => {
    const fetchFn = async () => { throw new Error('must not be called'); };
    for (const amountPaise of [0, 99, 12.5, -100, '500', null]) {
      await expect(createOrder({ keyId: 'a', keySecret: 'b', amountPaise, receipt: 'x', fetchFn })).rejects.toThrow('bad_amount');
    }
  });
  it('fails when Razorpay fails or answers with a different amount', async () => {
    await expect(createOrder({ keyId: 'a', keySecret: 'b', amountPaise: 500, receipt: 'x', fetchFn: async () => ({ ok: false }) })).rejects.toThrow();
    await expect(createOrder({ keyId: 'a', keySecret: 'b', amountPaise: 500, receipt: 'x', fetchFn: ok({ amount: 1 }) })).rejects.toThrow();
  });
});

describe('readEvent', () => {
  const captured = (p = {}) => ({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 49900, currency: 'INR', ...p } } } });
  it('reads a captured payment', () => {
    expect(readEvent('evt_1', captured())).toEqual({ kind: 'captured', eventId: 'evt_1', orderId: 'order_1', paymentId: 'pay_1', amountPaise: 49900 });
  });
  it('reads a processed refund', () => {
    expect(readEvent('evt_2', { event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_1' } } } })).toEqual({ kind: 'refund', eventId: 'evt_2', paymentId: 'pay_1' });
  });
  it('ignores other events and incomplete or odd ones', () => {
    expect(readEvent('evt_3', { event: 'payment.failed', payload: {} })).toBeNull();
    expect(readEvent('', captured())).toBeNull();
    expect(readEvent('evt_4', null)).toBeNull();
    expect(readEvent('evt_5', captured({ currency: 'USD' }))).toBeNull();
    expect(readEvent('evt_6', captured({ amount: '499' }))).toBeNull();
    expect(readEvent('evt_7', captured({ order_id: undefined }))).toBeNull();
  });
});
