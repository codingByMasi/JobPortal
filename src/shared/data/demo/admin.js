// Demo: everything only an admin can do. Every function checks the caller is an admin, like the database does.
import { approvalDates } from '../../lib/jobStatus';
import { toApplication, toJobRow, toPayment, toProfile } from '../mappers';
import { asJob, fail, findJob, isLive, needAdmin, newest, pkgOf, profileOf, save, state, uid, wait } from './store';

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
    file_url: null, file_path: null, file_type: 'image', company: '', city: '', whatsapp: '', ...toJobRow(input),
    id: uid(), recruiter_id: p.id, package_id: pkg ? pkg.id : null, status: 'live', starts_at: new Date(startsAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(), reject_reason: null, posted_date: today(), created_at: nowIso(),
  };
  state.db.jobs.push(row);
  save();
  return asJob(row);
}

export async function adminApprove(id) {
  await wait();
  needAdmin();
  const row = findJob(id);
  const { startsAt, expiresAt } = approvalDates(Date.now(), pkgOf(row.package_id)?.duration_days || 30);
  Object.assign(row, { status: 'live', starts_at: new Date(startsAt).toISOString(), expires_at: new Date(expiresAt).toISOString(), reject_reason: null });
  save();
  return asJob(row);
}

export async function adminReject(id, reason) {
  await wait();
  needAdmin();
  Object.assign(findJob(id), { status: 'rejected', reject_reason: reason.trim() });
  save();
}

export async function adminSetHidden(id, hidden) {
  await wait();
  needAdmin();
  const row = findJob(id);
  if (hidden) row.status = 'hidden';
  else if (row.expires_at && Date.parse(row.expires_at) > Date.now()) row.status = 'live';
  else throw fail('ENDED');
  save();
}

export async function adminMarkPaid(id, { amountPaise, note = '' } = {}) {
  await wait();
  needAdmin();
  const row = findJob(id);
  if (row.status !== 'pending_payment') throw fail('NOT_WAITING', 'This ad is not waiting for payment.');
  const pay = {
    id: uid(), job_id: row.id, recruiter_id: row.recruiter_id, amount_paise: amountPaise ?? pkgOf(row.package_id)?.price_paise ?? 0,
    currency: 'INR', method: 'manual', status: 'paid', note, created_at: nowIso(),
  };
  state.db.payments.push(pay);
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
  if (patch.verified !== undefined) row.verified = patch.verified;
  if (patch.blocked !== undefined) row.blocked = patch.blocked;
  save();
}

export async function adminListPayments() {
  await wait();
  needAdmin();
  return [...state.db.payments]
    .sort(newest)
    .map((x) => toPayment({ ...x, job: state.db.jobs.find((j) => j.id === x.job_id), recruiter: profileOf(x.recruiter_id) }));
}

export async function adminAddPayment({ recruiterId, jobId, amountPaise, note = '' }) {
  await wait();
  needAdmin();
  state.db.payments.push({
    id: uid(), job_id: jobId || null, recruiter_id: recruiterId, amount_paise: amountPaise, currency: 'INR',
    method: 'manual', status: 'paid', note, created_at: nowIso(),
  });
  save();
}

export async function adminRefund(id) {
  await wait();
  needAdmin();
  const row = state.db.payments.find((x) => x.id === id);
  if (!row) throw fail('NOT_FOUND');
  row.status = 'refunded';
  save();
}

export async function adminSavePackage(pkg) {
  await wait();
  needAdmin();
  const fields = { name: pkg.name.trim(), price_paise: pkg.pricePaise, duration_days: pkg.durationDays, featured: pkg.featured, active: pkg.active };
  const row = pkg.id && state.db.packages.find((x) => x.id === pkg.id);
  if (row) Object.assign(row, fields);
  else state.db.packages.push({ id: uid(), ...fields });
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
    revenuePaise: state.db.payments
      .filter((x) => x.status === 'paid' && Date.parse(x.created_at) >= monthStart)
      .reduce((sum, x) => sum + x.amount_paise, 0),
  };
}
