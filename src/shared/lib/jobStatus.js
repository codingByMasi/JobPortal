// Rules about an ad's status, in one place: what it is called, who can do what, how it is ordered.

export const STATUSES = ['draft', 'pending_payment', 'paid_pending_review', 'live', 'hidden', 'rejected', 'expired'];
export const DAY = 86400000;

/** The status people should see: a live ad whose end time has passed counts as expired (the server may lag a few minutes). */
export function effectiveStatus(job, now = Date.now()) {
  if (job.status === 'live' && job.expiresAt != null && job.expiresAt <= now) return 'expired';
  return job.status;
}

/** True when visitors may see the ad. */
export const isPubliclyVisible = (job, now = Date.now()) => job.status === 'live' && job.expiresAt != null && job.expiresAt > now;

/** Employers can edit an ad that waits for approval, and fix an ad the admin rejected (then they send it for review again). Ads from before migration 0028 may still wait for payment. */
export const canEditAsRecruiter = (job) => ['pending_payment', 'paid_pending_review', 'rejected'].includes(job.status);

/** Employers can withdraw (delete) an ad only when it is not running: waiting for approval, rejected or ended. Live ads are hidden by us, not deleted. */
export const canDelete = (job, now = Date.now()) =>
  ['draft', 'pending_payment', 'paid_pending_review', 'rejected'].includes(job.status) || effectiveStatus(job, now) === 'expired';

/** Once an ad is approved employers cannot edit it, but they can ask us to change it (while it waits or after a rejection they edit it themselves). */
export const canRequestChange = (job) => !['pending_payment', 'draft', 'paid_pending_review'].includes(job.status);

/** Employers can renew an ad that has ended. */
export const canRenew = (job, now = Date.now()) => effectiveStatus(job, now) === 'expired';

/** The admin's "ending soon" window and "ended recently" window, in days. */
export const ENDING_SOON_DAYS = 3;
export const ENDED_RECENTLY_DAYS = 30;

/** A live ad that has not ended yet but ends within `days` days. */
export const endsSoon = (job, now = Date.now(), days = ENDING_SOON_DAYS) =>
  job.status === 'live' && job.expiresAt != null && job.expiresAt > now && job.expiresAt <= now + days * DAY;

/** An ad whose days are over and that ended within the last `days` days (these are the ones worth extending). */
export const endedRecently = (job, now = Date.now(), days = ENDED_RECENTLY_DAYS) =>
  effectiveStatus(job, now) === 'expired' && job.expiresAt != null && job.expiresAt > now - days * DAY;

/** Whole days left until the ad ends (at least 1 while it is still live). */
export const daysLeft = (job, now = Date.now()) => Math.max(1, Math.ceil((job.expiresAt - now) / DAY));

/** When approving: live from now for the package's days. */
export function approvalDates(now, days) {
  return { startsAt: now, expiresAt: now + days * DAY };
}

/** Public list order: featured first, then newest first. */
export function sortForPublic(jobs) {
  return [...jobs].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return (b.startsAt ?? b.posted ?? 0) - (a.startsAt ?? a.posted ?? 0);
  });
}

/**
 * What visitors may see: only ads that are live right now, featured first.
 * Used on fresh AND saved ads, so an ad that ended since the last visit never shows.
 * (Rows from the public view have no `status`, they are live by definition.)
 */
export function publicJobs(jobs, now = Date.now()) {
  return sortForPublic(jobs.filter((j) => isPubliclyVisible({ ...j, status: 'live' }, now)));
}

/** The extra admin buttons (more days, featured on or off, free ad). Kept apart from adminActions so those stay simple. */
export function adminExtraActions(job, now = Date.now()) {
  const s = effectiveStatus(job, now);
  if (s === 'pending_payment') return ['freeAd'];
  if (s === 'live') return ['extend', job.featured ? 'unfeature' : 'feature'];
  if (s === 'hidden') return ['extend'];
  if (s === 'expired') return ['extend']; // an ended ad can be extended and goes live again
  return [];
}

/** Which admin buttons make sense for an ad in this status. */
export function adminActions(job, now = Date.now()) {
  const s = effectiveStatus(job, now);
  const base = ['edit', 'delete'];
  if (s === 'pending_payment') return ['markPaid', ...base];
  if (s === 'paid_pending_review') return ['approve', 'reject', ...base];
  if (s === 'live') return ['hide', ...base];
  if (s === 'hidden') return ['show', ...base];
  if (s === 'rejected') return ['approve', ...base]; // paid, then rejected: the admin may change their mind
  // an ended ad is not approved again: the employer renews it (a new ad and a new payment)
  return base;
}
