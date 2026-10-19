import { describe, expect, it } from 'vitest';
import { badSettings, cleanWhatsapp, DEFAULT_SETTINGS, isFilledIn, mergeSettings, missingSettings } from './siteSettings';

describe('mergeSettings', () => {
  it('puts saved values on top and never falls back to an example for a cleared one', () => {
    const s = mergeSettings([{ key: 'upi_id', value: 'shop@okbank' }, { key: 'contact_email', value: '' }]);
    expect(s.upiId).toBe('shop@okbank');
    expect(s.contactEmail).toBe('');
    expect(s.whatsappNumber).toBe('');
  });
  it('ignores unknown keys', () => {
    expect(mergeSettings([{ key: 'secret', value: 'x' }])).not.toHaveProperty('secret');
  });
});

describe('isFilledIn', () => {
  it('an empty value or the example from src/config.js is not filled in; demo mode accepts the example', () => {
    expect(isFilledIn('upiId', '')).toBe(false);
    expect(isFilledIn('upiId', DEFAULT_SETTINGS.upiId)).toBe(false);
    expect(isFilledIn('upiId', DEFAULT_SETTINGS.upiId, true)).toBe(true);
    expect(isFilledIn('upiId', 'shop@okbank')).toBe(true);
  });
});

describe('badSettings', () => {
  it('finds wrong values and lets empty ones through', () => {
    expect(badSettings({ whatsappNumber: '12345', upiId: 'nope', contactEmail: 'a@b.in', siteUrl: 'http://x.com', companyName: '' })).toEqual(['whatsappNumber', 'upiId', 'siteUrl']);
    expect(badSettings({ whatsappNumber: '98765 43210', upiId: 'a.b@okbank', siteUrl: 'https://jobsabroad.in', grievanceName: 'Asha' })).toEqual([]);
  });
  it('cleans the WhatsApp number like the database does', () => {
    expect(cleanWhatsapp('+91 98765-43210')).toBe('919876543210');
    expect(cleanWhatsapp('9876543210')).toBe('919876543210');
  });
});

describe('missingSettings', () => {
  it('lists what is still missing', () => {
    const s = { ...mergeSettings([]), whatsappNumber: '919876543210' };
    expect(missingSettings(s)).toContain('contactEmail');
    expect(missingSettings(s)).not.toContain('upiId'); // employers do not pay, so the UPI details are not required
    expect(missingSettings(s)).not.toContain('whatsappNumber');
  });
});
