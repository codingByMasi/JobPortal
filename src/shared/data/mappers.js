// Converts database rows (snake_case, text dates) to the plain objects the screens use (camelCase, timestamps), and back.
import { normalizeWhatsapp } from '../lib/phone.js';
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

/** Midnight (local time) of a YYYY-MM-DD text from the database. */
function dayStartOf(text) {
  const [y, m, d] = String(text).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
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
    description: row.description || '',
    sortOrder: row.sort_order ?? 0,
    badgeText: row.badge_text || '',
    maxFiles: row.max_files ?? 1,
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
    raNumber: row.ra_number || '',
    verified: Boolean(row.verified),
    blocked: Boolean(row.blocked),
    emailNotifications: row.email_notifications !== false,
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
    thumbUrl: safeFileUrl(row.thumb_url, allowData),
    thumbPath: row.thumb_path || null,
    details: row.details || '',
    salaryMin: row.salary_min ?? null,
    salaryMax: row.salary_max ?? null,
    currency: row.currency || null,
    experienceLevel: row.experience_level || null,
    vacancies: row.vacancies ?? null,
    lastDate: row.last_date ? dayStartOf(row.last_date) : null,
    visaType: row.visa_type || null,
    raNumber: row.recruiter_ra_number || (row.recruiter?.verified ? row.recruiter?.ra_number : '') || '',
    priceAtOrder: row.price_paise_at_order ?? null,
    listPricePaise: row.list_price_paise ?? row.price_paise_at_order ?? null,
    discountPaise: row.discount_paise ?? 0,
    finalPricePaise: row.final_price_paise ?? row.price_paise_at_order ?? null,
    durationDaysFinal: row.duration_days_final ?? row.days_at_order ?? null,
    offerId: row.offer_id ?? null,
    featuredOverride: row.featured_override ?? null,
    fileType: row.file_type === 'pdf' ? 'pdf' : 'image',
    whatsapp: normalizeWhatsapp(row.whatsapp),
    posted: toTime(row.posted_date),
    startsAt: toTime(row.starts_at),
    expiresAt: toTime(row.expires_at),
    status: row.status || 'live', // the public view only has live ads
    rejectReason: row.reject_reason || '',
    featured: row.featured ?? row.featured_override ?? Boolean(row.package?.featured),
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
    details: 'details', thumbUrl: 'thumb_url', thumbPath: 'thumb_path',
    salaryMin: 'salary_min', salaryMax: 'salary_max', currency: 'currency', experienceLevel: 'experience_level',
    vacancies: 'vacancies', lastDate: 'last_date', visaType: 'visa_type',
  };
  for (const [from, to] of Object.entries(map)) {
    if (input[from] !== undefined) row[to] = input[from] === '' && (from === 'fileUrl' || from === 'filePath' || from === 'thumbUrl' || from === 'thumbPath') ? null : input[from];
  }
  if (row.title !== undefined) row.title = String(row.title).trim();
  if (row.company !== undefined) row.company = String(row.company).trim();
  if (row.city !== undefined) row.city = String(row.city).trim();
  if (row.details !== undefined) row.details = String(row.details).trim();
  if (row.whatsapp !== undefined) row.whatsapp = normalizeWhatsapp(row.whatsapp);
  return row;
}

/** One row of the public list of verified agencies (no contact details). */
export function toAgency(row) {
  return { companyName: row.company_name, raNumber: row.ra_number || '', liveAds: Number(row.live_ads) || 0 };
}

/** The license an employer sent so the admin can verify them. */
export function toVerification(row) {
  return {
    id: row.id,
    recruiterId: row.recruiter_id,
    licenseNumber: row.license_number,
    filePath: row.file_path,
    status: row.status,
    rejectReason: row.reject_reason || '',
    createdAt: Date.parse(row.created_at) || null,
  };
}

/** A payment proof the employer sent (UTR number + screenshot) for the admin to check. */
export function toProof(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    recruiterId: row.recruiter_id,
    reference: row.reference,
    filePath: row.file_path,
    status: row.status,
    rejectReason: row.reject_reason || '',
    createdAt: Date.parse(row.created_at) || null,
  };
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
    reference: row.reference || '',
    listPricePaise: row.list_price_paise ?? row.amount_paise,
    discountPaise: row.discount_paise ?? 0,
    finalPricePaise: row.final_price_paise ?? row.amount_paise,
    createdAt: toTime(row.created_at),
  };
}

export function toOffer(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    value: Number(row.value),
    appliesTo: row.applies_to,
    packageId: row.package_id ?? null,
    recruiterId: row.recruiter_id ?? null,
    recruiterName: row.recruiter?.company_name || '',
    couponCode: row.coupon_code || '',
    startsAt: toTime(row.starts_at),
    endsAt: toTime(row.ends_at),
    maxUses: row.max_uses ?? null,
    maxUsesPerRecruiter: row.max_uses_per_recruiter ?? 1,
    active: row.active !== false,
    createdAt: toTime(row.created_at),
  };
}

export function toRedemption(row) {
  return {
    id: row.id,
    offerId: row.offer_id,
    recruiterId: row.recruiter_id,
    recruiterName: row.recruiter?.company_name || '',
    jobId: row.job_id,
    jobTitle: row.job?.title || '',
    discountPaise: row.discount_paise ?? 0,
    bonusDays: row.bonus_days ?? 0,
    createdAt: toTime(row.created_at),
  };
}

export function toAuditEntry(row) {
  return {
    id: row.id,
    adminId: row.admin_id ?? null,
    adminName: row.admin?.company_name || row.admin?.email || '',
    action: row.action,
    tableName: row.table_name,
    recordId: row.record_id ?? null,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
    createdAt: toTime(row.created_at),
  };
}

/** The answer of quote_price (database) or computeQuote (demo): prices in paise, a short `code` the screens turn into words. */
export function toQuote(q) {
  return {
    ok: Boolean(q.ok),
    code: q.code,
    listPricePaise: q.list_price_paise ?? q.listPricePaise ?? 0,
    discountPaise: q.discount_paise ?? q.discountPaise ?? 0,
    finalPricePaise: q.final_price_paise ?? q.finalPricePaise ?? 0,
    bonusDays: q.bonus_days ?? q.bonusDays ?? 0,
    baseDays: q.base_days ?? q.baseDays ?? 0,
    finalDays: q.final_days ?? q.finalDays ?? 0,
    offerId: q.offer_id ?? q.offerId ?? null,
    offerName: q.offer_name ?? q.offerName ?? '',
    offerType: q.offer_type ?? q.offerType ?? '',
    percent: q.percent ?? null,
    viaCode: Boolean(q.via_code ?? q.viaCode),
    jobStatus: q.job_status ?? q.jobStatus ?? null,
  };
}

export function toErrorLog(row) {
  return {
    id: row.id,
    message: row.message,
    page: row.page || '',
    agent: row.agent || '',
    times: row.times || 1,
    createdAt: toTime(row.created_at),
    lastAt: toTime(row.last_at),
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

export function toChangeRequest(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job?.title || '',
    recruiterId: row.recruiter_id,
    employerName: row.recruiter?.company_name || '',
    employerPhone: row.recruiter?.phone || '',
    message: row.message,
    status: row.status,
    createdAt: toTime(row.created_at),
    handledAt: toTime(row.handled_at),
  };
}

export function toReport(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job?.title || '',
    employerName: row.job?.recruiter?.company_name || '',
    reason: row.reason,
    message: row.message || '',
    contact: row.contact || '',
    status: row.status,
    createdAt: toTime(row.created_at),
  };
}

export function toDeletionRequest(row) {
  return { id: row.id, email: row.email, note: row.note || '', status: row.status, createdAt: toTime(row.created_at) };
}

/** What the home page counters get from public_counts (or the demo copy). */
export function toCounts(c) {
  return {
    liveAds: Number(c.live_ads ?? c.liveAds ?? 0),
    verifiedRecruiters: Number(c.verified_recruiters ?? c.verifiedRecruiters ?? 0),
    applications: Number(c.applications ?? 0),
  };
}
