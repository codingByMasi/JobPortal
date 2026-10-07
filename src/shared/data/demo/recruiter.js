// Demo: what a logged-in employer can do. Mirrors the database rules (own ads only, locked fields, blocked accounts).
import { canDelete } from '../../lib/jobStatus';
import { isValidWhatsapp } from '../../lib/phone';
import { toApplication, toChangeRequest, toJobRow, toPayment, toProfile } from '../mappers';
import { asJob, fail, findJob, needUser, newest, requestRows, save, state, uid, wait } from './store';

export async function listMyJobs() {
  await wait();
  const p = needUser();
  return state.db.jobs.filter((j) => j.recruiter_id === p.id).sort(newest).map(asJob);
}

export async function createJob(input) {
  await wait();
  const p = needUser();
  if (p.blocked) throw fail('BLOCKED');
  const pkg = state.db.packages.find((x) => x.id === input.packageId && x.active);
  if (!pkg) throw fail('NOT_ALLOWED');
  // same limit as the database (migration 0009): at most 20 ads waiting for payment
  if (state.db.jobs.filter((j) => j.recruiter_id === p.id && j.status === 'pending_payment').length >= 20) throw fail('TOO_MANY_ADS');
  const fields = toJobRow(input);
  if ((fields.title || '').length < 2) throw fail('NOT_ALLOWED');
  if (!isValidWhatsapp(fields.whatsapp || '')) throw fail('NOT_ALLOWED');
  const row = {
    file_url: null, file_path: null, thumb_url: null, thumb_path: null, details: '', file_type: 'image', company: '', city: '', whatsapp: '', ...fields,
    price_paise_at_order: pkg.price_paise, days_at_order: pkg.duration_days,
    list_price_paise: pkg.price_paise, discount_paise: 0, final_price_paise: pkg.price_paise, duration_days_final: pkg.duration_days, offer_id: null, featured_override: null,
    id: uid(), recruiter_id: p.id, package_id: pkg.id, status: 'pending_payment', starts_at: null, expires_at: null,
    reject_reason: null, posted_date: new Date().toISOString().slice(0, 10), created_at: new Date().toISOString(),
  };
  state.db.jobs.push(row);
  save();
  return asJob(row);
}

export async function updateJob(id, patch) {
  await wait();
  const p = needUser();
  const row = findJob(id);
  if (p.blocked) throw fail('BLOCKED');
  if (row.recruiter_id !== p.id || !['pending_payment', 'rejected'].includes(row.status)) throw fail('NOT_ALLOWED');
  const { package_id: _locked, ...fields } = toJobRow(patch);
  if (fields.whatsapp !== undefined && !isValidWhatsapp(fields.whatsapp)) throw fail('NOT_ALLOWED');
  Object.assign(row, fields);
  save();
  return asJob(row);
}

/** Sends a rejected ad for review again (same single status change the database allows). */
export async function resubmitJob(id) {
  await wait();
  const p = needUser();
  const row = findJob(id);
  if (p.blocked) throw fail('BLOCKED');
  if (row.recruiter_id !== p.id || row.status !== 'rejected') throw fail('NOT_ALLOWED');
  Object.assign(row, { status: 'paid_pending_review', reject_reason: null });
  save();
  return asJob(row);
}

export async function updateProfile(id, { companyName, phone, raNumber }) {
  await wait();
  const p = needUser();
  if (p.id !== id) throw fail('NOT_ALLOWED');
  const identityChanged = companyName.trim() !== p.company_name || (raNumber || '').trim() !== (p.ra_number || '');
  Object.assign(p, { company_name: companyName.trim(), phone: phone.trim(), ra_number: (raNumber || '').trim() });
  if (identityChanged) p.verified = false; // same rule as the database: a changed identity must be checked again
  save();
  return toProfile(p);
}

export async function deleteJob(job) {
  await wait();
  const p = needUser();
  const row = findJob(job.id);
  if (row.recruiter_id !== p.id && p.role !== 'admin') throw fail('NOT_ALLOWED');
  if (p.role !== 'admin' && !canDelete(asJob(row))) throw fail('NOT_ALLOWED');
  state.db.jobs = state.db.jobs.filter((j) => j.id !== row.id);
  state.db.applications = state.db.applications.filter((a) => a.job_id !== row.id);
  state.db.change_requests = requestRows().filter((r) => r.job_id !== row.id);
  // like the database: a waiting payment and the offer use of an unpaid ad go with it; real payments stay with no ad
  state.db.payments = state.db.payments.filter((x) => !(x.job_id === row.id && x.status === 'created'));
  state.db.offer_redemptions = (state.db.offer_redemptions || []).filter((r) => r.job_id !== row.id);
  state.db.payments.forEach((x) => {
    if (x.job_id === row.id) x.job_id = null;
  });
  save();
}

export async function listMyPayments() {
  await wait();
  const p = needUser();
  return state.db.payments
    .filter((x) => x.recruiter_id === p.id)
    .sort(newest)
    .map((x) => toPayment({ ...x, job: state.db.jobs.find((j) => j.id === x.job_id) }));
}

export async function listMyApplications() {
  await wait();
  const p = needUser();
  if (!p.verified) return []; // same rule as migration 0014: details only for verified employers
  const mine = new Set(state.db.jobs.filter((j) => j.recruiter_id === p.id).map((j) => j.id));
  return state.db.applications
    .filter((a) => mine.has(a.job_id))
    .sort(newest)
    .map((a) => toApplication({ ...a, job: state.db.jobs.find((j) => j.id === a.job_id) }));
}

// same rules as the database (migration 0011): own ad, past "waiting for payment", not blocked, 3 to 300 letters, 3 open at most
export async function createChangeRequest({ jobId, message }) {
  await wait();
  const p = needUser();
  if (p.blocked) throw fail('BLOCKED');
  const row = findJob(jobId);
  if (row.recruiter_id !== p.id || row.status === 'pending_payment') throw fail('NOT_ALLOWED');
  const text = String(message || '').trim();
  if (text.length < 3 || text.length > 300) throw fail('NEED_MESSAGE');
  if (requestRows().filter((r) => r.job_id === jobId && r.status === 'open').length >= 3) throw fail('TOO_MANY_REQUESTS');
  requestRows().push({ id: uid(), job_id: jobId, recruiter_id: p.id, message: text, status: 'open', created_at: new Date().toISOString(), handled_at: null });
  save();
}

export async function listMyChangeRequests() {
  await wait();
  const p = needUser();
  return requestRows().filter((r) => r.recruiter_id === p.id).sort(newest).map(toChangeRequest);
}

export async function countMyApplications() {
  await wait();
  const p = needUser();
  const mine = new Set(state.db.jobs.filter((j) => j.recruiter_id === p.id).map((j) => j.id));
  return state.db.applications.filter((a) => mine.has(a.job_id)).length;
}
