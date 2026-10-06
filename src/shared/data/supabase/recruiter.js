// Supabase: what a logged-in employer does. The database rules (RLS + triggers) decide what is really allowed.
import { toApplication, toChangeRequest, toJob, toJobRow, toPayment, toProfile } from '../mappers';
import { removeFile } from './files';
import { JOB_FULL, ok, PROFILE_COLUMNS, raise, supabase, userId } from './client';

export async function listMyJobs(ownerId) {
  return ok(await supabase.from('jobs').select(JOB_FULL).eq('recruiter_id', ownerId).order('created_at', { ascending: false })).map((r) => toJob(r));
}

export async function createJob(input) {
  const id = await userId();
  const row = { ...toJobRow(input), recruiter_id: id, status: 'pending_payment' };
  return toJob(ok(await supabase.from('jobs').insert(row).select(JOB_FULL).single()));
}

export async function updateJob(id, patch) {
  const { package_id: _locked, ...fields } = toJobRow(patch);
  return toJob(ok(await supabase.from('jobs').update(fields).eq('id', id).select(JOB_FULL).single()));
}

/** Sends a rejected ad for review again (the database allows exactly this one status change). */
export async function resubmitJob(id) {
  return toJob(ok(await supabase.from('jobs').update({ status: 'paid_pending_review', reject_reason: null }).eq('id', id).select(JOB_FULL).single()));
}

export async function deleteJob(job) {
  const { error } = await supabase.from('jobs').delete().eq('id', job.id);
  if (error) raise(error);
  await removeFile(job.filePath);
  await removeFile(job.thumbPath);
}

export async function updateProfile(id, { companyName, phone, raNumber }) {
  const fields = { company_name: companyName.trim(), phone: phone.trim(), ra_number: (raNumber || '').trim() };
  return toProfile(ok(await supabase.from('profiles').update(fields).eq('id', id).select(PROFILE_COLUMNS).single()));
}

export async function listMyPayments(ownerId) {
  return ok(
    await supabase.from('payments').select('*, job:jobs(id, title)').eq('recruiter_id', ownerId).order('created_at', { ascending: false }),
  ).map(toPayment);
}

export async function listMyApplications(ownerId) {
  const rows = ok(
    await supabase
      .from('applications')
      .select('*, job:jobs!inner(id, title, company, recruiter_id)')
      .eq('job.recruiter_id', ownerId)
      .order('created_at', { ascending: false }),
  );
  return rows.map(toApplication);
}

export async function createChangeRequest({ jobId, message }) {
  const id = await userId();
  ok(await supabase.from('change_requests').insert({ job_id: jobId, recruiter_id: id, message: message.trim() }).select('id').single());
}

export async function listMyChangeRequests(ownerId) {
  return ok(await supabase.from('change_requests').select('*').eq('recruiter_id', ownerId).order('created_at', { ascending: false })).map(toChangeRequest);
}

/** How many people applied to my ads (a number only). Names and phones are shown only to verified employers. */
export async function countMyApplications() {
  return ok(await supabase.rpc('count_my_applications')) ?? 0;
}
