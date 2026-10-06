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

/** Employers can edit an ad while it waits for payment, or after it was rejected (then they send it for review again). */
export const canEditAsRecruiter = (job) => job.status === 'pending_payment' || job.status === 'rejected';

/** Employers pay only while the ad waits for payment. */
export const canPay = (job) => job.status === 'pending_payment';

/** Employers can delete an ad only when nothing is running: unpaid, rejected or ended. Paid ads are hidden by us, not deleted. */
export const canDelete = (job, now = Date.now()) =>
  ['draft', 'pending_payment', 'rejected'].includes(job.status) || effectiveStatus(job, now) === 'expired';

/** Once an ad is past "waiting for payment" employers cannot edit it, but they can ask us to change it. */
export const canRequestChange = (job) => job.status !== 'pending_payment' && job.status !== 'draft';

/** Employers can renew an ad that has ended. */
export const canRenew = (job, now = Date.now()) => effectiveStatus(job, now) === 'expired';

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
