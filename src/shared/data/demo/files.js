// Demo: "uploads" are kept inside the browser as small base64 files.
import { fail, uid } from './store';

export async function uploadFile(file, ownerId) {
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(fail('UPLOAD'));
    reader.readAsDataURL(file);
  });
  return { url, path: `${ownerId}/${uid()}` };
}

export async function copyFile(file, ownerId) {
  return { url: file.url, path: `${ownerId}/${uid()}` };
}

export async function removeFile() {}

/** Demo files live inside the ad rows, so nothing is ever left behind. */
export async function adminListUnusedFiles() {
  return [];
}

export async function adminRemoveFiles() {
  return 0;
}
