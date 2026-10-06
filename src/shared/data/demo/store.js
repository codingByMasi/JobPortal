// The demo "database": one object kept in this browser (localStorage), plus the small helpers every demo module shares.
// Demo mode follows the same rules as the real database so every screen can be tested without Supabase.
import { toJob } from '../mappers';
import { buildSeed } from './seed';

const KEY = 'jobs-abroad-demo-v2';
const listeners = new Set();

export const fail = (code, message = code) => Object.assign(new Error(message), { code });
export const wait = () => new Promise((resolve) => setTimeout(resolve, 60));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.v === 2) return saved;
  } catch {
    /* no saved demo data yet */
  }
  return buildSeed();
}

/** `state.db` is replaced as a whole when the demo is reset, so always read it through `state`. */
export const state = { db: load() };

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.db));
  } catch {
    throw fail('STORAGE_FULL');
  }
}

export function resetState() {
  state.db = buildSeed();
  save();
  notify();
}

/* ---------- who is logged in ---------- */
export const currentUser = () => {
  const u = state.db.users.find((x) => x.id === state.db.session);
  return u ? { id: u.id, email: u.email } : null;
};
export const notify = () => listeners.forEach((cb) => cb(currentUser()));
export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export const me = () => state.db.profiles.find((p) => p.id === state.db.session) || null;
export function needUser() {
  const p = me();
  if (!p) throw fail('NEED_LOGIN');
  return p;
}
export function needAdmin() {
  const p = needUser();
  if (p.role !== 'admin') throw fail('NOT_ALLOWED');
  return p;
}

/* ---------- lookups ---------- */
export function findJob(id) {
  const row = state.db.jobs.find((j) => j.id === id);
  if (!row) throw fail('NOT_FOUND');
  return row;
}
/** The change requests list (older saved demo data does not have it yet). */
export const requestRows = () => (state.db.change_requests ||= []);
/** Writes one line in the demo admin log (the real database does this inside its admin functions). */
export const logAdmin = (action, targetId, detail = '') => {
  (state.db.admin_log ||= []).push({ id: uid(), action, target_id: targetId, detail, created_at: new Date().toISOString() });
};
export const pkgOf = (id) => state.db.packages.find((p) => p.id === id) || null;
export const profileOf = (id) => state.db.profiles.find((p) => p.id === id) || null;

/** A job row with its package and employer attached, like the joined queries in Supabase. */
export const withEmbeds = (row) => ({ ...row, package: pkgOf(row.package_id), recruiter: profileOf(row.recruiter_id) });
export const asJob = (row) => toJob(withEmbeds(row), { allowData: true });
export const newest = (a, b) => (a.created_at < b.created_at ? 1 : -1);
export const isLive = (j, now = Date.now()) => j.status === 'live' && j.expires_at && Date.parse(j.expires_at) > now;
