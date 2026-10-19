// Demo: everything only an admin can do. Every function checks the caller is an admin, like the database does.
import { approvalDates } from '../../lib/jobStatus';
import { toApplication, toChangeRequest, toErrorLog, toJobRow, toPayment, toProfile } from '../mappers';
import { asJob, fail, findJob, isLive, logAdmin, needAdmin, newest, pkgOf, profileOf, requestRows, save, state, uid, wait } from './store';

const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

export async function adminListJobs() {
  await wait();
  needAdmin();
  return [...state.db.jobs].sort(newest).map(asJob);
}

export async function adminUpdateJob(id, patch) {
  await wait();
  needAdmin();
  const row = findJob(id);
  Object.assign(row, toJobRow(patch));
  if (patch.expiresAt) row.expires_at = new Date(patch.expiresAt).toISOString();
  save();
  return asJob(row);
}

export async function adminCreateJob(input, days) {
  await wait();
  const p = needAdmin();
  const pkg = pkgOf(input.packageId);
  const { startsAt, expiresAt } = approvalDates(Date.now(), days || pkg?.duration_days || 30);
  const row = {
    file_url: null, file_path: null, thumb_url: null, thumb_path: null, details: '', file_type: 'image', company: '', city: '', whatsapp: '', ...toJobRow(input),
    id: uid(), recruiter_id: p.id, package_id: pkg ? pkg.id : null, status: 'live', starts_at: new Date(startsAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(), reject_reason: null, posted_date: today(), created_at: nowIso(),
  };
  state.db.jobs.push(row);
  save();
  return asJob(row);
}

export async function adminApprove(id, days = null) {
  await wait();
  needAdmin();
  const row = findJob(id);
  if (!['paid_pending_review', 'rejected'].includes(row.status)) throw fail('NOT_NOW', 'This ad cannot be approved now.');
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 365)) throw fail('NOT_ALLOWED', 'Days must be between 1 and 365.');
  const chosen = days ?? (row.duration_days_final || row.days_at_order || pkgOf(row.package_id)?.duration_days || 30);
  const { startsAt, expiresAt } = approvalDates(Date.now(), chosen);
  logAdmin('approve_job', row.id, `${chosen} days`);
  Object.assign(row, { status: 'live', starts_at: new Date(startsAt).toISOString(), expires_at: new Date(expiresAt).toISOString(), reject_reason: null });
  save();
  return asJob(row);
}

export async function adminReject(id, reason) {
  await wait();
  needAdmin();
  const row = findJob(id);
  if (!reason.trim()) throw fail('NOT_ALLOWED');
  if (row.status !== 'paid_pending_review') throw fail('NOT_NOW', 'This ad cannot be rejected now.');
  Object.assign(row, { status: 'rejected', reject_reason: reason.trim().slice(0, 300) });
  logAdmin('reject_job', id, reason.trim());
  save();
}

export async function adminSetHidden(id, hidden) {
  await wait();
  needAdmin();
  const row = findJob(id);
  if (hidden) {
    if (row.status !== 'live') throw fail('NOT_NOW', 'Only a live ad can be hidden.');
    row.status = 'hidden';
  } else {
    if (row.status !== 'hidden') throw fail('NOT_NOW', 'This ad is not hidden.');
    if (!(row.expires_at && Date.parse(row.expires_at) > Date.now())) throw fail('ENDED');
    row.status = 'live';
  }
  logAdmin(hidden ? 'hide_job' : 'show_job', id);
  save();
}

export async function adminMarkPaid(id, { amountPaise, note = '', reference = '' } = {}) {
  await wait();
  needAdmin();
  const row = findJob(id);
  if (row.status !== 'pending_payment') throw fail('NOT_WAITING', 'This ad is not waiting for payment.');
  const ref = String(reference || '').trim() || null;
  if (ref && state.db.payments.some((x) => (x.reference || '').toLowerCase() === ref.toLowerCase())) throw fail('REFERENCE_USED', 'payments_reference_unique');
  const amount = amountPaise ?? row.final_price_paise ?? row.price_paise_at_order ?? pkgOf(row.package_id)?.price_paise ?? 0;
  // like the database: the waiting payment saved with the order is filled in, not doubled
  let pay = state.db.payments.find((x) => x.job_id === row.id && x.status === 'created');
  if (pay) Object.assign(pay, { status: 'paid', method: 'manual', amount_paise: amount, note, reference: ref });
  else {
    state.db.payments.push((pay = {
      id: uid(), job_id: row.id, recruiter_id: row.recruiter_id, amount_paise: amount, currency: 'INR', method: 'manual', status: 'paid', note, reference: ref, created_at: nowIso(),
      list_price_paise: row.list_price_paise ?? null, discount_paise: row.discount_paise || 0, final_price_paise: row.final_price_paise ?? null, offer_id: row.offer_id ?? null, duration_days_final: row.duration_days_final ?? null,
    }));
  }
  logAdmin('mark_paid', row.id, `${amount} paise`);
  (state.db.payment_proofs || []).forEach((x) => { if (x.job_id === row.id && x.status === 'submitted') x.status = 'accepted'; });
  row.status = 'paid_pending_review';
  save();
  return toPayment(pay);
}

export async function adminListRecruiters() {
  await wait();
  needAdmin();
  return state.db.profiles.map(toProfile);
}

export async function adminSetRecruiter(id, patch) {
  await wait();
  needAdmin();
  const row = profileOf(id);
  if (!row) throw fail('NOT_FOUND');
  if (patch.verified && !row.verified) {
    // like the database (migration 0028): an employer needs a license on file; verifying closes the request as approved
    const req = (state.db.verification_requests || []).find((x) => x.recruiter_id === id && ['submitted', 'approved'].includes(x.status));
    if (!req) throw fail('LICENSE_NEEDED', 'license: needed');
    req.status = 'approved';
  }
  if (patch.verified !== undefined) row.verified = patch.verified;
  if (patch.blocked !== undefined) {
    if (patch.blocked && !row.blocked) state.db.jobs.forEach((j) => { if (j.recruiter_id === id && j.status === 'live') j.status = 'hidden'; });
    row.blocked = patch.blocked;
  }
  save();
}

export async function adminListPayments() {
  await wait();
  needAdmin();
  return [...state.db.payments]
    .sort(newest)
    .map((x) => toPayment({ ...x, job: state.db.jobs.find((j) => j.id === x.job_id), recruiter: profileOf(x.recruiter_id) }));
}

export async function adminAddPayment({ recruiterId, jobId, amountPaise, note = '', reference = '' }) {
  await wait();
  needAdmin();
  const ref = String(reference || '').trim() || null;
  if (ref && state.db.payments.some((x) => (x.reference || '').toLowerCase() === ref.toLowerCase())) throw fail('REFERENCE_USED', 'payments_reference_unique');
  if (jobId && state.db.payments.some((x) => x.job_id === jobId && x.status === 'paid')) throw fail('REFERENCE_USED', 'payments_one_paid_per_job');
  state.db.payments.push({
    id: uid(), job_id: jobId || null, recruiter_id: recruiterId, amount_paise: amountPaise, currency: 'INR',
    method: 'manual', status: 'paid', note, reference: ref, created_at: nowIso(),
  });
  save();
}

export async function adminRefund(id, { hideAd = false } = {}) {
  await wait();
  needAdmin();
  const row = state.db.payments.find((x) => x.id === id);
  if (!row) throw fail('NOT_FOUND');
  if (row.status !== 'paid') throw fail('NOT_NOW', 'This payment cannot be refunded.');
  row.status = 'refunded';
  const job = hideAd && row.job_id ? state.db.jobs.find((j) => j.id === row.job_id) : null;
  if (job && job.status === 'live') job.status = 'hidden';
  logAdmin('refund_payment', id, hideAd ? 'ad hidden' : '');
  save();
}

export async function adminListApplications() {
  await wait();
  needAdmin();
  return [...state.db.applications].sort(newest).map((a) => toApplication({ ...a, job: state.db.jobs.find((j) => j.id === a.job_id) }));
}

export async function adminCounts() {
  await wait();
  needAdmin();
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  return {
    live: state.db.jobs.filter((j) => isLive(j, now)).length,
    review: state.db.jobs.filter((j) => j.status === 'paid_pending_review').length,
    waitingPayment: state.db.jobs.filter((j) => j.status === 'pending_payment').length,
    requests: requestRows().filter((r) => r.status === 'open').length,
    revenuePaise: state.db.payments
      .filter((x) => x.status === 'paid' && Date.parse(x.created_at) >= monthStart)
      .reduce((sum, x) => sum + x.amount_paise, 0),
  };
}

export async function adminListChangeRequests() {
  await wait();
  needAdmin();
  return [...requestRows()].sort(newest).map((r) => toChangeRequest({ ...r, job: state.db.jobs.find((j) => j.id === r.job_id), recruiter: profileOf(r.recruiter_id) }));
}

export async function adminSetChangeRequest(id, status) {
  await wait();
  needAdmin();
  const row = requestRows().find((r) => r.id === id);
  if (!row) throw fail('NOT_FOUND');
  row.status = status;
  row.handled_at = status === 'open' ? null : new Date().toISOString();
  save();
}

export async function adminListErrors() {
  await wait();
  needAdmin();
  return [...(state.db.error_log ||= [])].sort((a, b) => (a.last_at < b.last_at ? 1 : -1)).map(toErrorLog);
}

export async function adminClearErrors() {
  await wait();
  needAdmin();
  state.db.error_log = [];
  save();
}
