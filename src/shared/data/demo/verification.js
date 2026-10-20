// Demo: the employer's license and the admin's check, kept in the browser. Same rules as the database (migration 0028).
import { toVerification } from '../mappers';
import { fail, logAdmin, needAdmin, needUser, save, state, uid, wait } from './store';

const requests = () => (state.db.verification_requests ||= []);
const pictures = () => (state.db.demo_pictures ||= {}); // path -> data: address
const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(fail('UPLOAD'));
  reader.readAsDataURL(file);
});

export async function getMyVerification() {
  await wait();
  const p = needUser();
  const row = requests().find((x) => x.recruiter_id === p.id);
  return row ? toVerification(row) : null;
}

export async function submitVerification({ licenseNumber, file }) {
  await wait();
  const p = needUser();
  if (p.blocked) throw fail('BLOCKED');
  if (p.verified) throw fail('NOT_ALLOWED', 'Your company is already verified.');
  const number = String(licenseNumber || '').trim();
  if (number.length < 3 || number.length > 40) throw fail('LICENSE_NUMBER', 'license: number');
  if (!file) throw fail('LICENSE_FILE', 'license: file');
  const path = `${p.id}/${uid()}`;
  pictures()[path] = await readAsDataUrl(file);
  const now = new Date().toISOString();
  let row = requests().find((x) => x.recruiter_id === p.id);
  if (row) Object.assign(row, { license_number: number, file_path: path, status: 'submitted', reject_reason: null, updated_at: now });
  else requests().push((row = { id: uid(), recruiter_id: p.id, license_number: number, file_path: path, status: 'submitted', reject_reason: null, created_at: now, updated_at: now }));
  save();
  return toVerification(row);
}

export async function adminListVerifications() {
  await wait();
  needAdmin();
  return [...requests()].reverse().map(toVerification);
}

export async function adminGetLicenseFileUrl(path) {
  await wait();
  needAdmin();
  return pictures()[path] || '';
}

export async function adminRejectVerification(requestId, reason) {
  await wait();
  needAdmin();
  const row = requests().find((x) => x.id === requestId);
  if (!row) throw fail('NOT_FOUND', 'Request not found.');
  if (row.status !== 'submitted' || !String(reason || '').trim()) throw fail('NOT_ALLOWED', 'This request cannot be rejected now.');
  Object.assign(row, { status: 'rejected', reject_reason: String(reason).trim().slice(0, 300), updated_at: new Date().toISOString() });
  logAdmin('reject_verification', row.id, row.reject_reason);
  save();
}
