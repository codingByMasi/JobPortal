// Job-alert emails to visitors (confirm mail and the daily digest), in the language the visitor chose, and the sender for them. Plain JS (Deno and tests).
import { renderHtml } from './emailHtml.js';
import { handleSend, sameSecret } from './notify.js';

// eslint-disable-next-line no-control-regex -- removing control characters is the point
const clean = (text, max) => String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const COUNTRY = { uae: 'UAE', saudi: 'Saudi Arabia', qatar: 'Qatar', kuwait: 'Kuwait', oman: 'Oman', others: '' };

const TEXT = {
  en: {
    confirmSubject: 'Please confirm your job alerts',
    confirmHead: 'Please confirm your job alerts on Jobs Abroad.',
    confirmLine: 'Tap the button to start getting an email when a new ad matches. If you did not ask for this, ignore this email: nothing will be sent.',
    confirmButton: 'Confirm my alerts',
    digestSubject: (n) => `${n} new job ${n === 1 ? 'ad matches' : 'ads match'} your alert`,
    digestHead: (n) => `${n} new ${n === 1 ? 'ad matches' : 'ads match'} your job alert.`,
    more: (n) => `and ${n} more`,
    digestButton: 'See the new ads',
    why: 'You get this because you asked for job alerts on Jobs Abroad.',
    unsub: 'Unsubscribe',
  },
  hi: {
    confirmSubject: 'कृपया अपनी नौकरी की सूचना पक्की करें',
    confirmHead: 'कृपया Jobs Abroad पर अपनी नौकरी की सूचना पक्की करें।',
    confirmLine: 'नया विज्ञापन आने पर ईमेल पाने के लिए बटन दबाएँ। अगर आपने यह नहीं माँगा था तो इस ईमेल को छोड़ दें: कुछ नहीं भेजा जाएगा।',
    confirmButton: 'मेरी सूचना पक्की करें',
    digestSubject: (n) => `आपकी सूचना के लिए ${n} नए विज्ञापन`,
    digestHead: (n) => `आपकी नौकरी की सूचना के लिए ${n} नए विज्ञापन आए हैं।`,
    more: (n) => `और ${n} और`,
    digestButton: 'नए विज्ञापन देखें',
    why: 'आपको यह इसलिए मिला क्योंकि आपने Jobs Abroad पर नौकरी की सूचना माँगी थी।',
    unsub: 'बंद करें',
  },
};

/** { subject, text, html, unsubscribeUrl } for one queued alert message, or null for an unknown kind. `row` is { kind, data, token, lang }. */
export function renderAlertEmail(row, { siteUrl = '' } = {}) {
  const w = TEXT[row.lang === 'hi' ? 'hi' : 'en'];
  const unsubscribeUrl = `${siteUrl}/alerts/unsubscribe?token=${encodeURIComponent(row.token)}`;
  let subject; let lines; let button; let url; let textLines;
  if (row.kind === 'confirm') {
    subject = w.confirmSubject;
    lines = [w.confirmHead, w.confirmLine];
    button = w.confirmButton;
    url = `${siteUrl}/alerts/confirm?token=${encodeURIComponent(row.token)}`;
    textLines = [...lines, `${button}: ${url}`];
  } else if (row.kind === 'digest') {
    const total = Math.max(1, Number(row.data?.total) || 0);
    const jobs = (Array.isArray(row.data?.jobs) ? row.data.jobs : []).slice(0, 8);
    const place = (j) => [clean(j.company, 60), clean(j.city, 40), COUNTRY[j.country] || ''].filter(Boolean).join(', ');
    const items = jobs.map((j) => `${clean(j.title, 80)}${place(j) ? ` - ${place(j)}` : ''}`);
    if (total > jobs.length) items.push(w.more(total - jobs.length));
    subject = w.digestSubject(total);
    lines = [w.digestHead(total), ...items];
    button = w.digestButton;
    url = `${siteUrl}/jobs`;
    const links = jobs.map((j) => (j.id ? `${siteUrl}/job/${encodeURIComponent(j.id)}` : ''));
    textLines = [w.digestHead(total), ...items.map((item, i) => (links[i] ? `- ${item}: ${links[i]}` : `- ${item}`)), `${button}: ${url}`];
  } else {
    return null;
  }
  const text = `${textLines.join('\n')}\n\n---\n${w.why}\n${w.unsub}: ${unsubscribeUrl}\n`;
  const html = renderHtml({
    siteUrl,
    footer: { en: w.why, hi: '', links: [[w.unsub, unsubscribeUrl], ['Contact / संपर्क', `${siteUrl}/contact`]] },
    sections: [{ lang: row.lang === 'hi' ? 'hi' : 'en', lines, button, url }],
  });
  return { subject: clean(subject, 120), text, html, unsubscribeUrl };
}

/** Sends the alert messages that are due (same rules as the employer emails: nothing at all without the email key). */
export async function sendDueAlertMail({ env, rpc, fetchFn }) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM) return { status: 'not_configured', sent: 0, failed: 0 };
  const siteUrl = String(env.SITE_URL || '').replace(/\/$/, '');
  const { data: rows, error } = await rpc('claim_alert_mail', { p_limit: 50 });
  if (error) return { status: 'queue_error', sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const row of rows || []) {
    const mail = renderAlertEmail(row, { siteUrl });
    if (!mail) {
      await rpc('mark_alert_mail_failed', { p_id: row.id, p_error: `unknown kind ${row.kind}` });
      failed += 1;
      continue;
    }
    try {
      const res = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: env.NOTIFY_FROM, to: [row.email], subject: mail.subject, text: mail.text, html: mail.html, headers: { 'List-Unsubscribe': `<${mail.unsubscribeUrl}>` } }),
      });
      if (res.ok) {
        await rpc('mark_alert_mail_sent', { p_id: row.id });
        sent += 1;
      } else {
        await rpc('mark_alert_mail_failed', { p_id: row.id, p_error: `email service answered ${res.status}` });
        failed += 1;
      }
    } catch {
      await rpc('mark_alert_mail_failed', { p_id: row.id, p_error: 'could not reach the email service' });
      failed += 1;
    }
  }
  return { status: 'ok', sent, failed };
}

/** The web call: checks the shared secret, then sends the employer emails and the alert mails. Returns { status, body }. */
export async function handleRun(secretHeader, deps) {
  if (!sameSecret(secretHeader, deps.env.NOTIFY_SECRET)) return { status: 401, body: { error: 'secret' } };
  const { body } = await handleSend(secretHeader, deps);
  return { status: 200, body: { ...body, alerts: await sendDueAlertMail(deps) } };
}
