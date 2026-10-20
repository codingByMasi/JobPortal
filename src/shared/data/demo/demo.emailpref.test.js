// Demo backend: the employer's choice about emails is saved and read back like the database (migration 0034).
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

describe('email choice (demo)', () => {
  it('is on by default, can be turned off and on, and only for yourself', async () => {
    await api.signIn(DEMO_LOGINS.recruiter);
    const me = { id: 'u-rec' };
    const off = await api.updateProfile(me.id, { companyName: 'Gulf Works', phone: '919876543210', raNumber: 'B-1234/DEL/2020', emailNotifications: false });
    expect(off.emailNotifications).toBe(false);
    expect(off.verified).toBe(true); // changing only the email choice does not remove the Verified tag
    const on = await api.updateProfile(me.id, { companyName: 'Gulf Works', phone: '919876543210', raNumber: 'B-1234/DEL/2020', emailNotifications: true });
    expect(on.emailNotifications).toBe(true);
    await expect(api.updateProfile('u-rec2', { companyName: 'Hacked', phone: '919812345678', emailNotifications: false })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});
