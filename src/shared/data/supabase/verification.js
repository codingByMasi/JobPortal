// Supabase: the employer's license for verification (number + file in a private bucket) and the admin's check of it.
import { toVerification } from '../mappers';
import { ok, raise, supabase, userId, uuid } from './client';

const BUCKET = 'licenses'; // private: an employer reads only their own folder, admins read all

const uploadError = (error) => Object.assign(new Error(error.message), { code: 'UPLOAD' });
const extOf = (file) => (file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');

/** The license I sent, or null. */
export async function getMyVerification() {
  const row = ok(await supabase.from('verification_requests').select('*').maybeSingle());
  return row ? toVerification(row) : null;
}

/** Uploads the license file to my own folder, then records it with the license number. The database checks everything again. */
export async function submitVerification({ licenseNumber, file }) {
  const owner = await userId();
  const path = `${owner}/${uuid()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw uploadError(error);
  const saved = await supabase.rpc('submit_verification', { p_license_number: licenseNumber, p_file_path: path });
  if (saved.error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    raise(saved.error);
  }
  return toVerification(saved.data);
}

/** Admin: every license request, newest first. */
export async function adminListVerifications() {
  return ok(await supabase.from('verification_requests').select('*').order('created_at', { ascending: false })).map(toVerification);
}

/** Admin: a link to the license file that works for five minutes. */
export async function adminGetLicenseFileUrl(path) {
  return ok(await supabase.storage.from(BUCKET).createSignedUrl(path, 300)).signedUrl;
}

/** Admin: the license is not good enough; the employer reads the reason and can send again. */
export async function adminRejectVerification(requestId, reason) {
  ok(await supabase.rpc('admin_reject_verification', { p_request: requestId, p_reason: reason }));
}
