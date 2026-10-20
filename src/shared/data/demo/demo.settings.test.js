// Demo backend: the site settings an admin can change behave like the database (migration 0021).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOGINS } from './seed';

let api;
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
};
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  ({ demoApi: api } = await import('./index'));
});
const asAdmin = () => api.signIn(DEMO_LOGINS.admin);
const valueOf = async (key) => (await api.getSiteSettings()).find((r) => r.key === key)?.value;

describe('site settings', () => {
  it('start with the example values; the admin changes them and the change is logged with old and new value', async () => {
    expect(await valueOf('contact_email')).toBeTruthy();
    await asAdmin();
    await api.adminSaveSettings({ contactEmail: 'help@shop.in', whatsappNumber: '98765 43210', companyName: 'Jobs Abroad Pvt Ltd' });
    expect(await valueOf('contact_email')).toBe('help@shop.in');
    expect(await valueOf('whatsapp_number')).toBe('919876543210');
    expect(await valueOf('company_name')).toBe('Jobs Abroad Pvt Ltd');
  });
  it('refuses wrong values and non-admins', async () => {
    await api.signIn(DEMO_LOGINS.recruiter);
    await expect(api.adminSaveSettings({ contactEmail: 'thief@bank.example' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await api.signOut();
    await asAdmin();
    await expect(api.adminSaveSettings({ contactEmail: 'no-at-sign' })).rejects.toMatchObject({ code: 'BAD_SETTING' });
    await expect(api.adminSaveSettings({ siteUrl: 'http://x.com' })).rejects.toMatchObject({ code: 'BAD_SETTING' });
  });
  it('an empty text clears a setting', async () => {
    await asAdmin();
    await api.adminSaveSettings({ contactEmail: '' });
    expect(await valueOf('contact_email')).toBe('');
  });
});
