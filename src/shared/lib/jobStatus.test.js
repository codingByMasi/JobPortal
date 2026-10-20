import { describe, expect, it } from 'vitest';
import { adminActions, adminExtraActions, approvalDates, canDelete, canEditAsRecruiter, canRenew, canRequestChange, DAY, daysLeft, effectiveStatus, endedRecently, endsSoon, isPubliclyVisible, publicJobs, sortForPublic } from './jobStatus';

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
  it('employers edit while the ad waits for approval, or after a rejection (then they send it again), never once it is live, hidden or ended', () => {
    for (const status of ['pending_payment', 'paid_pending_review', 'rejected']) expect(canEditAsRecruiter(job({ status }))).toBe(true);
    for (const status of ['live', 'hidden', 'expired']) expect(canEditAsRecruiter(job({ status }))).toBe(false);
  });
  it('employers withdraw only ads that are not running: waiting, rejected or ended', () => {
    for (const status of ['pending_payment', 'paid_pending_review', 'rejected', 'expired']) expect(canDelete(job({ status, expiresAt: null }), NOW)).toBe(true);
    expect(canDelete(job({ expiresAt: NOW - 1 }), NOW)).toBe(true);
    for (const status of ['live', 'hidden']) expect(canDelete(job({ status }), NOW)).toBe(false);
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
  it('employers can ask for a change once an ad is approved (while it waits they edit it themselves)', () => {
    for (const status of ['pending_payment', 'draft', 'paid_pending_review']) expect(canRequestChange({ status })).toBe(false); // the employer edits these themselves
    for (const status of ['live', 'hidden', 'rejected', 'expired']) expect(canRequestChange({ status })).toBe(true);
  });
});

describe('adminExtraActions', () => {
  const live = { status: 'live', expiresAt: Date.now() + 86400000, featured: false };
  it('gives the right extra buttons per status', async () => {
    const { adminExtraActions } = await import('./jobStatus');
    expect(adminExtraActions({ status: 'pending_payment' })).toEqual(['freeAd']);
    expect(adminExtraActions(live)).toEqual(['extend', 'feature']);
    expect(adminExtraActions({ ...live, featured: true })).toEqual(['extend', 'unfeature']);
    expect(adminExtraActions({ status: 'hidden', expiresAt: Date.now() + 86400000 })).toEqual(['extend']);
    expect(adminExtraActions({ status: 'rejected' })).toEqual([]);
  });
});

describe('ending soon and ended recently', () => {
  it('a live ad ending within 3 days is "ending soon"; later ones, ended ones and other statuses are not', () => {
    expect(endsSoon(job({ expiresAt: NOW + 2 * DAY }), NOW)).toBe(true);
    expect(endsSoon(job({ expiresAt: NOW + 3 * DAY }), NOW)).toBe(true);
    expect(endsSoon(job({ expiresAt: NOW + 3 * DAY + 1 }), NOW)).toBe(false);
    expect(endsSoon(job({ expiresAt: NOW }), NOW)).toBe(false);
    expect(endsSoon(job({ expiresAt: NOW - 1 }), NOW)).toBe(false);
    expect(endsSoon(job({ status: 'hidden', expiresAt: NOW + DAY }), NOW)).toBe(false);
    expect(endsSoon(job({ expiresAt: null }), NOW)).toBe(false);
  });
  it('an ad is "ended recently" for 30 days after its days run out, whether or not the server has marked it expired yet', () => {
    expect(endedRecently(job({ expiresAt: NOW - DAY }), NOW)).toBe(true);
    expect(endedRecently(job({ status: 'expired', expiresAt: NOW - 29 * DAY }), NOW)).toBe(true);
    expect(endedRecently(job({ status: 'expired', expiresAt: NOW - 31 * DAY }), NOW)).toBe(false);
    expect(endedRecently(job({ expiresAt: NOW + DAY }), NOW)).toBe(false);
    expect(endedRecently(job({ status: 'rejected', expiresAt: null }), NOW)).toBe(false);
  });
  it('counts whole days left, never less than 1 while live', () => {
    expect(daysLeft(job({ expiresAt: NOW + 2 * DAY - 1000 }), NOW)).toBe(2);
    expect(daysLeft(job({ expiresAt: NOW + 1000 }), NOW)).toBe(1);
  });
  it('the admin can add days to an ended ad', () => {
    expect(adminExtraActions(job({ expiresAt: NOW - 1 }), NOW)).toContain('extend');
    expect(adminExtraActions(job({ status: 'expired', expiresAt: NOW - DAY }), NOW)).toContain('extend');
  });
});
