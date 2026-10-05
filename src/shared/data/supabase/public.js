// Supabase: what visitors can do - read packages and live ads (through the safe public view), apply.
import { toJob, toPackage } from '../mappers';
import { ok, raise, supabase } from './client';

export async function listPackages() {
  return ok(await supabase.from('packages').select('*').order('price_paise')).map(toPackage);
}

export async function listLiveJobs() {
  return ok(await supabase.from('public_jobs').select('*').limit(1000)).map((row) => toJob(row));
}

export async function submitApplication({ jobId, name, phone, city, message }) {
  const { error } = await supabase.from('applications').insert({
    job_id: jobId, name: name.trim(), phone: phone.trim(), city: (city || '').trim(), message: (message || '').trim(),
  });
  if (error) raise(error);
}
