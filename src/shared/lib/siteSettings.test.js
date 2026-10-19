import { describe, expect, it } from 'vitest';
import { badSettings, cleanWhatsapp, DEFAULT_SETTINGS, isFilledIn, mergeSettings, missingSettings } from './siteSettings';

describe('mergeSettings', () => {
  it('puts saved values on top and never falls back to an example for a cleared one', () => {
    const s = mergeSettings([{ key: 'company_name', value: 'Shop Co' }, { key: 'contact_email', value: '' }]);
    expect(s.companyName).toBe('Shop Co');
    expect(s.contactEmail).toBe('');
    expect(s.whatsappNumber).toBe('');
  });
  it('ignores unknown keys, including the old UPI settings that may still be saved in the database', () => {
    expect(mergeSettings([{ key: 'secret', value: 'x' }, { key: 'upi_id', value: 'shop@okbank' }])).not.toHaveProperty('secret');
    expect(mergeSettings([{ key: 'upi_id', value: 'shop@okbank' }])).not.toHaveProperty('upiId');
  });
});

describe('isFilledIn', () => {
  it('an empty value or the example from src/config.js is not filled in; demo mode accepts the example', () => {
    expect(isFilledIn('contactEmail', '')).toBe(false);
    expect(isFilledIn('contactEmail', DEFAULT_SETTINGS.contactEmail)).toBe(false);
    expect(isFilledIn('contactEmail', DEFAULT_SETTINGS.contactEmail, true)).toBe(true);
    expect(isFilledIn('contactEmail', 'help@shop.in')).toBe(true);
  });
});

describe('badSettings', () => {
  it('finds wrong values and lets empty ones through', () => {
    expect(badSettings({ whatsappNumber: '12345', contactEmail: 'nope', siteUrl: 'http://x.com', companyName: '' })).toEqual(['whatsappNumber', 'contactEmail', 'siteUrl']);
    expect(badSettings({ whatsappNumber: '98765 43210', contactEmail: 'a.b@shop.in', siteUrl: 'https://jobsabroad.in', grievanceName: 'Asha' })).toEqual([]);
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
    expect(missingSettings(s)).not.toContain('whatsappNumber');
  });
});
