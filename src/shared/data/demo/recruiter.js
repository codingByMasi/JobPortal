// Demo: what a logged-in employer can do. Mirrors the database rules (own ads only, locked fields, blocked accounts).
import { toApplication, toJobRow, toPayment } from '../mappers';
import { asJob, fail, findJob, needUser, newest, save, state, uid, wait } from './store';

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
  const row = {
    file_url: null, file_path: null, file_type: 'image', company: '', city: '', whatsapp: '', ...fields,
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
  if (row.recruiter_id !== p.id || row.status !== 'pending_payment') throw fail('NOT_ALLOWED');
  const { package_id: _locked, ...fields } = toJobRow(patch);
  Object.assign(row, fields);
  save();
  return asJob(row);
}

export async function deleteJob(job) {
  await wait();
  const p = needUser();
  const row = findJob(job.id);
  if (row.recruiter_id !== p.id && p.role !== 'admin') throw fail('NOT_ALLOWED');
  state.db.jobs = state.db.jobs.filter((j) => j.id !== row.id);
  state.db.applications = state.db.applications.filter((a) => a.job_id !== row.id);
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
  const mine = new Set(state.db.jobs.filter((j) => j.recruiter_id === p.id).map((j) => j.id));
  return state.db.applications
    .filter((a) => mine.has(a.job_id))
    .sort(newest)
    .map((a) => toApplication({ ...a, job: state.db.jobs.find((j) => j.id === a.job_id) }));
}
