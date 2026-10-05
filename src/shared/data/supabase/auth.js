// Supabase: sign up, log in, log out, read my profile.
import { toProfile } from '../mappers';
import { ok, PROFILE_COLUMNS, raise, supabase } from './client';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email } : null;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email } : null);
  });
  return () => data.subscription.unsubscribe();
}

export async function getProfile(id) {
  return toProfile(ok(await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()));
}

export async function signUp({ email, password, companyName, phone }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { company_name: companyName.trim(), phone: phone.trim() } },
  });
  if (error) raise(error);
  // With "Confirm email" on, Supabase answers a second signup with a fake user that has no identities.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw Object.assign(new Error('User already registered'), { code: 'EMAIL_TAKEN' });
  }
  return { needsEmailConfirm: !data.session };
}

export async function signIn({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) raise(error);
}

export async function signOut() {
  await supabase.auth.signOut();
}
