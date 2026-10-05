// Supabase Storage: ad pictures and PDFs, always inside a folder named after the user's id.
import { BUCKET, supabase, uuid } from './client';

const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const uploadError = (error) => Object.assign(new Error(error.message), { code: 'UPLOAD' });

export async function uploadFile(file, ownerId) {
  const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${ownerId}/${uuid()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw uploadError(error);
  return { url: publicUrl(path), path };
}

export async function copyFile(file, ownerId) {
  const path = `${ownerId}/${uuid()}.${file.path.split('.').pop()}`;
  const { error } = await supabase.storage.from(BUCKET).copy(file.path, path);
  if (error) throw uploadError(error);
  return { url: publicUrl(path), path };
}

export async function removeFile(path) {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}
