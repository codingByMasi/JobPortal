// Pure helpers for the jobs list: which currencies are in use, salary filter, and sort. Salaries in different currencies are never compared.

/** The pay used for comparing: the highest figure the ad shows, or null when it shows none. */
export function payOf(job) {
  const n = job.salaryMax ?? job.salaryMin;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Currencies that at least one ad shows a salary in, in the order of `order` (the catalog list). */
export function currenciesIn(jobs, order) {
  const used = new Set(jobs.filter((j) => payOf(j) !== null && j.currency).map((j) => j.currency));
  return order.filter((c) => used.has(c));
}

/** True when the ad has no salary rule to meet, or shows the chosen currency and at least `min` per month. */
export function matchSalary(job, { currency = '', min = 0 } = {}) {
  if (!currency) return true;
  const pay = payOf(job);
  return job.currency === currency && pay !== null && pay >= (Number(min) || 0);
}

/** 'pay' puts the highest pay first (ads without pay last); anything else keeps the order given (newest first). */
export function sortJobs(list, sort) {
  if (sort !== 'pay') return list;
  return list.map((job, i) => ({ job, i }))
    .sort((a, b) => (payOf(b.job) ?? -1) - (payOf(a.job) ?? -1) || a.i - b.i)
    .map((x) => x.job);
}
