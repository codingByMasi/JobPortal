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

export async function signUp({ email, password, companyName, phone, raNumber = '', captchaToken }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { company_name: companyName.trim(), phone: phone.trim(), ra_number: String(raNumber).trim() }, captchaToken },
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

/** Sends a "set a new password" email. The answer is always the same, so nobody can find out which emails have an account. */
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
  if (error && !/rate limit|too many/i.test(error.message)) raise(error);
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) raise(error);
}

/** Where the admin is with the authenticator app: `enrolled` (turned on), `needsCode` (this login still has to type a code). */
export async function mfaStatus() {
  const level = ok(await supabase.auth.mfa.getAuthenticatorAssuranceLevel());
  const factors = ok(await supabase.auth.mfa.listFactors());
  const verified = factors.totp || [];
  return { enrolled: verified.length > 0, needsCode: level.currentLevel === 'aal1' && level.nextLevel === 'aal2', factorId: verified[0]?.id || null };
}

/** Starts the set-up: returns the picture (QR) and the secret to scan or type into the authenticator app. */
export async function mfaEnroll() {
  const data = ok(await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `admin-${Date.now()}` }));
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a 6-digit code (finishes the set-up the first time, and raises this login to the second step). */
export async function mfaVerify(factorId, code) {
  const challenge = ok(await supabase.auth.mfa.challenge({ factorId }));
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) throw Object.assign(new Error(error.message), { code: 'MFA_CODE' });
}
