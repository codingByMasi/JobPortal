import { describe, expect, it } from 'vitest';
import { adminActions, approvalDates, canDelete, canEditAsRecruiter, canPay, canRenew, canRequestChange, DAY, effectiveStatus, isPubliclyVisible, publicJobs, sortForPublic } from './jobStatus';

const NOW = Date.UTC(2026, 9, 5, 12);
const job = (o) => ({ id: 'a', status: 'live', expiresAt: NOW + DAY, featured: false, startsAt: NOW - DAY, ...o });

describe('effectiveStatus', () => {
  it('a live ad past its end time counts as expired', () => {
    expect(effectiveStatus(job({ expiresAt: NOW - 1 }), NOW)).toBe('expired');
    expect(effectiveStatus(job({ expiresAt: NOW }), NOW)).toBe('expired');
  });
  it('keeps every other status as it is', () => {
    for (const status of ['pending_payment', 'paid_pending_review', 'hidden', 'rejected', 'expired', 'draft']) {
      expect(effectiveStatus(job({ status, expiresAt: null }), NOW)).toBe(status);
    }
  });
});

describe('who can do what', () => {
  it('only live ads with a future end time are public', () => {
    expect(isPubliclyVisible(job(), NOW)).toBe(true);
    expect(isPubliclyVisible(job({ expiresAt: NOW - 1 }), NOW)).toBe(false);
    expect(isPubliclyVisible(job({ status: 'hidden' }), NOW)).toBe(false);
    expect(isPubliclyVisible(job({ status: 'live', expiresAt: null }), NOW)).toBe(false);
  });
  it('employers edit only while waiting for payment, or after a rejection (then they send it again)', () => {
    for (const status of ['pending_payment', 'rejected']) expect(canEditAsRecruiter(job({ status }))).toBe(true);
    for (const status of ['paid_pending_review', 'live', 'hidden', 'expired']) expect(canEditAsRecruiter(job({ status }))).toBe(false);
  });
  it('employers pay only while waiting for payment', () => {
    expect(canPay(job({ status: 'pending_payment' }))).toBe(true);
    for (const status of ['rejected', 'live', 'paid_pending_review']) expect(canPay(job({ status }))).toBe(false);
  });
  it('employers delete only unpaid, rejected or ended ads', () => {
    for (const status of ['pending_payment', 'rejected', 'expired']) expect(canDelete(job({ status, expiresAt: null }), NOW)).toBe(true);
    expect(canDelete(job({ expiresAt: NOW - 1 }), NOW)).toBe(true);
    for (const status of ['live', 'hidden', 'paid_pending_review']) expect(canDelete(job({ status }), NOW)).toBe(false);
  });
  it('employers renew only ended ads', () => {
    expect(canRenew(job({ status: 'expired' }), NOW)).toBe(true);
    expect(canRenew(job({ expiresAt: NOW - 5 }), NOW)).toBe(true);
    expect(canRenew(job(), NOW)).toBe(false);
  });
  it('admin buttons match the status', () => {
    expect(adminActions(job({ status: 'pending_payment' }), NOW)).toEqual(['markPaid', 'edit', 'delete']);
    expect(adminActions(job({ status: 'paid_pending_review' }), NOW)).toEqual(['approve', 'reject', 'edit', 'delete']);
    expect(adminActions(job(), NOW)).toEqual(['hide', 'edit', 'delete']);
    expect(adminActions(job({ status: 'hidden' }), NOW)).toEqual(['show', 'edit', 'delete']);
    expect(adminActions(job({ status: 'rejected' }), NOW)).toEqual(['approve', 'edit', 'delete']);
    expect(adminActions(job({ status: 'expired' }), NOW)).toEqual(['edit', 'delete']);
    expect(adminActions(job({ expiresAt: NOW - 5 }), NOW)).toEqual(['edit', 'delete']);
  });
});

describe('publicJobs (what visitors see)', () => {
  it('drops ads that ended, even if they were saved on the phone as live', () => {
    const saved = [job({ id: 'ended', expiresAt: NOW - 1 }), job({ id: 'ok' }), job({ id: 'ends-now', expiresAt: NOW })];
    expect(publicJobs(saved, NOW).map((j) => j.id)).toEqual(['ok']);
  });
  it('works on rows from the public view (no status field)', () => {
    const rows = [{ id: 'a', expiresAt: NOW + DAY, featured: false, startsAt: NOW - DAY }, { id: 'b', expiresAt: NOW + DAY, featured: true, startsAt: NOW - 2 * DAY }];
    expect(publicJobs(rows, NOW).map((j) => j.id)).toEqual(['b', 'a']);
  });
  it('handles an empty list', () => expect(publicJobs([], NOW)).toEqual([]));
});

describe('dates and order', () => {
  it('approval runs from now for the package days', () => {
    expect(approvalDates(NOW, 30)).toEqual({ startsAt: NOW, expiresAt: NOW + 30 * DAY });
  });
  it('featured ads come first, then newest first', () => {
    const list = [
      job({ id: 'old', startsAt: NOW - 5 * DAY }),
      job({ id: 'new', startsAt: NOW - DAY }),
      job({ id: 'star-old', featured: true, startsAt: NOW - 9 * DAY }),
    ];
    expect(sortForPublic(list).map((j) => j.id)).toEqual(['star-old', 'new', 'old']);
  });
});

describe('change requests', () => {
  it('employers can ask for a change once an ad is past "waiting for payment"', () => {
    expect(canRequestChange({ status: 'pending_payment' })).toBe(false);
    for (const status of ['paid_pending_review', 'live', 'hidden', 'rejected', 'expired']) expect(canRequestChange({ status })).toBe(true);
  });
});
