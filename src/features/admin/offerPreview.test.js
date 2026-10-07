import { describe, expect, it } from 'vitest';
import { generateCode, offerPreview } from './offerPreview';

const t = { offerPreview: (o) => JSON.stringify(o) };
const plans = [{ id: 'a', name: '30 Days', pricePaise: 100000, durationDays: 30, active: true }];

describe('offerPreview', () => {
  it('shows list and final price for a percent offer', () => {
    const o = JSON.parse(offerPreview({ type: 'percent', value: 20, appliesTo: 'package', packageId: 'a' }, plans, '', t));
    expect(o).toMatchObject({ list: '₹1,000', final: '₹800', target: 'plan', planName: '30 Days' });
  });
  it('shows days for bonus days and zero for free', () => {
    expect(JSON.parse(offerPreview({ type: 'bonus_days', value: 7, appliesTo: 'all' }, plans, '', t))).toMatchObject({ days: 30, finalDays: 37 });
    expect(JSON.parse(offerPreview({ type: 'free', value: 0, appliesTo: 'all' }, plans, '', t)).final).toBe('₹0');
  });
  it('shows nothing until the value is filled in', () => {
    expect(offerPreview({ type: 'percent', value: 0, appliesTo: 'all' }, plans, '', t)).toBe('');
  });
});

describe('generateCode', () => {
  it('makes a valid coupon code', () => expect(generateCode()).toMatch(/^SAVE-[A-Z2-9]{5}$/));
});
