// Demo: what visitors can do - read packages and live ads, apply.
import { toPackage } from '../mappers';
import { asJob, fail, isLive, save, state, uid, wait } from './store';

export async function listPackages() {
  await wait();
  return state.db.packages.map(toPackage);
}

export async function listLiveJobs() {
  await wait();
  return state.db.jobs.filter((j) => isLive(j)).map(asJob);
}

export async function getLiveJob(id) {
  await wait();
  const row = state.db.jobs.find((j) => j.id === id);
  return row && isLive(row) ? asJob(row) : null;
}

export async function logError({ message, page = '', agent = '' }) {
  const list = (state.db.error_log ||= []);
  const text = String(message || '').trim().slice(0, 300);
  if (!text) return;
  const same = list.find((r) => r.message === text && r.page === page.slice(0, 200));
  if (same) {
    same.times += 1;
    same.last_at = new Date().toISOString();
  } else if (list.length < 300) {
    list.push({ id: uid(), message: text, page: page.slice(0, 200), agent: agent.slice(0, 150), times: 1, created_at: new Date().toISOString(), last_at: new Date().toISOString() });
  }
  save();
}

export async function submitApplication({ jobId, name, phone, city, message }) {
  await wait();
  const job = state.db.jobs.find((j) => j.id === jobId);
  if (!job || !isLive(job)) throw fail('ENDED');
  if (!name.trim() || !/^[0-9+ -]{7,20}$/.test(phone.trim())) throw fail('NOT_ALLOWED');
  // same limits as the database (migration 0008): one application per ad per phone, at most 1000 per ad
  const last10 = (p) => p.replace(/\D/g, '').slice(-10);
  const forThisAd = state.db.applications.filter((a) => a.job_id === jobId);
  if (forThisAd.some((a) => last10(a.phone) === last10(phone))) throw fail('DUPLICATE');
  if (forThisAd.length >= 1000) throw fail('LIMIT');
  state.db.applications.push({
    id: uid(), job_id: jobId, name: name.trim().slice(0, 100), phone: phone.trim(), city: (city || '').trim().slice(0, 80),
    message: (message || '').trim().slice(0, 500), created_at: new Date().toISOString(),
  });
  save();
}
