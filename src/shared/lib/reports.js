// Small helper for the admin reports list.

/** { adId: number of OPEN reports about it }, so the admin sees at once when one ad was reported many times. */
export function reportsOpenPerAd(reports) {
  const per = {};
  for (const r of reports) if (r.status === 'open') per[r.jobId] = (per[r.jobId] || 0) + 1;
  return per;
}
