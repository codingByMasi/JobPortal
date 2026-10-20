// Demo backend: the rules of migration 0012, so demo mode behaves like the real database.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOGINS } from './seed';
import { setStatus, unpaid } from '../legacy.testkit';

const DAY = 86400000;
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

const asEmployer = () => api.signIn(DEMO_LOGINS.recruiter);
const asAdmin = () => api.signIn(DEMO_LOGINS.admin);
const newAd = (o = {}) => ({ title: 'Test plumber', country: 'uae', city: 'Dubai', category: 'plumber', whatsapp: '919876543210', packageId: 'pkg-30', ...o });

describe('hardening rules in demo mode (same as migration 0012)', () => {
  it('an ad needs a valid WhatsApp number; a 10-digit number gets 91 in front', async () => {
    await asEmployer();
    await expect(api.createJob(newAd({ whatsapp: '123' }))).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    const job = await api.createJob(newAd({ whatsapp: '98765 43210' }));
    expect(job.whatsapp).toBe('919876543210');
  });

  it('a new ad keeps its details text, picture link and small picture (found by the end-to-end run)', async () => {
    await asEmployer();
    const job = await setStatus(await api.createJob(newAd({ details: 'Salary 1800 AED', fileUrl: 'data:image/png;base64,AAAA', filePath: 'u-rec/a.jpg', fileType: 'image', thumbUrl: 'data:image/png;base64,BBBB', thumbPath: 'u-rec/a-t.jpg' })), 'rejected'); // a rejected ad is the one an employer edits
    const mine = (await api.listMyJobs()).find((j) => j.id === job.id);
    expect(mine).toMatchObject({ details: 'Salary 1800 AED', thumbPath: 'u-rec/a-t.jpg' });
    expect(mine.thumbUrl).toContain('data:image');
    const edited = await api.updateJob(job.id, { title: 'Edited title', details: 'Salary 1900 AED' });
    expect(edited).toMatchObject({ details: 'Salary 1900 AED', thumbPath: 'u-rec/a-t.jpg' });
  });
  it('the price and days are saved with the ad: a package change later does not alter what is charged', async () => {
    await asEmployer();
    const job = await unpaid(api.createJob(newAd({ packageId: 'pkg-7' }))); // an ad from before migration 0028
    await api.signOut();
    await asAdmin();
    await api.adminSavePackage({ id: 'pkg-7', name: '7 Days', pricePaise: 999900, durationDays: 90, featured: false, active: true });
    const pay = await api.adminMarkPaid(job.id, { reference: 'UTR1' });
    expect(pay.amountPaise).toBe(29900);
    await api.adminApprove(job.id);
    const approved = (await api.adminListJobs()).find((j) => j.id === job.id);
    expect(approved.expiresAt - approved.startsAt).toBe(7 * DAY);
  });

  it('approve only from "waiting for approval" (or rejected); reject, hide and show check the status', async () => {
    await asAdmin();
    await expect(api.adminApprove('job-7')).rejects.toMatchObject({ code: 'NOT_NOW' });
    await expect(api.adminApprove('job-1')).rejects.toMatchObject({ code: 'NOT_NOW' });
    await expect(api.adminApprove('job-8')).rejects.toMatchObject({ code: 'NOT_NOW' });
    await expect(api.adminReject('job-1', 'x')).rejects.toMatchObject({ code: 'NOT_NOW' });
    await expect(api.adminReject('job-6', '  ')).rejects.toBeTruthy();
    await expect(api.adminSetHidden('job-7', true)).rejects.toMatchObject({ code: 'NOT_NOW' });
    await expect(api.adminSetHidden('job-1', false)).rejects.toMatchObject({ code: 'NOT_NOW' });
    await expect(api.adminApprove('job-9')).resolves.toBeTruthy();
  });

  it('a payment reference can be used once; an ad has one paid payment; refund can hide the ad', async () => {
    await asAdmin();
    await api.adminMarkPaid('job-7', { reference: 'UTR-77' });
    await expect(api.adminAddPayment({ recruiterId: 'u-rec', jobId: null, amountPaise: 100, reference: 'utr-77' })).rejects.toMatchObject({ code: 'REFERENCE_USED' });
    await expect(api.adminAddPayment({ recruiterId: 'u-rec', jobId: 'job-1', amountPaise: 100 })).rejects.toMatchObject({ code: 'REFERENCE_USED' });
    await api.adminRefund('pay-1', { hideAd: true });
    expect((await api.adminListJobs()).find((j) => j.id === 'job-1').status).toBe('hidden');
    await expect(api.adminRefund('pay-1')).rejects.toMatchObject({ code: 'NOT_NOW' });
  });

  it('employers withdraw only ads that are not running (waiting, rejected or ended), never live or hidden ones', async () => {
    await asEmployer();
    await expect(api.deleteJob({ id: 'job-1' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.deleteJob({ id: 'job-6' })).resolves.toBeUndefined(); // waiting for approval: can be withdrawn
    await expect(api.deleteJob({ id: 'job-7' })).resolves.toBeUndefined();
    await expect(api.deleteJob({ id: 'job-8' })).resolves.toBeUndefined();
  });

  it('blocking an employer hides their live ads', async () => {
    await asAdmin();
    await api.adminSetRecruiter('u-rec', { blocked: true });
    expect((await api.listLiveJobs()).some((j) => j.recruiterId === 'u-rec')).toBe(false);
  });

  it('a verified employer who changes the company name loses the verified tag', async () => {
    await asEmployer();
    await api.updateProfile('u-rec', { companyName: 'Gulf Works', phone: '9000000000', raNumber: 'B-1234/DEL/2020' });
    expect((await api.getProfile('u-rec')).verified).toBe(true);
    await api.updateProfile('u-rec', { companyName: 'Famous Group', phone: '9000000000', raNumber: 'B-1234/DEL/2020' });
    expect((await api.getProfile('u-rec')).verified).toBe(false);
  });

  it('a rejected ad can be fixed and sent for review again; other ads cannot', async () => {
    await api.signIn({ email: 'other@example.com', password: 'other12345' });
    await api.updateJob('job-9', { title: 'Driver wanted (phone added)' });
    expect((await api.resubmitJob('job-9')).status).toBe('paid_pending_review');
    await expect(api.resubmitJob('job-4')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('password reset: a new password of 8+ letters works for the next login', async () => {
    await api.requestPasswordReset(DEMO_LOGINS.recruiter.email);
    await expect(api.updatePassword('short')).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await api.updatePassword('brand-new-pass');
    await api.signOut();
    await expect(api.signIn(DEMO_LOGINS.recruiter)).rejects.toMatchObject({ code: 'LOGIN' });
    await expect(api.signIn({ email: DEMO_LOGINS.recruiter.email, password: 'brand-new-pass' })).resolves.toBeUndefined();
  });

  it('one live ad can be fetched by id; an ad that is not live cannot', async () => {
    expect((await api.getLiveJob('job-1')).title).toBe('Plumbers Needed');
    expect(await api.getLiveJob('job-6')).toBeNull();
  });
});

describe('applicant details only for verified employers (same as migration 0014)', () => {
  it('a verified employer sees applicants; an unverified one sees only a number', async () => {
    await asEmployer();
    expect((await api.listMyApplications()).length).toBeGreaterThan(0);
    await api.signOut();
    await api.signIn({ email: 'other@example.com', password: 'other12345' }); // not verified
    expect(await api.listMyApplications()).toEqual([]);
    expect(await api.countMyApplications()).toBeGreaterThanOrEqual(0);
  });
});

describe('error log in demo mode (same idea as migration 0017)', () => {
  it('anyone can report; the same crash is counted; only the admin reads and clears the list', async () => {
    await api.logError({ message: 'TypeError: x is undefined', page: '/jobs', agent: 'TestBrowser' });
    await api.logError({ message: 'TypeError: x is undefined', page: '/jobs', agent: 'TestBrowser' });
    await api.logError({ message: '   ' });
    await asEmployer();
    await expect(api.adminListErrors()).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await api.signOut();
    await asAdmin();
    const list = await api.adminListErrors();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ message: 'TypeError: x is undefined', page: '/jobs', times: 2 });
    await api.adminClearErrors();
    expect(await api.adminListErrors()).toEqual([]);
  });
});
