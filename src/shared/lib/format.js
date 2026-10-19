// Small helpers for showing dates, statuses and building links.
import { effectiveStatus } from './jobStatus';

const locale = (lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

/** "5 Oct 2026". */
export function formatDate(ts, lang) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Today", "Yesterday", "3 days ago", or a short date for older ads. */
export function relativeDate(ts, t, lang) {
  if (!ts) return '';
  const today = new Date().setHours(0, 0, 0, 0);
  const days = Math.round((today - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return t.today;
  if (days === 1) return t.yesterday;
  if (days < 7) return t.daysAgo(days);
  return formatDate(ts, lang);
}

/** The status of an ad in plain words, e.g. "Live until 5 Nov 2026". */
export function describeStatus(job, t, lang) {
  const s = effectiveStatus(job);
  if (s === 'live') return t.statusLive(formatDate(job.expiresAt, lang));
  if (s === 'rejected') return t.statusRejected(job.rejectReason);
  return {
    pending_payment: t.statusPending, paid_pending_review: t.statusReview, hidden: t.statusHidden,
    expired: t.statusExpired, draft: t.statusDraft,
  }[s];
}

/** wa.me link that opens WhatsApp with a ready-typed message. */
export function whatsappLink(number, text = '') {
  return `https://wa.me/${String(number).replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** wa.me link that opens WhatsApp's "choose a chat" screen with a ready-typed message, to share something with anyone. */
export function whatsappShareLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Makes a downloadable link: real storage links get ?download= so the browser saves the file. */
export function downloadLink(url, name = 'job-ad') {
  if (!url || url.startsWith('data:')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`;
}

/** Phone typed by a job seeker -> number WhatsApp understands. A 10-digit Indian number gets 91 in front. */
export function candidateWhatsApp(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}
