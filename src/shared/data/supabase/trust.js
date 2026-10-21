// Supabase: reports about an ad, account deletion requests, the home page counters, and the admin lists for both.
import { toCounts, toDeletionRequest, toReport } from '../mappers';
import { getHumanPass, ok, supabase } from './client';

/** A visitor reports an ad. The database limits how many one connection may send. */
export async function reportAd({ jobId, reason, message = '', contact = '', captchaToken = '' }) {
  const humanPass = await getHumanPass(captchaToken);
  ok(await supabase.from('reports').insert({ job_id: jobId, reason, message: message.trim(), contact: contact.trim(), human_pass: humanPass }).select('id').maybeSingle());
}

/** Anyone asks us to delete their account and data. An admin checks and does it by hand. */
export async function requestAccountDeletion({ email, note = '' }) {
  ok(await supabase.from('deletion_requests').insert({ email: email.trim(), note: note.trim() }).select('id').maybeSingle());
}

/** Live ads, verified employers and applications (three numbers, nothing private). */
export async function getPublicCounts() {
  return toCounts(ok(await supabase.rpc('public_counts')));
}

export async function adminListReports() {
  return ok(
    await supabase.from('reports').select('*, job:jobs(id, title, status, recruiter:profiles(company_name))').order('created_at', { ascending: false }).limit(500),
  ).map(toReport);
}

export async function adminSetReport(id, status) {
  ok(await supabase.from('reports').update({ status }).eq('id', id).select('id').single());
}

export async function adminListDeletionRequests() {
  return ok(await supabase.from('deletion_requests').select('*').order('created_at', { ascending: false }).limit(500)).map(toDeletionRequest);
}

export async function adminSetDeletionRequest(id, status) {
  ok(await supabase.from('deletion_requests').update({ status }).eq('id', id).select('id').single());
}
