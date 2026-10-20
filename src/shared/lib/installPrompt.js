// Decides whether to ask again about installing the app on the phone: not for 30 days after the person said "Not now".

export const INSTALL_KEY = 'jobs-abroad-install-later';
export const INSTALL_QUIET_DAYS = 30;

/** `savedMs` is what was stored when the person tapped "Not now" (a time in ms, or nothing). */
export function mayAskToInstall(savedMs, nowMs = Date.now(), quietDays = INSTALL_QUIET_DAYS) {
  const saved = Number(savedMs);
  if (!Number.isFinite(saved) || saved <= 0) return true;
  return nowMs - saved >= quietDays * 24 * 60 * 60 * 1000;
}
