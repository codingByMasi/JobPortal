// Turns any error into a short, plain sentence in the chosen language.

/** Picks the translation key for an error (our own `code`, or a known Supabase message). */
export function errorKey(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  const map = {
    LOGIN: 'errLogin', EMAIL_TAKEN: 'errEmailTaken', WEAK_PASSWORD: 'errWeakPassword', NETWORK: 'errNetwork',
    BLOCKED: 'errBlocked', NOT_ALLOWED: 'errNotAllowed', NEED_LOGIN: 'errNeedLogin', NOT_FOUND: 'errNotFound',
    FILE_TYPE: 'errFileType', PDF_BIG: 'errPdfBig', IMAGE_FAIL: 'errImage', STORAGE_FULL: 'errStorageFull',
    EMAIL_NOT_CONFIRMED: 'errEmailNotConfirmed', TOO_MANY_ADS: 'errTooManyAds', DUPLICATE: 'errAlreadyApplied', LIMIT: 'errTooManyApplications', ENDED: 'errEnded', NOT_WAITING: 'errNotWaiting', BAD_PRICE: 'errPrice', UPLOAD: 'errUpload', TOO_MANY_REQUESTS: 'errTooManyRequests', MFA_CODE: 'errMfaCode', NEED_MESSAGE: 'errNeedMessage', ONLINE_PAY_FAILED: 'errOnlinePay',
  };
  if (map[code]) return map[code];
  if (/invalid login credentials/i.test(msg)) return 'errLogin';
  if (/already registered|already been registered/i.test(msg)) return 'errEmailTaken';
  if (/password should be|at least \d+ char|weak password/i.test(msg)) return 'errWeakPassword';
  if (/email not confirmed/i.test(msg)) return 'errEmailNotConfirmed';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'errNetwork';
  if (/blocked/i.test(msg)) return 'errBlocked';
  if (/payments_reference|payments_one_paid|payment_proofs_reference|proof: reference_used/i.test(msg) || code === 'REFERENCE_USED' || code === 'PROOF_REFERENCE_USED') return 'errReferenceUsed';
  if (/proof: reference|PROOF_REFERENCE/.test(msg + code)) return 'errProofReference';
  if (/proof: file/i.test(msg)) return 'errProofFile';
  if (/has ended/i.test(msg)) return 'errEnded';
  if (/cannot be (approved|rejected|refunded)|not hidden|only a live ad/i.test(msg)) return 'errNotNow';
  const offer = msg.match(/offer: (\w+)/);
  if (offer) return `offer_${offer[1]}`;
  if (/has ads/i.test(msg) || code === '23503' || code === 'PLAN_HAS_ADS') return 'errPlanHasAds';
  if (code === 'CODE_TAKEN' || /offers_coupon_unique/i.test(msg)) return 'errCodeTaken';
  if (code === 'ALREADY_REPORTED' || /already reported/i.test(msg)) return 'errAlreadyReported';
  if (code === 'ALREADY_REQUESTED' || /already have your request/i.test(msg)) return 'errAlreadyRequested';
  if (code === 'AD_NOT_OPEN' || /ad is not open/i.test(msg)) return 'errAdNotOpen';
  if (code === 'TOO_FAST') return 'errTooFast';
  if (code === '23505') return 'errAlreadyApplied';
  if (code === '54000') return 'errTooManyApplications';
  if (code === '54001') return 'errTooFast';
  if (code === '53400') return 'errTooManyAds';
  if (code === '53300') return 'errTooManyRequests';
  if (code === '42501' || /row-level security|permission denied|not allowed|cannot change/i.test(msg)) return 'errNotAllowed';
  if (/not waiting for payment/i.test(msg)) return 'errNotWaiting';
  return 'errGeneric';
}

/** `t` is the translation object for the current language. */
export const friendlyMessage = (err, t) => t[errorKey(err)];
