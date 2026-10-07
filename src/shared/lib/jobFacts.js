// The structured facts of a job (salary, experience, vacancies, last date, visa): showing them and checking what an employer typed.

const DAY = 86400000;

/** "AED 1,500 - 2,200", "AED 1,500" or "" when no salary was given. */
export function salaryText(job) {
  const { salaryMin: min, salaryMax: max, currency } = job;
  if (min == null && max == null) return '';
  const n = (v) => v.toLocaleString('en-IN');
  const range = min != null && max != null && max !== min ? `${n(min)} - ${n(max)}` : n(min ?? max);
  return `${currency || ''} ${range}`.trim();
}

/** An ad that went live less than 3 days ago gets the "New" tag. */
export function isNewAd(job, now = Date.now()) {
  const from = job.startsAt || job.posted;
  return Boolean(from) && now - from >= 0 && now - from < 3 * DAY;
}

/** Midnight (local time) of a YYYY-MM-DD text, or null. */
export function dayStart(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

/** True when the last date has passed (the day itself still counts). */
export const isPastLastDate = (job, now = Date.now()) => job.lastDate != null && now >= job.lastDate + DAY;

const number = (s) => (String(s ?? '').trim() === '' ? null : Number(String(s).replace(/,/g, '')));

/** Checks the text boxes of the facts form. Returns { field: errorKey } (empty when everything is fine). `now` is for tests. */
export function checkFacts(v, now = Date.now()) {
  const errors = {};
  const min = number(v.salaryMin);
  const max = number(v.salaryMax);
  const ok = (x) => x === null || (Number.isInteger(x) && x >= 0 && x <= 10000000);
  if (!ok(min)) errors.salaryMin = 'errSalary';
  if (!ok(max)) errors.salaryMax = 'errSalary';
  if (!errors.salaryMin && !errors.salaryMax && min !== null && max !== null && max < min) errors.salaryMax = 'errSalaryOrder';
  if ((min !== null || max !== null) && !v.currency) errors.currency = 'errRequired';
  const vac = number(v.vacancies);
  if (vac !== null && !(Number.isInteger(vac) && vac >= 1 && vac <= 9999)) errors.vacancies = 'errVacancies';
  if (v.lastDate) {
    const d = dayStart(v.lastDate);
    const today = dayStart(new Date(now).toISOString().slice(0, 10));
    if (d === null || d < today - DAY) errors.lastDate = 'errLastDate';
  }
  return errors;
}

/** Text boxes -> the values the data layer takes (numbers or null). The currency is dropped when there is no salary. */
export function factsFromForm(v) {
  const min = number(v.salaryMin);
  const max = number(v.salaryMax);
  return {
    salaryMin: min,
    salaryMax: max,
    currency: min !== null || max !== null ? v.currency || null : null,
    experienceLevel: v.experienceLevel || null,
    vacancies: number(v.vacancies),
    lastDate: v.lastDate || null,
    visaType: String(v.visaType || '').trim() || null,
  };
}
