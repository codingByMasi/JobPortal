// Demo backend: plans and offers behave like the database (migration 0018).
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

const asEmployer = () => api.signIn(DEMO_LOGINS.recruiter);
const asAdmin = () => api.signIn(DEMO_LOGINS.admin);
const ad = () => ({ title: 'Test plumber', country: 'uae', city: 'Dubai', category: 'plumber', whatsapp: '919876543210', packageId: 'pkg-30' });
const offer = (o) => ({ name: 'Offer', type: 'percent', value: 20, appliesTo: 'all', couponCode: '', active: true, ...o });

describe('quote and order', () => {
  it('a code gives a percent off, the order saves the price on the ad and a waiting payment', async () => {
    await asAdmin();
    await api.adminSaveOffer(offer({ couponCode: 'SAVE20' }));
    await api.signOut();
    await asEmployer();
    const q = await api.quotePrice('pkg-30', 'save20');
    expect(q).toMatchObject({ ok: true, listPricePaise: 79900, discountPaise: 15980, finalPricePaise: 63920 });
    const job = await api.createJob(ad());
    const done = await api.createAdOrder(job.id, 'pkg-30', 'SAVE20');
    expect(done.jobStatus).toBe('pending_payment');
    const mine = (await api.listMyJobs()).find((j) => j.id === job.id);
    expect(mine).toMatchObject({ listPricePaise: 79900, discountPaise: 15980, finalPricePaise: 63920 });
    expect((await api.listMyPayments()).filter((p) => p.jobId === job.id)).toHaveLength(1);
    await expect(api.createAdOrder((await api.createJob(ad())).id, 'pkg-30', 'SAVE20')).rejects.toThrow('already_used');
  });
  it('a free offer pays at once and sends the ad to review', async () => {
    await asAdmin();
    await api.adminSaveOffer(offer({ type: 'free', value: 0, couponCode: 'FREE1' }));
    await api.signOut();
    await asEmployer();
    const job = await api.createJob(ad());
    expect((await api.createAdOrder(job.id, 'pkg-30', 'FREE1')).jobStatus).toBe('paid_pending_review');
    const pay = (await api.listMyPayments()).find((p) => p.jobId === job.id);
    expect(pay).toMatchObject({ status: 'paid', method: 'free_offer', amountPaise: 0 });
  });
  it('refused codes give plain codes', async () => {
    await asAdmin();
    await api.adminSaveOffer(offer({ couponCode: 'OLD', endsAt: Date.now() - 1000, startsAt: Date.now() - 5000 }));
    await api.signOut();
    await asEmployer();
    expect((await api.quotePrice('pkg-30', 'OLD')).code).toBe('expired');
    expect((await api.quotePrice('pkg-30', 'NOPE')).code).toBe('not_found');
  });
  it('deleting an unpaid ad gives the offer use back', async () => {
    await asAdmin();
    await api.adminSaveOffer(offer({ couponCode: 'BACK1' }));
    await api.signOut();
    await asEmployer();
    const job = await api.createJob(ad());
    await api.createAdOrder(job.id, 'pkg-30', 'BACK1');
    await api.deleteJob(job);
    expect((await api.quotePrice('pkg-30', 'BACK1')).ok).toBe(true);
  });
});

describe('admin rules', () => {
  it('employers cannot use the admin functions', async () => {
    await asEmployer();
    await expect(api.adminSaveOffer(offer({}))).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminSavePackage({ name: 'x', pricePaise: 1, durationDays: 1, featured: false, active: true })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(api.adminGiveFreeAd('x', 'note')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
  it('a plan with ads cannot be deleted; changes are written to the history', async () => {
    await asAdmin();
    await expect(api.adminDeletePackage('pkg-30')).rejects.toMatchObject({ code: 'PLAN_HAS_ADS' });
    await api.adminSavePackage({ id: 'pkg-7', name: '7 Days', pricePaise: 30000, durationDays: 7, featured: false, active: true, badgeText: 'Cheap' });
    const log = await api.adminListAudit({ table: 'packages' });
    expect(log[0]).toMatchObject({ action: 'update' });
    expect(log[0].newValue.badge_text).toBe('Cheap');
  });
  it('the old ad keeps its price when the plan price changes', async () => {
    await asEmployer();
    const job = await api.createJob(ad());
    await api.createAdOrder(job.id, 'pkg-30', '');
    await api.signOut();
    await asAdmin();
    await api.adminSavePackage({ id: 'pkg-30', name: '30 Days', pricePaise: 500000, durationDays: 30, featured: false, active: true });
    expect((await api.adminListJobs()).find((j) => j.id === job.id).finalPricePaise).toBe(79900);
  });
  it('extend, feature and free ad', async () => {
    await asAdmin();
    const live = (await api.adminListJobs()).find((j) => j.status === 'live');
    const before = live.expiresAt;
    await api.adminExtendJob(live.id, 5, 'site was down');
    expect((await api.adminListJobs()).find((j) => j.id === live.id).expiresAt).toBe(before + 5 * 86400000);
    await expect(api.adminExtendJob(live.id, 5, '')).rejects.toMatchObject({ code: 'NEED_MESSAGE' });
    await api.adminSetFeatured(live.id, true);
    expect((await api.adminListJobs()).find((j) => j.id === live.id).featured).toBe(true);
    const waiting = (await api.adminListJobs()).find((j) => j.status === 'pending_payment');
    await api.adminGiveFreeAd(waiting.id, 'launch gift');
    expect((await api.adminListJobs()).find((j) => j.id === waiting.id).status).toBe('paid_pending_review');
  });
  it('sales stats count discounts and top offers', async () => {
    await asAdmin();
    await api.adminSaveOffer(offer({ couponCode: 'STAT1' }));
    await api.signOut();
    await asEmployer();
    const job = await api.createJob(ad());
    await api.createAdOrder(job.id, 'pkg-30', 'STAT1');
    await api.signOut();
    await asAdmin();
    await api.adminMarkPaid(job.id, { reference: 'UPI123456' });
    const s = await api.adminSalesStats();
    expect(s.discountPaise).toBe(15980);
    expect(s.topOffers[0]).toMatchObject({ uses: 1 });
  });
});
