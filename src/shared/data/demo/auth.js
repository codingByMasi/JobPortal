// Demo: sign up, log in, log out.
import { toProfile } from '../mappers';
import { fail, notify, profileOf, save, state, subscribe, uid, wait, currentUser } from './store';

export async function getSession() {
  await wait();
  return currentUser();
}

export const onAuthChange = subscribe;

export async function getProfile(id) {
  return toProfile(profileOf(id));
}

export async function signUp({ email, password, companyName, phone }) {
  await wait();
  const mail = String(email).trim().toLowerCase();
  if (String(password).length < 8) throw fail('WEAK_PASSWORD');
  if (state.db.users.some((u) => u.email === mail)) throw fail('EMAIL_TAKEN');
  const id = uid();
  state.db.users.push({ id, email: mail, password });
  state.db.profiles.push({
    id, email: mail, role: 'recruiter', company_name: companyName.trim(), phone: phone.trim(),
    verified: false, blocked: false, created_at: new Date().toISOString(),
  });
  state.db.session = id;
  save();
  notify();
  return { needsEmailConfirm: false };
}

export async function signIn({ email, password }) {
  await wait();
  const user = state.db.users.find((u) => u.email === String(email).trim().toLowerCase() && u.password === password);
  if (!user) throw fail('LOGIN');
  state.db.session = user.id;
  save();
  notify();
}

export async function signOut() {
  state.db.session = null;
  save();
  notify();
}
