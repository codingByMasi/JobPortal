// Demo backend: job facts, reports, deletion requests and counters behave like the database (migration 0020).
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
const asEmployer = () => api.signIn(DEMO_LOGINS.recruiter);

describe('job facts', () => {
  it('are saved with a new ad and shown in the public list, with the registration number only for a verified employer', async () => {
    await asEmployer();
    const job = await api.createJob({ title: 'Test cook', country: 'uae', city: 'Dubai', category: 'cook', whatsapp: '919876543210', packageId: 'pkg-30', salaryMin: 1200, salaryMax: 1800, currency: 'AED', experienceLevel: 'fresher', vacancies: 4, lastDate: '2026-12-31', visaType: 'Work visa' });
    expect(job).toMatchObject({ salaryMin: 1200, salaryMax: 1800, currency: 'AED', experienceLevel: 'fresher', vacancies: 4, visaType: 'Work visa' });
    expect(job.lastDate).toBeGreaterThan(0);
    const live = (await api.listLiveJobs()).find((j) => j.id === 'job-1');
    expect(live).toMatchObject({ salaryMin: 1500, currency: 'AED', experienceLevel: '2-5' });
  });
});

describe('reports', () => {
  it('a visitor reports a live ad once; a hidden ad or a wrong reason is refused; the admin sees it and closes it', async () => {
    await api.reportAd({ jobId: 'job-1', reason: 'asked_money', message: 'asked 5000' });
    await expect(api.reportAd({ jobId: 'job-1', reason: 'other' })).rejects.toMatchObject({ code: 'ALREADY_REPORTED' });
    await expect(api.reportAd({ jobId: 'job-1', reason: 'hate' })).rejects.toMatchObject({ code: 'AD_NOT_OPEN' });
    await expect(api.reportAd({ jobId: 'job-7', reason: 'other' })).rejects.toMatchObject({ code: 'AD_NOT_OPEN' });
    await expect(api.adminListReports()).rejects.toMatchObject({ code: 'NEED_LOGIN' });
    await asAdmin();
    const list = await api.adminListReports();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'asked_money', status: 'open', jobTitle: 'Plumbers Needed' });
    await api.adminSetReport(list[0].id, 'done');
    expect((await api.adminListReports())[0].status).toBe('done');
  });
  it('an employer cannot read reports', async () => {
    await asEmployer();
    await expect(api.adminListReports()).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});

describe('deletion requests', () => {
  it('anyone can ask once per email; a bad email is refused; only the admin reads them', async () => {
    await api.requestAccountDeletion({ email: ' Person@Example.com ', note: 'please' });
    await expect(api.requestAccountDeletion({ email: 'person@example.com' })).rejects.toMatchObject({ code: 'ALREADY_REQUESTED' });
    await expect(api.requestAccountDeletion({ email: 'nope' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminListDeletionRequests()).rejects.toMatchObject({ code: 'NEED_LOGIN' });
    await asAdmin();
    expect((await api.adminListDeletionRequests())[0]).toMatchObject({ email: 'person@example.com', status: 'open' });
  });
});

describe('counters', () => {
  it('count live ads, verified employers and applications', async () => {
    const c = await api.getPublicCounts();
    expect(c.liveAds).toBeGreaterThan(0);
    expect(c.verifiedRecruiters).toBe(1);
    expect(c.applications).toBe(3);
  });
});
