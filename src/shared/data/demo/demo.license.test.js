// Demo backend: license verification, free posting, approving with days and extending an ended ad (migration 0028), so demo mode behaves like the database.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setStatus } from '../legacy.testkit';
import { DEMO_LOGINS } from './seed';

const DAY = 86400000;
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

const asNewbie = () => api.signIn({ email: 'other@example.com', password: 'other12345' }); // not verified in the sample data
const asEmployer = () => api.signIn(DEMO_LOGINS.recruiter);
const asAdmin = () => api.signIn(DEMO_LOGINS.admin);
const file = () => ({ type: 'image/png', name: 'license.png' });
const ad = (o = {}) => ({ title: 'Test plumber', country: 'uae', city: 'Dubai', category: 'plumber', whatsapp: '919876543210', ...o });

describe('license verification (demo)', () => {
  it('an employer sends the license; a short number or a missing file is refused', async () => {
    await asNewbie();
    await expect(api.submitVerification({ licenseNumber: 'AB', file: file() })).rejects.toMatchObject({ code: 'LICENSE_NUMBER' });
    await expect(api.submitVerification({ licenseNumber: 'LIC-123', file: null })).rejects.toMatchObject({ code: 'LICENSE_FILE' });
    const sent = await api.submitVerification({ licenseNumber: '  LIC-123  ', file: file() });
    expect(sent).toMatchObject({ licenseNumber: 'LIC-123', status: 'submitted' });
    expect(await api.getMyVerification()).toMatchObject({ licenseNumber: 'LIC-123' });
  });

  it('an already verified employer cannot send one', async () => {
    await asEmployer();
    await expect(api.submitVerification({ licenseNumber: 'LIC-123', file: file() })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('the admin cannot verify without a license, can verify after one is sent, and the request becomes approved', async () => {
    await asAdmin();
    await expect(api.adminSetRecruiter('u-rec2', { verified: true })).rejects.toMatchObject({ code: 'LICENSE_NEEDED' });
    await asNewbie();
    await api.submitVerification({ licenseNumber: 'LIC-123', file: file() });
    await asAdmin();
    expect(await api.adminGetLicenseFileUrl((await api.adminListVerifications())[0].filePath)).toContain('data:image');
    await api.adminSetRecruiter('u-rec2', { verified: true });
    expect((await api.adminListVerifications())[0].status).toBe('approved');
    await asNewbie();
    expect((await api.createJob(ad())).status).toBe('paid_pending_review');
  });

  it('a rejected license needs a reason, blocks verifying, and can be sent again', async () => {
    await asNewbie();
    const sent = await api.submitVerification({ licenseNumber: 'LIC-123', file: file() });
    await asAdmin();
    await expect(api.adminRejectVerification(sent.id, '  ')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await api.adminRejectVerification(sent.id, 'Not readable');
    await expect(api.adminRejectVerification(sent.id, 'again')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminSetRecruiter('u-rec2', { verified: true })).rejects.toMatchObject({ code: 'LICENSE_NEEDED' });
    await asNewbie();
    expect(await api.getMyVerification()).toMatchObject({ status: 'rejected', rejectReason: 'Not readable' });
    expect(await api.submitVerification({ licenseNumber: 'LIC-124', file: file() })).toMatchObject({ status: 'submitted', rejectReason: '' });
  });

  it('an unverified employer cannot post an ad', async () => {
    await asNewbie();
    await expect(api.createJob(ad())).rejects.toMatchObject({ code: 'NOT_VERIFIED' });
  });
});

describe('approving with days and extending an ended ad (demo)', () => {
  it('the admin chooses the days; 0 and 400 are refused', async () => {
    await asEmployer();
    const job = await api.createJob(ad());
    await asAdmin();
    await expect(api.adminApprove(job.id, 0)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminApprove(job.id, 400)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await api.adminApprove(job.id, 12);
    const live = (await api.listLiveJobs()).find((j) => j.id === job.id);
    expect(live.expiresAt - live.startsAt).toBe(12 * DAY);
  });

  it('an ended ad is not shown; extending it makes it live again from now', async () => {
    await asEmployer();
    const job = await api.createJob(ad());
    await asAdmin();
    await api.adminApprove(job.id, 3);
    await api.adminUpdateJob(job.id, { expiresAt: Date.now() - 1000 });
    expect((await api.listLiveJobs()).map((j) => j.id)).not.toContain(job.id);
    await api.adminExtendJob(job.id, 10, 'Employer asked to run it again');
    const back = (await api.listLiveJobs()).find((j) => j.id === job.id);
    expect(back).toBeTruthy();
    expect(Math.round((back.expiresAt - Date.now()) / DAY)).toBe(10);
  });

  it('an ad that never went live cannot be extended', async () => {
    await asEmployer();
    const job = await api.createJob(ad());
    await asAdmin();
    await expect(api.adminExtendJob(job.id, 5, 'Too early')).rejects.toMatchObject({ code: 'NOT_NOW' });
    await setStatus(job, 'rejected');
    await expect(api.adminExtendJob(job.id, 5, 'Still no')).rejects.toMatchObject({ code: 'NOT_NOW' });
  });
});
