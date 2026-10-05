// Converts database rows (snake_case, text dates) to the plain objects the screens use (camelCase, timestamps), and back.
import { safeFileUrl } from '../lib/safeUrl.js';

/** "2025-03-01" -> local midnight timestamp. Full timestamps are parsed as they are. Returns null for empty/bad. */
export function toTime(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Local midnight timestamp -> "YYYY-MM-DD". */
export function toDateString(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toPackage(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    pricePaise: row.price_paise,
    durationDays: row.duration_days,
    featured: Boolean(row.featured),
    active: row.active !== false,
  };
}

export function toProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email || '',
    role: row.role === 'admin' ? 'admin' : 'recruiter',
    companyName: row.company_name || '',
    phone: row.phone || '',
    verified: Boolean(row.verified),
    blocked: Boolean(row.blocked),
    createdAt: toTime(row.created_at),
  };
}

/**
 * Works for rows from the `jobs` table and from the `public_jobs` view.
 * File links are checked here once, so no screen ever sees an unsafe link. `allowData` is for demo mode.
 */
export function toJob(row, { allowData = false } = {}) {
  return {
    id: row.id,
    recruiterId: row.recruiter_id ?? null,
    packageId: row.package_id ?? null,
    title: row.title || '',
    company: row.company || '',
    country: row.country || 'others',
    city: row.city || '',
    category: row.category || 'other',
    fileUrl: safeFileUrl(row.file_url, allowData),
    filePath: row.file_path || null,
    fileType: row.file_type === 'pdf' ? 'pdf' : 'image',
    whatsapp: String(row.whatsapp || '').replace(/\D/g, ''),
    posted: toTime(row.posted_date),
    startsAt: toTime(row.starts_at),
    expiresAt: toTime(row.expires_at),
    status: row.status || 'live', // the public view only has live ads
    rejectReason: row.reject_reason || '',
    featured: row.featured ?? Boolean(row.package?.featured),
    verified: row.recruiter_verified ?? Boolean(row.recruiter?.verified),
    package: row.package ? toPackage(row.package) : null,
    recruiter: row.recruiter ? toProfile(row.recruiter) : null,
  };
}

/** Only the fields a person may type into the ad form, in database names. */
export function toJobRow(input) {
  const row = {};
  const map = {
    title: 'title', company: 'company', country: 'country', city: 'city', category: 'category',
    whatsapp: 'whatsapp', fileUrl: 'file_url', filePath: 'file_path', fileType: 'file_type', packageId: 'package_id',
  };
  for (const [from, to] of Object.entries(map)) {
    if (input[from] !== undefined) row[to] = input[from] === '' && (from === 'fileUrl' || from === 'filePath') ? null : input[from];
  }
  if (row.title !== undefined) row.title = String(row.title).trim();
  if (row.company !== undefined) row.company = String(row.company).trim();
  if (row.city !== undefined) row.city = String(row.city).trim();
  if (row.whatsapp !== undefined) row.whatsapp = String(row.whatsapp).replace(/\D/g, '');
  return row;
}

export function toPayment(row) {
  return {
    id: row.id,
    jobId: row.job_id ?? null,
    jobTitle: row.job?.title || '',
    recruiterId: row.recruiter_id,
    recruiterName: row.recruiter?.company_name || '',
    amountPaise: row.amount_paise,
    currency: row.currency || 'INR',
    method: row.method,
    status: row.status,
    note: row.note || '',
    createdAt: toTime(row.created_at),
  };
}

export function toApplication(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job?.title || '',
    company: row.job?.company || '',
    name: row.name,
    phone: row.phone,
    city: row.city || '',
    message: row.message || '',
    createdAt: toTime(row.created_at),
  };
}
