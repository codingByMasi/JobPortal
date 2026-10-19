// Test helper only (never part of the site): turns a freshly posted demo ad into one from BEFORE migration 0028, i.e. waiting for payment with the plan's price saved.
// New ads from employers are free and wait for approval; the admin's payment tools still work on old ads, and these tests keep checking them.

/** Awaits `jobPromise` (the result of api.createJob) and returns the same job, now waiting for payment. */
export async function unpaid(jobPromise) {
  const job = await jobPromise;
  const { state } = await import('./demo/store');
  const row = state.db.jobs.find((j) => j.id === job.id);
  const pkg = state.db.packages.find((p) => p.id === row.package_id);
  Object.assign(row, {
    status: 'pending_payment',
    price_paise_at_order: pkg.price_paise, days_at_order: pkg.duration_days,
    list_price_paise: pkg.price_paise, discount_paise: 0, final_price_paise: pkg.price_paise, duration_days_final: pkg.duration_days,
  });
  return { ...job, status: 'pending_payment' };
}

/** Sets an ad's status directly (for example to "rejected", the one state an employer can edit from). */
export async function setStatus(job, status) {
  const { state } = await import('./demo/store');
  state.db.jobs.find((j) => j.id === job.id).status = status;
  return job;
}
