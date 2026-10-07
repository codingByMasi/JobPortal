// Supabase: admin-only actions. Approve and Mark-paid call database functions that check is_admin() themselves.
import { toApplication, toChangeRequest, toErrorLog, toJob, toJobRow, toPayment, toProfile } from '../mappers';
import { iso, JOB_FULL, ok, PROFILE_COLUMNS, raise, supabase, userId } from './client';

const DAY = 86400000;

export async function adminListJobs() {
  return ok(await supabase.from('jobs').select(JOB_FULL).order('created_at', { ascending: false })).map((r) => toJob(r));
}

export async function adminUpdateJob(id, patch) {
  const fields = toJobRow(patch);
  if (patch.expiresAt) fields.expires_at = iso(patch.expiresAt);
  return toJob(ok(await supabase.from('jobs').update(fields).eq('id', id).select(JOB_FULL).single()));
}

export async function adminCreateJob(input, days) {
  const id = await userId();
  let length = days;
  if (!length && input.packageId) {
    const pkg = ok(await supabase.from('packages').select('duration_days').eq('id', input.packageId).maybeSingle());
    length = pkg?.duration_days;
  }
  const now = Date.now();
  const row = { ...toJobRow(input), recruiter_id: id, status: 'live', starts_at: iso(now), expires_at: iso(now + (length || 30) * DAY) };
  return toJob(ok(await supabase.from('jobs').insert(row).select(JOB_FULL).single()));
}

export async function adminApprove(id) {
  ok(await supabase.rpc('admin_approve_job', { p_job: id }));
}

export async function adminReject(id, reason) {
  ok(await supabase.rpc('admin_reject_job', { p_job: id, p_reason: reason.trim() }));
}

export async function adminSetHidden(id, hidden) {
  ok(await supabase.rpc('admin_set_hidden', { p_job: id, p_hidden: hidden }));
}

export async function adminMarkPaid(id, { amountPaise = null, note = '', reference = '' } = {}) {
  return toPayment(ok(await supabase.rpc('admin_mark_paid', { p_job: id, p_amount_paise: amountPaise, p_note: note, p_reference: reference })));
}

export async function adminListRecruiters() {
  return ok(await supabase.from('profiles').select(PROFILE_COLUMNS).order('created_at', { ascending: false })).map(toProfile);
}

export async function adminSetRecruiter(id, patch) {
  const fields = {};
  if (patch.verified !== undefined) fields.verified = patch.verified;
  if (patch.blocked !== undefined) fields.blocked = patch.blocked;
  ok(await supabase.from('profiles').update(fields).eq('id', id).select('id').single());
}

export async function adminListPayments() {
  return ok(
    await supabase.from('payments').select('*, job:jobs(id, title), recruiter:profiles(company_name)').order('created_at', { ascending: false }),
  ).map(toPayment);
}

export async function adminAddPayment({ recruiterId, jobId, amountPaise, note = '', reference = '' }) {
  ok(
    await supabase
      .from('payments')
      .insert({ recruiter_id: recruiterId, job_id: jobId || null, amount_paise: amountPaise, method: 'manual', status: 'paid', note, reference: reference.trim() || null })
      .select('id')
      .single(),
  );
}

export async function adminRefund(id, { hideAd = false } = {}) {
  ok(await supabase.rpc('admin_refund_payment', { p_payment: id, p_hide_job: hideAd }));
}

export async function adminListApplications() {
  return ok(
    await supabase.from('applications').select('*, job:jobs(id, title, company)').order('created_at', { ascending: false }),
  ).map(toApplication);
}

export async function adminCounts() {
  const count = async (build) => {
    const { count: n, error } = await build(supabase.from('jobs').select('id', { count: 'exact', head: true }));
    if (error) raise(error);
    return n ?? 0;
  };
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [live, review, waitingPayment, paid, requests] = await Promise.all([
    count((q) => q.eq('status', 'live').gt('expires_at', new Date().toISOString())),
    count((q) => q.eq('status', 'paid_pending_review')),
    count((q) => q.eq('status', 'pending_payment')),
    supabase.from('payments').select('amount_paise').eq('status', 'paid').gte('created_at', monthStart),
    supabase.from('change_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  if (requests.error) raise(requests.error);
  if (paid.error) raise(paid.error);
  return { live, review, waitingPayment, revenuePaise: paid.data.reduce((sum, x) => sum + x.amount_paise, 0), requests: requests.count ?? 0 };
}

export async function adminListChangeRequests() {
  return ok(
    await supabase.from('change_requests').select('*, job:jobs(id, title), recruiter:profiles(company_name, phone)').order('created_at', { ascending: false }),
  ).map(toChangeRequest);
}

export async function adminSetChangeRequest(id, status) {
  ok(await supabase.from('change_requests').update({ status }).eq('id', id).select('id').single());
}

export async function adminListErrors() {
  return ok(await supabase.from('error_log').select('*').order('last_at', { ascending: false }).limit(200)).map(toErrorLog);
}

export async function adminClearErrors() {
  ok(await supabase.from('error_log').delete().not('id', 'is', null));
}
