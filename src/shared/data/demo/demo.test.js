// The demo backend must follow the same rules as the real database. These tests are that promise in code.
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  ({ demoApi: api } = await import('./index'));
});

const asEmployer = () => api.signIn(DEMO_LOGINS.recruiter);
const asAdmin = () => api.signIn(DEMO_LOGINS.admin);
const newAd = (o = {}) => ({ title: 'Test plumber', country: 'uae', city: 'Dubai', category: 'plumber', whatsapp: '919876543210', packageId: 'pkg-30', ...o });

describe('visitors', () => {
  it('see only live ads that have not ended', async () => {
    const jobs = await api.listLiveJobs();
    expect(jobs.length).toBe(5);
    expect(jobs.every((j) => j.expiresAt > Date.now())).toBe(true);
    expect(jobs.map((j) => j.title)).not.toContain('Site Helper'); // expired
    expect(jobs.map((j) => j.title)).not.toContain('Office Assistant'); // waiting for approval
  });
  it('cannot use employer or admin functions', async () => {
    await expect(api.listMyJobs()).rejects.toMatchObject({ code: 'NEED_LOGIN' });
    await expect(api.createJob(newAd())).rejects.toMatchObject({ code: 'NEED_LOGIN' });
    await expect(api.adminListJobs()).rejects.toMatchObject({ code: 'NEED_LOGIN' });
  });
  it('can apply to a live ad, but not to one that is not live', async () => {
    await expect(api.submitApplication({ jobId: 'job-1', name: 'Ram', phone: '9876543210', city: '', message: '' })).resolves.toBeUndefined();
    await expect(api.submitApplication({ jobId: 'job-6', name: 'Ram', phone: '9876543210' })).rejects.toMatchObject({ code: 'ENDED' });
    await expect(api.submitApplication({ jobId: 'job-8', name: 'Ram', phone: '9876543210' })).rejects.toMatchObject({ code: 'ENDED' });
    await expect(api.submitApplication({ jobId: 'job-1', name: ' ', phone: '9876543210' })).rejects.toBeTruthy();
    await expect(api.submitApplication({ jobId: 'job-1', name: 'Ram', phone: 'abc' })).rejects.toBeTruthy();
  });
});

describe('visitors and spam', () => {
  it('cannot apply twice to the same ad with the same phone (with or without +91, spaces)', async () => {
    await api.submitApplication({ jobId: 'job-3', name: 'Ram', phone: '98765 43210' });
    await expect(api.submitApplication({ jobId: 'job-3', name: 'Ram again', phone: '+91 9876543210' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    await expect(api.submitApplication({ jobId: 'job-5', name: 'Ram', phone: '9876543210' })).resolves.toBeUndefined(); // another ad is fine
    await expect(api.submitApplication({ jobId: 'job-3', name: 'Sita', phone: '9876500099' })).resolves.toBeUndefined(); // another person is fine
  });
  it('an ad stops taking applications after 1000', async () => {
    const { state } = await import('./store'); // same module the demo backend uses
    for (let i = 0; i < 1000; i += 1) {
      state.db.applications.push({ id: `x${i}`, job_id: 'job-5', name: `P${i}`, phone: `9${String(i).padStart(9, '0')}`, city: '', message: '', created_at: new Date().toISOString() });
    }
    await expect(api.submitApplication({ jobId: 'job-5', name: 'Late', phone: '8000000000' })).rejects.toMatchObject({ code: 'LIMIT' });
    await expect(api.submitApplication({ jobId: 'job-3', name: 'Other ad', phone: '8000000000' })).resolves.toBeUndefined();
  });
});

describe('employers', () => {
  it('only see their own ads, payments and applications', async () => {
    await asEmployer();
    const jobs = await api.listMyJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.recruiterId === 'u-rec')).toBe(true);
    expect((await api.listMyPayments()).every((p) => p.recruiterId === 'u-rec')).toBe(true);
    const apps = await api.listMyApplications();
    expect(apps.every((a) => ['job-1', 'job-3', 'job-5', 'job-6', 'job-7', 'job-8'].includes(a.jobId))).toBe(true);
    expect(apps.map((a) => a.jobId)).not.toContain('job-2'); // belongs to the other employer
  });
  it('always start an ad as "waiting for payment", whatever they ask for', async () => {
    await asEmployer();
    const job = await api.createJob({ ...newAd(), status: 'live', expiresAt: Date.now() + DAY });
    expect(job.status).toBe('pending_payment');
    expect(job.startsAt).toBeNull();
    expect(job.expiresAt).toBeNull();
  });
  it('cannot keep more than 20 ads waiting for payment', async () => {
    await asEmployer(); // already has 1 waiting ad in the sample data
    for (let i = 0; i < 19; i += 1) await api.createJob(newAd({ title: `Waiting ad ${i}` }));
    await expect(api.createJob(newAd({ title: 'One too many' }))).rejects.toMatchObject({ code: 'TOO_MANY_ADS' });
  }, 30000);
  it('need an active package', async () => {
    await asEmployer();
    await expect(api.createJob(newAd({ packageId: 'nope' }))).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await asAdmin();
    await api.adminSavePackage({ id: 'pkg-7', name: '7 Days', pricePaise: 29900, durationDays: 7, featured: false, active: false });
    await asEmployer();
    await expect(api.createJob(newAd({ packageId: 'pkg-7' }))).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
  it('can edit while waiting for payment, but not after, and cannot change the package', async () => {
    await asEmployer();
    const job = await api.createJob(newAd());
    const edited = await api.updateJob(job.id, { title: 'Better title', packageId: 'pkg-30f', status: 'live' });
    expect(edited.title).toBe('Better title');
    expect(edited.packageId).toBe('pkg-30');
    expect(edited.status).toBe('pending_payment');
    await expect(api.updateJob('job-1', { title: 'Hacked' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' }); // live ad
    await expect(api.updateJob('job-2', { title: 'Hacked' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' }); // someone else's
  });
  it('cannot delete another employer\'s ad, and cannot use admin functions', async () => {
    await asEmployer();
    await expect(api.deleteJob({ id: 'job-2' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminApprove('job-6')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminMarkPaid('job-7')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminListPayments()).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminSetRecruiter('u-rec', { verified: true })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
  it('cannot post when blocked', async () => {
    await asAdmin();
    await api.adminSetRecruiter('u-rec', { blocked: true });
    await asEmployer();
    await expect(api.createJob(newAd())).rejects.toMatchObject({ code: 'BLOCKED' });
  });
  it('can sign up (password needs 8 characters, email must be new)', async () => {
    await expect(api.signUp({ email: 'a@b.co', password: 'short', companyName: 'X', phone: '9999999999' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await expect(api.signUp({ email: DEMO_LOGINS.recruiter.email, password: 'longenough1', companyName: 'X', phone: '9999999999' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await api.signUp({ email: 'new@b.co', password: 'longenough1', companyName: 'New Co', phone: '9999999999' });
    const me = await api.getSession();
    expect((await api.getProfile(me.id)).role).toBe('recruiter');
  });
});

describe('the whole journey: post, pay, approve, apply, hide, delete', () => {
  it('works end to end and money is recorded', async () => {
    await asEmployer();
    const job = await api.createJob(newAd({ title: 'Journey ad' }));

    await asAdmin();
    const payment = await api.adminMarkPaid(job.id);
    expect(payment).toMatchObject({ amountPaise: 79900, method: 'manual', status: 'paid' });
    await expect(api.adminMarkPaid(job.id)).rejects.toMatchObject({ code: 'NOT_WAITING' }); // cannot pay twice
    expect((await api.adminListJobs()).find((j) => j.id === job.id).status).toBe('paid_pending_review');
    expect((await api.listLiveJobs()).map((j) => j.id)).not.toContain(job.id); // not public yet

    const before = Date.now();
    await api.adminApprove(job.id);
    const live = (await api.listLiveJobs()).find((j) => j.id === job.id);
    expect(live).toBeTruthy();
    expect(live.expiresAt - live.startsAt).toBe(30 * DAY);
    expect(live.startsAt).toBeGreaterThanOrEqual(before);

    await api.submitApplication({ jobId: job.id, name: 'Sita', phone: '9876543210', city: 'Pune', message: 'Hello' });
    await asEmployer();
    expect((await api.listMyApplications()).map((a) => a.name)).toContain('Sita');
    expect((await api.listMyPayments()).map((p) => p.jobId)).toContain(job.id);

    await asAdmin();
    await api.adminSetHidden(job.id, true);
    expect((await api.listLiveJobs()).map((j) => j.id)).not.toContain(job.id);
    await expect(api.submitApplication({ jobId: job.id, name: 'Late', phone: '9876543210' })).rejects.toMatchObject({ code: 'ENDED' });
    await api.adminSetHidden(job.id, false);
    expect((await api.listLiveJobs()).map((j) => j.id)).toContain(job.id);

    await api.deleteJob({ id: job.id });
    expect((await api.adminListJobs()).map((j) => j.id)).not.toContain(job.id);
    expect((await api.adminListApplications()).map((a) => a.name)).not.toContain('Sita');
    expect((await api.adminListPayments()).find((p) => p.id === payment.id)).toBeTruthy(); // the money record stays
  });
  it('an ad disappears when its end time passes, and cannot be shown again', async () => {
    await asAdmin();
    await api.adminSetHidden('job-1', true);
    await api.adminUpdateJob('job-1', { expiresAt: Date.now() - 1000 });
    expect((await api.listLiveJobs()).map((j) => j.id)).not.toContain('job-1');
    await expect(api.adminSetHidden('job-1', false)).rejects.toMatchObject({ code: 'ENDED' });
  });
  it('the admin can add an ad that goes live at once, and reject with a reason', async () => {
    await asAdmin();
    const job = await api.adminCreateJob(newAd({ title: 'By admin', packageId: null }), 10);
    expect(job.status).toBe('live');
    expect(job.expiresAt - job.startsAt).toBe(10 * DAY);
    await api.adminReject('job-6', 'Phone missing');
    const rejected = (await api.adminListJobs()).find((j) => j.id === 'job-6');
    expect(rejected).toMatchObject({ status: 'rejected', rejectReason: 'Phone missing' });
  });
  it('dashboard counts match the data', async () => {
    await asAdmin();
    const counts = await api.adminCounts();
    expect(counts.live).toBe(5);
    expect(counts.review).toBe(1);
    expect(counts.waitingPayment).toBe(1);
    expect(counts.revenuePaise).toBeGreaterThan(0);
  });
  it('refunded payments do not count as money this month', async () => {
    await asAdmin();
    const before = (await api.adminCounts()).revenuePaise;
    const pay = (await api.adminListPayments()).find((p) => p.id === 'pay-1');
    await api.adminRefund(pay.id);
    expect((await api.adminCounts()).revenuePaise).toBe(before - pay.amountPaise);
  });
});

describe('change requests (same rules as migration 0011)', () => {
  it('an employer can ask for a change on their own paid ad and sees the request', async () => {
    await asEmployer();
    await api.createChangeRequest({ jobId: 'job-3', message: '  Change the city  ' });
    const mine = await api.listMyChangeRequests();
    expect(mine.find((r) => r.jobId === 'job-3')).toMatchObject({ message: 'Change the city', status: 'open' });
  });
  it('not for an ad waiting for payment, another employer ad, a blocked account, or a bad message', async () => {
    await asEmployer();
    await expect(api.createChangeRequest({ jobId: 'job-7', message: 'Change it' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.createChangeRequest({ jobId: 'job-2', message: 'Change it' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.createChangeRequest({ jobId: 'job-3', message: ' ab ' })).rejects.toMatchObject({ code: 'NEED_MESSAGE' });
    await expect(api.createChangeRequest({ jobId: 'job-3', message: 'x'.repeat(301) })).rejects.toMatchObject({ code: 'NEED_MESSAGE' });
    await api.signOut();
    await asAdmin();
    await api.adminSetRecruiter('u-rec', { blocked: true });
    await api.signOut();
    await asEmployer();
    await expect(api.createChangeRequest({ jobId: 'job-3', message: 'Change it' })).rejects.toMatchObject({ code: 'BLOCKED' });
  });
  it('at most 3 open requests per ad', async () => {
    await asEmployer();
    for (let i = 0; i < 2; i += 1) await api.createChangeRequest({ jobId: 'job-1', message: `Change ${i}` }); // job-1 already has 1 open
    await expect(api.createChangeRequest({ jobId: 'job-1', message: 'One more' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
  it('employers cannot use the admin functions; the admin sees all and can finish a request', async () => {
    await asEmployer();
    await expect(api.adminListChangeRequests()).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminSetChangeRequest('req-1', 'done')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await api.signOut();
    await asAdmin();
    expect((await api.adminCounts()).requests).toBe(1);
    const all = await api.adminListChangeRequests();
    expect(all[0]).toMatchObject({ id: 'req-1', jobTitle: 'Plumbers Needed', employerName: 'Gulf Works' });
    await api.adminSetChangeRequest('req-1', 'done');
    expect((await api.adminListChangeRequests())[0]).toMatchObject({ status: 'done' });
    expect((await api.adminListChangeRequests())[0].handledAt).toBeGreaterThan(0);
    expect((await api.adminCounts()).requests).toBe(0);
  });
  it('deleting an ad removes its requests', async () => {
    await asAdmin();
    await api.deleteJob({ id: 'job-1' });
    expect(await api.adminListChangeRequests()).toEqual([]);
  });
});
