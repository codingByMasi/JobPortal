import { describe, expect, it } from 'vitest';
import { adReference } from '../../shared/lib/adReference';
import { paymentInfo, upiLink } from './payments';

describe('adReference', () => {
  it('is a short code from the first 8 letters of the ad id', () => {
    expect(adReference('1a2b3c4d-1111-2222-3333-444455556666')).toBe('AD-1A2B3C4D');
  });
});

describe('upiLink', () => {
  it('opens the UPI app with payee, amount in rupees, and the ad code as the note', () => {
    const link = upiLink({ upiId: 'shop@okbank', upiName: 'Jobs Abroad Services', amountPaise: 79900, reference: 'AD-1A2B3C4D' });
    const q = new URL(link.replace('upi://pay', 'https://x/pay')).searchParams;
    expect(link.startsWith('upi://pay?')).toBe(true);
    expect(q.get('pa')).toBe('shop@okbank');
    expect(q.get('pn')).toBe('Jobs Abroad Services');
    expect(q.get('am')).toBe('799.00');
    expect(q.get('cu')).toBe('INR');
    expect(q.get('tn')).toBe('AD-1A2B3C4D');
    expect(link).not.toContain('+'); // spaces are written as %20
  });
  it('shows paise correctly', () => {
    expect(upiLink({ upiId: 'a@b', upiName: 'X', amountPaise: 29950, reference: 'R' })).toContain('am=299.50');
  });
});

describe('paymentInfo', () => {
  it('carries the code, the payee name and the link for the screen', () => {
    const info = paymentInfo({ id: 'abcdef12-0000-0000-0000-000000000000', title: 'Plumber' }, { name: '30 Days', pricePaise: 79900 });
    expect(info.reference).toBe('AD-ABCDEF12');
    expect(info.amountPaise).toBe(79900);
    expect(info.upiLink).toContain('upi://pay?');
    expect(info.upiLink).toContain('tn=AD-ABCDEF12');
  });
  it('takes the amount from the price saved with the order, not from the plan', () => {
    const job = { id: 'abcdef12-0000-0000-0000-000000000000', title: 'Plumber', listPricePaise: 100000, discountPaise: 20000, finalPricePaise: 80000, durationDaysFinal: 37 };
    const info = paymentInfo(job, { name: '30 Days', pricePaise: 250000, durationDays: 30 }); // the plan price changed to 2500 later
    expect(info.amountPaise).toBe(80000);
    expect(info.discountPaise).toBe(20000);
    expect(info.days).toBe(37);
    expect(info.upiLink).toContain('am=800.00');
  });
});
