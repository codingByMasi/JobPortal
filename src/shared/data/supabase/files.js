// Supabase Storage: ad pictures and PDFs, always inside a folder named after the user's id.
import { pickUnused } from '../../lib/unusedFiles';
import { BUCKET, ok, supabase, uuid } from './client';

const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const uploadError = (error) => Object.assign(new Error(error.message), { code: 'UPLOAD' });

/** `thumb: true` marks the small picture shown in lists (its name ends in -t.jpg). */
export async function uploadFile(file, ownerId, { thumb = false } = {}) {
  const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${ownerId}/${uuid()}${thumb ? '-t' : ''}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw uploadError(error);
  return { url: publicUrl(path), path };
}

export async function copyFile(file, ownerId) {
  const ext = file.path.split('.').pop();
  const path = `${ownerId}/${uuid()}${file.path.endsWith(`-t.${ext}`) ? '-t' : ''}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).copy(file.path, path);
  if (error) throw uploadError(error);
  return { url: publicUrl(path), path };
}

export async function removeFile(path) {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

/** Every file in the bucket: the top level holds one folder per employer, each folder holds their files. Admin only (the storage rules decide). */
async function listAllFiles() {
  const bucket = supabase.storage.from(BUCKET);
  const top = ok(await bucket.list('', { limit: 1000 }));
  const files = [];
  for (const entry of top) {
    if (entry.id) {
      files.push({ path: entry.name, size: entry.metadata?.size || 0, createdAt: Date.parse(entry.created_at) || null });
      continue;
    }
    for (let offset = 0; ; offset += 1000) {
      const page = ok(await bucket.list(entry.name, { limit: 1000, offset }));
      for (const f of page) if (f.id) files.push({ path: `${entry.name}/${f.name}`, size: f.metadata?.size || 0, createdAt: Date.parse(f.created_at) || null });
      if (page.length < 1000) break;
    }
  }
  return files;
}

/** Files that no ad uses and that are at least a day old (left behind when an ad was deleted). */
export async function adminListUnusedFiles() {
  const [files, jobs] = [await listAllFiles(), ok(await supabase.from('jobs').select('file_path, thumb_path'))];
  return pickUnused(files, jobs);
}

/** Removes the given files (the list comes from adminListUnusedFiles). Returns how many were removed. */
export async function adminRemoveFiles(paths) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const done = ok(await supabase.storage.from(BUCKET).remove(chunk));
    removed += done.length;
  }
  return removed;
}
