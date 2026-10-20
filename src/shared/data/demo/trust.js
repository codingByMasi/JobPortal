// Demo: reports about an ad, account deletion requests, the home page counters, and the admin lists. Same rules as the database (migration 0020).
import { toCounts, toDeletionRequest, toReport } from '../mappers';
import { fail, isLive, needAdmin, newest, profileOf, save, state, uid, wait } from './store';

const REASONS = ['asked_money', 'fake_company', 'wrong_details', 'other'];
const reportRows = () => (state.db.reports ||= []);
const deletionRows = () => (state.db.deletion_requests ||= []);
const HOUR = 3600000;

export async function reportAd({ jobId, reason, message = '', contact = '' }) {
  await wait();
  const job = state.db.jobs.find((j) => j.id === jobId);
  if (!job || !isLive(job) || !REASONS.includes(reason)) throw fail('AD_NOT_OPEN', 'This ad is not open.');
  if (message.length > 300 || contact.length > 40) throw fail('NOT_ALLOWED');
  // the demo has one visitor, so "the same address" is the same browser
  if (reportRows().some((r) => r.job_id === jobId)) throw fail('ALREADY_REPORTED', 'You already reported this ad.');
  if (reportRows().filter((r) => Date.now() - Date.parse(r.created_at) < HOUR).length >= 10) throw fail('TOO_FAST', 'Too many reports from this connection.');
  reportRows().push({ id: uid(), job_id: jobId, reason, message: message.trim(), contact: contact.trim(), status: 'open', created_at: new Date().toISOString() });
  save();
}

export async function requestAccountDeletion({ email, note = '' }) {
  await wait();
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 120 || note.length > 300) throw fail('NOT_ALLOWED');
  if (deletionRows().some((r) => r.email === clean && r.status === 'open')) throw fail('ALREADY_REQUESTED', 'We already have your request.');
  deletionRows().push({ id: uid(), email: clean, note: note.trim(), status: 'open', created_at: new Date().toISOString() });
  save();
}

export async function getPublicCounts() {
  await wait();
  return toCounts({
    live_ads: state.db.jobs.filter((j) => isLive(j)).length,
    verified_recruiters: state.db.profiles.filter((p) => p.verified && p.role === 'recruiter' && !p.blocked).length,
    applications: state.db.applications.length,
  });
}

export async function adminListReports() {
  await wait();
  needAdmin();
  return [...reportRows()].sort(newest).map((r) => {
    const job = state.db.jobs.find((j) => j.id === r.job_id);
    return toReport({ ...r, job: job ? { title: job.title, status: job.status, recruiter: profileOf(job.recruiter_id) } : null });
  });
}

export async function adminSetReport(id, status) {
  await wait();
  needAdmin();
  const row = reportRows().find((r) => r.id === id);
  if (!row) throw fail('NOT_FOUND');
  row.status = status;
  save();
}

export async function adminListDeletionRequests() {
  await wait();
  needAdmin();
  return [...deletionRows()].sort(newest).map(toDeletionRequest);
}

export async function adminSetDeletionRequest(id, status) {
  await wait();
  needAdmin();
  const row = deletionRows().find((r) => r.id === id);
  if (!row) throw fail('NOT_FOUND');
  row.status = status;
  save();
}
