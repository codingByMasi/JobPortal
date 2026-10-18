// Demo: the admin's QR picture and payment proofs, kept in the browser. Same rules as the database (migration 0024).
import { toProof } from '../mappers';
import { adminSaveSettings } from './settings';
import { fail, logAdmin, needAdmin, needUser, save, state, uid, wait } from './store';

const proofs = () => (state.db.payment_proofs ||= []);
const pictures = () => (state.db.demo_pictures ||= {}); // path -> data: address
const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(fail('UPLOAD'));
  reader.readAsDataURL(file);
});
const savedQrPath = () => (state.db.site_settings || []).find((r) => r.key === 'qr_path')?.value || '';

export async function getShopQrUrl(path) {
  await wait();
  return path ? pictures()[path] || '' : '';
}

export async function adminSaveQr(file, oldPath = '') {
  await wait();
  needAdmin();
  const path = `qr/${uid()}.jpg`;
  pictures()[path] = await readAsDataUrl(file);
  await adminSaveSettings({ qrPath: path });
  delete pictures()[oldPath];
  save();
  return path;
}

export async function adminRemoveQr(oldPath) {
  await wait();
  needAdmin();
  const current = oldPath || savedQrPath();
  await adminSaveSettings({ qrPath: '' });
  delete pictures()[current];
  save();
}

export async function getMyPaymentProof(jobId) {
  await wait();
  const p = needUser();
  const row = proofs().find((x) => x.job_id === jobId && x.recruiter_id === p.id);
  return row ? toProof(row) : null;
}

export async function submitPaymentProof({ jobId, reference, file }) {
  await wait();
  const p = needUser();
  const job = state.db.jobs.find((j) => j.id === jobId && j.recruiter_id === p.id);
  if (!job) throw fail('NOT_FOUND', 'Ad not found.');
  if (job.status !== 'pending_payment') throw fail('NOT_WAITING', 'This ad is not waiting for payment.');
  const ref = String(reference || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,30}$/.test(ref)) throw fail('PROOF_REFERENCE', 'proof: reference');
  const used = state.db.payments.some((x) => (x.reference || '').toUpperCase() === ref)
    || proofs().some((x) => x.reference === ref && x.status !== 'rejected' && x.job_id !== jobId);
  if (used) throw fail('PROOF_REFERENCE_USED', 'proof: reference_used');
  const path = `${p.id}/${uid()}`;
  pictures()[path] = await readAsDataUrl(file);
  const now = new Date().toISOString();
  let row = proofs().find((x) => x.job_id === jobId);
  if (row) Object.assign(row, { reference: ref, file_path: path, status: 'submitted', reject_reason: null, updated_at: now });
  else proofs().push((row = { id: uid(), job_id: jobId, recruiter_id: p.id, reference: ref, file_path: path, status: 'submitted', reject_reason: null, created_at: now, updated_at: now }));
  save();
  return toProof(row);
}

export async function adminListPaymentProofs() {
  await wait();
  needAdmin();
  return [...proofs()].reverse().map(toProof);
}

export async function adminGetProofFileUrl(path) {
  await wait();
  needAdmin();
  return pictures()[path] || '';
}

export async function adminRejectProof(proofId, reason) {
  await wait();
  needAdmin();
  const row = proofs().find((x) => x.id === proofId);
  if (!row) throw fail('NOT_FOUND', 'Proof not found.');
  if (row.status !== 'submitted' || !String(reason || '').trim()) throw fail('NOT_ALLOWED', 'This proof cannot be rejected now.');
  Object.assign(row, { status: 'rejected', reject_reason: String(reason).trim().slice(0, 300), updated_at: new Date().toISOString() });
  logAdmin('reject_proof', row.id, row.reject_reason);
  save();
}
