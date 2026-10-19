// Demo backend: the public list of verified agencies follows the same rules as the database view (migration 0029).
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
  vi.stubGlobal('FileReader', class { readAsDataURL() { this.result = 'data:image/png;base64,AAAA'; this.onload(); } });
  ({ demoApi: api } = await import('./index'));
});

describe('verified agencies (demo)', () => {
  it('lists only verified employers with their registration number and live ads, and nothing private', async () => {
    const rows = await api.listVerifiedAgencies();
    expect(rows.map((r) => r.companyName)).toEqual(['Gulf Works']);
    expect(rows[0]).toEqual({ companyName: 'Gulf Works', raNumber: 'B-1234/DEL/2020', liveAds: expect.any(Number) });
    expect(Object.keys(rows[0]).sort()).toEqual(['companyName', 'liveAds', 'raNumber']);
  });

  it('a newly verified employer appears; a blocked one disappears', async () => {
    await api.signIn({ email: 'other@example.com', password: 'other12345' });
    await api.submitVerification({ licenseNumber: 'LIC-123', file: { type: 'image/png' } });
    await api.signIn(DEMO_LOGINS.admin);
    await api.adminSetRecruiter('u-rec2', { verified: true });
    expect((await api.listVerifiedAgencies()).map((r) => r.companyName).sort()).toEqual(['Desert Transport', 'Gulf Works']);
    await api.adminSetRecruiter('u-rec', { blocked: true });
    expect((await api.listVerifiedAgencies()).map((r) => r.companyName)).toEqual(['Desert Transport']);
  });
});
