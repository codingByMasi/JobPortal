// Gets an uploaded file ready: pictures are made smaller in the browser, big PDFs are refused.

export const LIMITS = {
  imageTargetBytes: 300 * 1024,
  imageMaxWidth: 1200,
  pdfMaxBytes: 2 * 1024 * 1024,
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Never make a picture wider than `maxWidth`; keep its shape. */
export function fitSize(width, height, maxWidth = LIMITS.imageMaxWidth) {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/** "image", "pdf" or null (not allowed). */
export function fileKind(file) {
  if (IMAGE_TYPES.includes(file.type)) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name || '')) return 'image';
  if (!file.type && /\.pdf$/i.test(file.name || '')) return 'pdf';
  return null;
}

const fail = (code) => Object.assign(new Error(code), { code });

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** Draws the picture smaller and saves it as JPEG, lowering quality (then size) until it is about 300 KB. */
async function shrinkImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw fail('IMAGE_FAIL');
  }
  let { width, height } = fitSize(bitmap.width, bitmap.height);
  let blob = null;
  for (let round = 0; round < 4; round += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // PNGs with see-through parts become white, not black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (let q = 0.82; q >= 0.4; q -= 0.1) {
      blob = await toBlob(canvas, q);
      if (blob && blob.size <= LIMITS.imageTargetBytes) break;
    }
    if (blob && blob.size <= LIMITS.imageTargetBytes) break;
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
  }
  bitmap.close?.();
  if (!blob) throw fail('IMAGE_FAIL');
  return new File([blob], 'ad.jpg', { type: 'image/jpeg' });
}

/**
 * Checks and prepares a chosen file. Returns { file, fileType }.
 * Throws an error whose `code` is FILE_TYPE, PDF_BIG or IMAGE_FAIL.
 */
export async function prepareFile(file) {
  const kind = fileKind(file);
  if (!kind) throw fail('FILE_TYPE');
  if (kind === 'pdf') {
    if (file.size > LIMITS.pdfMaxBytes) throw fail('PDF_BIG');
    return { file, fileType: 'pdf' };
  }
  return { file: await shrinkImage(file), fileType: 'image' };
}
