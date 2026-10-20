// Demo backend: ad views and the employer's per-ad numbers follow the same rules as the database (migration 0033).
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

describe('ad views and stats (demo)', () => {
  it('counts a view on a live ad, adds up, and shows the employer views and applications for their own ads only', async () => {
    await api.recordAdView('job-1');
    await api.recordAdView('job-1');
    await api.submitApplication({ jobId: 'job-1', name: 'Sita', phone: '9876543210', city: 'Pune', message: 'Hello' });
    await api.signIn(DEMO_LOGINS.recruiter);
    const mine = await api.listMyAdStats();
    expect(mine['job-1'].views).toBe(2);
    expect(mine['job-1'].applications).toBeGreaterThanOrEqual(1);
    expect(mine['job-2']).toBeUndefined(); // another employer's ad
  });

  it('a view of an ad that is not live, or does not exist, is ignored without an error', async () => {
    await api.recordAdView('job-7'); // waiting for payment in the sample data
    await api.recordAdView('nope');
    await api.signIn(DEMO_LOGINS.recruiter);
    expect((await api.listMyAdStats())['job-7'].views).toBe(0);
  });

  it('a visitor cannot read the numbers', async () => {
    await expect(api.listMyAdStats()).rejects.toBeTruthy();
  });
});
