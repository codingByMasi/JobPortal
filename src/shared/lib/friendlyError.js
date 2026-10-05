// Turns any error into a short, plain sentence in the chosen language.

/** Picks the translation key for an error (our own `code`, or a known Supabase message). */
export function errorKey(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  const map = {
    LOGIN: 'errLogin', EMAIL_TAKEN: 'errEmailTaken', WEAK_PASSWORD: 'errWeakPassword', NETWORK: 'errNetwork',
    BLOCKED: 'errBlocked', NOT_ALLOWED: 'errNotAllowed', NEED_LOGIN: 'errNeedLogin', NOT_FOUND: 'errNotFound',
    FILE_TYPE: 'errFileType', PDF_BIG: 'errPdfBig', IMAGE_FAIL: 'errImage', STORAGE_FULL: 'errStorageFull',
    EMAIL_NOT_CONFIRMED: 'errEmailNotConfirmed', TOO_MANY_ADS: 'errTooManyAds', DUPLICATE: 'errAlreadyApplied', LIMIT: 'errTooManyApplications', ENDED: 'errEnded', NOT_WAITING: 'errNotWaiting', BAD_PRICE: 'errPrice', UPLOAD: 'errUpload',
  };
  if (map[code]) return map[code];
  if (/invalid login credentials/i.test(msg)) return 'errLogin';
  if (/already registered|already been registered/i.test(msg)) return 'errEmailTaken';
  if (/password should be|at least \d+ char|weak password/i.test(msg)) return 'errWeakPassword';
  if (/email not confirmed/i.test(msg)) return 'errEmailNotConfirmed';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'errNetwork';
  if (/blocked/i.test(msg)) return 'errBlocked';
  if (code === '23505') return 'errAlreadyApplied';
  if (code === '54000') return 'errTooManyApplications';
  if (code === '53400') return 'errTooManyAds';
  if (code === '42501' || /row-level security|permission denied|not allowed|cannot change/i.test(msg)) return 'errNotAllowed';
  if (/not waiting for payment/i.test(msg)) return 'errNotWaiting';
  return 'errGeneric';
}

/** `t` is the translation object for the current language. */
export const friendlyMessage = (err, t) => t[errorKey(err)];
