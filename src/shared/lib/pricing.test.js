import { describe, expect, it } from 'vitest';
import { computeQuote, offerStatus } from './pricing';

const pkg = { id: 'p30', pricePaise: 100000, durationDays: 30, active: true };
const offer = (o) => ({ id: 'o1', name: 'Offer', type: 'percent', value: 20, appliesTo: 'all', packageId: null, recruiterId: null, couponCode: null, startsAt: null, endsAt: null, maxUses: null, maxUsesPerRecruiter: 1, active: true, ...o });
const q = (offers, extra = {}) => computeQuote({ pkg, offers, recruiterId: 'r1', now: 1000000, ...extra });

describe('computeQuote', () => {
  it('no offer: list price', () => expect(q([])).toMatchObject({ ok: true, finalPricePaise: 100000, discountPaise: 0, code: 'no_offer' }));
  it('percent', () => expect(q([offer({})])).toMatchObject({ discountPaise: 20000, finalPricePaise: 80000 }));
  it('flat never goes below zero', () => expect(q([offer({ type: 'flat', value: 999999999 })]).finalPricePaise).toBe(0));
  it('bonus days keep the price', () => expect(q([offer({ type: 'bonus_days', value: 7 })])).toMatchObject({ finalPricePaise: 100000, finalDays: 37, bonusDays: 7 }));
  it('free is zero', () => expect(q([offer({ type: 'free' })]).finalPricePaise).toBe(0));
  it('picks the single best automatic offer and skips coupon ones', () => {
    const r = q([offer({ id: 'a', value: 10 }), offer({ id: 'b', value: 30 }), offer({ id: 'c', value: 90, couponCode: 'BIG90' })]);
    expect(r.offerId).toBe('b');
  });
  it('coupon problems', () => {
    const base = { couponCode: 'CODE1' };
    expect(q([], { code: 'CODE1' }).code).toBe('not_found');
    expect(q([offer({ ...base, active: false })], { code: 'code1' }).code).toBe('inactive');
    expect(q([offer({ ...base, startsAt: 2000000 })], { code: 'CODE1' }).code).toBe('not_started');
    expect(q([offer({ ...base, endsAt: 500 })], { code: 'CODE1' }).code).toBe('expired');
    expect(q([offer({ ...base, appliesTo: 'package', packageId: 'other' })], { code: 'CODE1' }).code).toBe('wrong_plan');
    expect(q([offer({ ...base, appliesTo: 'recruiter', recruiterId: 'r2' })], { code: 'CODE1' }).code).toBe('wrong_recruiter');
    expect(q([offer({ ...base, maxUses: 1 })], { code: 'CODE1', redemptions: [{ offerId: 'o1', recruiterId: 'r9' }] }).code).toBe('used_up');
    expect(q([offer({ ...base })], { code: 'CODE1', redemptions: [{ offerId: 'o1', recruiterId: 'r1' }] }).code).toBe('already_used');
  });
  it('an unavailable plan', () => expect(computeQuote({ pkg: { ...pkg, active: false }, offers: [], recruiterId: 'r1' }).code).toBe('plan_unavailable'));
});

describe('offerStatus', () => {
  const now = 1000;
  it('shows the right word', () => {
    expect(offerStatus(offer({ active: false }), 0, now)).toBe('off');
    expect(offerStatus(offer({ endsAt: 500 }), 0, now)).toBe('expired');
    expect(offerStatus(offer({ maxUses: 2 }), 2, now)).toBe('usedUp');
    expect(offerStatus(offer({ startsAt: 5000 }), 0, now)).toBe('scheduled');
    expect(offerStatus(offer({}), 0, now)).toBe('active');
  });
});
