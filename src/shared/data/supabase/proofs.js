// Supabase: the admin's own payment QR picture, and the payment proof (UTR number + screenshot) an employer sends for the admin to check.
import { toProof } from '../mappers';
import { ok, raise, supabase, userId, uuid } from './client';

const SHOP = 'shop-assets'; // public to read, admins write
const PROOFS = 'payment-proofs'; // private

const uploadError = (error) => Object.assign(new Error(error.message), { code: 'UPLOAD' });
const extOf = (file) => (file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');
const removeQuietly = async (bucket, path) => {
  if (path) await supabase.storage.from(bucket).remove([path]).catch(() => {});
};

/** The address of the admin's QR picture (empty when none is saved). */
export async function getShopQrUrl(path) {
  return path ? supabase.storage.from(SHOP).getPublicUrl(path).data.publicUrl : '';
}

/** Admin: uploads a new QR picture, saves it as the setting, then removes the old file. Returns the new path. */
export async function adminSaveQr(file, oldPath = '') {
  const path = `qr/${uuid()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(SHOP).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw uploadError(error);
  const saved = await supabase.rpc('admin_save_settings', { p_values: { qr_path: path } });
  if (saved.error) {
    await removeQuietly(SHOP, path);
    raise(saved.error);
  }
  await removeQuietly(SHOP, oldPath);
  return path;
}

/** Admin: takes the QR picture away (the payment screen then makes its own UPI QR code). */
export async function adminRemoveQr(oldPath) {
  ok(await supabase.rpc('admin_save_settings', { p_values: { qr_path: '' } }));
  await removeQuietly(SHOP, oldPath);
}

/** The proof I sent for one of my ads, or null. */
export async function getMyPaymentProof(jobId) {
  const row = ok(await supabase.from('payment_proofs').select('*').eq('job_id', jobId).maybeSingle());
  return row ? toProof(row) : null;
}

/** Uploads the screenshot to my own folder, then records it with the reference number. The database checks everything again. */
export async function submitPaymentProof({ jobId, reference, file }) {
  const owner = await userId();
  const path = `${owner}/${uuid()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(PROOFS).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw uploadError(error);
  const saved = await supabase.rpc('submit_payment_proof', { p_job: jobId, p_reference: reference, p_file_path: path });
  if (saved.error) {
    await removeQuietly(PROOFS, path);
    raise(saved.error);
  }
  return toProof(saved.data);
}

/** Admin: every proof, newest first. */
export async function adminListPaymentProofs() {
  return ok(await supabase.from('payment_proofs').select('*').order('created_at', { ascending: false })).map(toProof);
}

/** Admin: a link to the screenshot that works for five minutes. */
export async function adminGetProofFileUrl(path) {
  return ok(await supabase.storage.from(PROOFS).createSignedUrl(path, 300)).signedUrl;
}

/** Admin: the money was not found; the employer reads the reason. */
export async function adminRejectProof(proofId, reason) {
  ok(await supabase.rpc('admin_reject_proof', { p_proof: proofId, p_reason: reason }));
}
