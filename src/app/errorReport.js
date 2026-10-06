// Tells us (the admin sees it under Admin > Problems) when the website crashes. Short text only, never personal data.
import { api } from '../shared/data';

let sent = 0;
const IGNORE = /failed to fetch|networkerror|load failed|network request failed|resizeobserver|script error/i;

/** "/job/1a2b3c4d-..." becomes "/job/:id", and the part after ? is dropped, so the page name holds nothing personal. */
export const cleanPage = (path = '') => String(path).split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').slice(0, 200);

/** Sends one crash report (at most 5 per visit; bad-connection noise is ignored). */
export function reportError(error) {
  const message = String(error?.message || error || '').trim().slice(0, 300);
  if (!message || IGNORE.test(message) || sent >= 5) return;
  sent += 1;
  try {
    api.logError({ message, page: cleanPage(window.location.pathname), agent: navigator.userAgent.slice(0, 150) }).catch(() => {});
  } catch {
    /* a failing report must never cause another failure */
  }
}
