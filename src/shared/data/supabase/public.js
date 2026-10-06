// Supabase: what visitors can do - read packages and live ads (through the safe public view), apply.
import { toJob, toPackage } from '../mappers';
import { ok, raise, supabase } from './client';

export async function listPackages() {
  return ok(await supabase.from('packages').select('*').order('price_paise')).map(toPackage);
}

export async function listLiveJobs() {
  // newest first with featured ads on top, decided here so that a long list is cut in a fair way
  const rows = ok(await supabase.from('public_jobs').select('*').order('featured', { ascending: false }).order('starts_at', { ascending: false }).limit(1000));
  return rows.map((row) => toJob(row));
}

/** One live ad by its id (for a shared link to an ad that is not in the loaded list). Returns null when it is not live. */
export async function getLiveJob(id) {
  const row = ok(await supabase.from('public_jobs').select('*').eq('id', id).maybeSingle());
  return row ? toJob(row) : null;
}

export async function submitApplication({ jobId, name, phone, city, message }) {
  const { error } = await supabase.from('applications').insert({
    job_id: jobId, name: name.trim(), phone: phone.trim(), city: (city || '').trim(), message: (message || '').trim(),
  });
  if (error) raise(error);
}

/** The website tells us it crashed (short text, no personal data). Never throws: a failing report must not cause another crash. */
export async function logError({ message, page = '', agent = '' }) {
  await supabase.rpc('log_client_error', { p_message: message, p_page: page, p_agent: agent });
}
