// Supabase: what a logged-in employer does. The database rules (RLS + triggers) decide what is really allowed.
import { toApplication, toJob, toJobRow, toPayment } from '../mappers';
import { removeFile } from './files';
import { JOB_FULL, ok, raise, supabase, userId } from './client';

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

export async function deleteJob(job) {
  const { error } = await supabase.from('jobs').delete().eq('id', job.id);
  if (error) raise(error);
  await removeFile(job.filePath);
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
