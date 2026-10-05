// Only lets real web links through, so a bad value (like javascript:...) can never run code.

/** Returns the link when it is a valid https address, otherwise an empty string. */
export function safeHttpsUrl(text = '') {
  try {
    const url = new URL(String(text).trim());
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

const DATA_FILE = /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;

/**
 * Link for an ad file: https always. A small base64 picture/PDF ("data:") only when `allowData` is true,
 * which is only the case in demo mode where files are kept in the browser.
 */
export function safeFileUrl(text = '', allowData = false) {
  const s = String(text).trim();
  if (allowData && DATA_FILE.test(s)) return s;
  return safeHttpsUrl(s);
}
