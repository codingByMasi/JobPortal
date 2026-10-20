// The ONE place the Supabase library is created and the shared helpers for talking to it.
// Only the public (anon) key is used here. It is safe in the browser BECAUSE every table has Row Level Security.
import { createClient } from '@supabase/supabase-js';
import { withTimeout } from '../../lib/fetchTimeout';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../env';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: withTimeout(fetch.bind(globalThis)) },
});

export const BUCKET = 'job-files';
export const PROFILE_COLUMNS = 'id, email, role, company_name, phone, ra_number, verified, blocked, email_notifications, created_at';
export const JOB_FULL = `*, package:packages(*), recruiter:profiles(${PROFILE_COLUMNS})`;

const AUTH_CODES = {
  invalid_credentials: 'LOGIN', user_already_exists: 'EMAIL_TAKEN', email_exists: 'EMAIL_TAKEN', weak_password: 'WEAK_PASSWORD', email_not_confirmed: 'EMAIL_NOT_CONFIRMED',
};

/** Throws a plain Error carrying our own `code` (see friendlyError.js). */
export const raise = (error) => {
  throw Object.assign(new Error(error.message), { code: AUTH_CODES[error.code] || error.code });
};

/** Takes a Supabase answer and returns its `data`, or throws. */
export const ok = ({ data, error }) => {
  if (error) raise(error);
  return data;
};

export const iso = (ts) => new Date(ts).toISOString();
export const uuid = () => crypto.randomUUID();

/** The logged-in user's id, or an error asking to log in. */
export async function userId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw Object.assign(new Error('Please log in.'), { code: 'NEED_LOGIN' });
  return id;
}
