// Demo backend: the numbers of the admin work queue (licenses, waiting, ending soon, ended) follow the same rules as the database.
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

const ad = (title) => ({ title, country: 'uae', city: 'Dubai', category: 'plumber', whatsapp: '919876543210' });

describe('admin work queue counts (demo)', () => {
  it('count licenses waiting for a check, and stop counting them once decided', async () => {
    await api.signIn({ email: 'other@example.com', password: 'other12345' });
    await api.submitVerification({ licenseNumber: 'LIC-123', file: { type: 'image/png' } });
    await api.signIn(DEMO_LOGINS.admin);
    expect((await api.adminCounts()).licenses).toBe(1);
    await api.adminRejectVerification((await api.adminListVerifications())[0].id, 'Not readable');
    expect((await api.adminCounts()).licenses).toBe(0);
  });

  it('count ads waiting for approval, ending soon and ended recently', async () => {
    await api.signIn(DEMO_LOGINS.recruiter);
    const soon = await api.createJob(ad('Ends soon'));
    const later = await api.createJob(ad('Ends later'));
    const gone = await api.createJob(ad('Already ended'));
    await api.signIn(DEMO_LOGINS.admin);
    const before = await api.adminCounts();
    await api.adminApprove(soon.id, 2);
    await api.adminApprove(later.id, 20);
    await api.adminApprove(gone.id, 5);
    await api.adminUpdateJob(gone.id, { expiresAt: Date.now() - 86400000 });
    const after = await api.adminCounts();
    expect(after.review).toBe(before.review - 3);
    expect(after.endingSoon).toBe(before.endingSoon + 1);
    expect(after.ended).toBe(before.ended + 1);
    expect(after.live).toBe(before.live + 2);
  });

  it('more days on an ended ad puts it back live and out of the ended count', async () => {
    await api.signIn(DEMO_LOGINS.recruiter);
    const job = await api.createJob(ad('Comes back'));
    await api.signIn(DEMO_LOGINS.admin);
    await api.adminApprove(job.id, 3);
    await api.adminUpdateJob(job.id, { expiresAt: Date.now() - 86400000 });
    const ended = (await api.adminCounts()).ended;
    await api.adminExtendJob(job.id, 10, 'Employer asked');
    expect((await api.adminCounts()).ended).toBe(ended - 1);
  });
});
