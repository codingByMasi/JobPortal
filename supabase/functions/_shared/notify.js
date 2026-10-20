// Messages to employers: what each email says (English, then Hindi) and the sender loop. Plain JS, no imports (runs in Deno and in the tests).
// Emails are plain text only: whatever an employer typed (an ad title, a reason) is never treated as HTML or as a header.

const DATE = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};
/** One line, no control characters, at most 80 letters: safe inside a subject. */
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const oneLine = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
/** Keeps line breaks, removes other control characters, at most 300 letters. */
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const body = (text) => String(text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, 300);

/**
 * { subject, text } for one queued message, or null for an unknown kind.
 * `data` is what the database saved with it (title, days, ends, reason, job_id). `siteUrl` has no trailing slash.
 */
export function renderEmail(kind, data = {}, { siteUrl = '' } = {}) {
  const title = body(data.title);
  const ends = DATE(data.ends);
  const reason = body(data.reason);
  const days = Number(data.days) || 0;
  const mine = `${siteUrl}/dashboard`;
  const adLink = data.job_id ? `${siteUrl}/job/${encodeURIComponent(data.job_id)}` : mine;
  const parts = {
    license_verified: {
      subject: 'Your company is verified on Jobs Abroad',
      en: ['Your company is now verified on Jobs Abroad.', `You can post your ads now: ${siteUrl}/dashboard/new`],
      hi: ['आपकी कंपनी अब Jobs Abroad पर वेरिफ़ाइड है।', `आप अब अपने विज्ञापन डाल सकते हैं: ${siteUrl}/dashboard/new`],
    },
    license_rejected: {
      subject: 'We could not accept your license',
      en: ['We could not accept your license.', `Reason: ${reason}`, `Please send it again from the Post an ad page: ${siteUrl}/dashboard/new`],
      hi: ['हम आपका लाइसेंस स्वीकार नहीं कर सके।', `कारण: ${reason}`, `कृपया "विज्ञापन डालें" पेज से फिर भेजें: ${siteUrl}/dashboard/new`],
    },
    ad_approved: {
      subject: `Your ad is live: ${oneLine(data.title)}`,
      en: [`Your ad "${title}" is now live on Jobs Abroad for ${days} days${ends ? ` (until ${ends})` : ''}.`, `See it: ${adLink}`],
      hi: [`आपका विज्ञापन "${title}" अब Jobs Abroad पर ${days} दिन${ends ? ` (${ends} तक)` : ''} के लिए चालू है।`, `देखें: ${adLink}`],
    },
    ad_rejected: {
      subject: `We could not approve your ad: ${oneLine(data.title)}`,
      en: [`We could not approve your ad "${title}".`, `Reason: ${reason}`, `Please fix it and send it again: ${mine}`],
      hi: [`हम आपका विज्ञापन "${title}" मंज़ूर नहीं कर सके।`, `कारण: ${reason}`, `कृपया ठीक करके फिर भेजें: ${mine}`],
    },
    ad_extended: {
      subject: `Days added to your ad: ${oneLine(data.title)}`,
      en: [`We added ${days} days to your ad "${title}".${ends ? ` It is live until ${ends}.` : ''}`, `See it: ${adLink}`],
      hi: [`हमने आपके विज्ञापन "${title}" में ${days} दिन जोड़ दिए हैं।${ends ? ` यह ${ends} तक चालू है।` : ''}`, `देखें: ${adLink}`],
    },
    ad_ending_soon: {
      subject: `Your ad ends soon: ${oneLine(data.title)}`,
      en: [`Your ad "${title}" ends${ends ? ` on ${ends}` : ' soon'}.`, `To keep it live, open My ads and tap Ask for more days: ${mine}`],
      hi: [`आपका विज्ञापन "${title}" ${ends ? `${ends} को ` : 'जल्दी '}खत्म होगा।`, `चालू रखने के लिए "मेरे विज्ञापन" खोलें और "और दिन माँगें" दबाएँ: ${mine}`],
    },
    ad_ended: {
      subject: `Your ad has ended: ${oneLine(data.title)}`,
      en: [`Your ad "${title}" has ended and is no longer shown.`, `To show it again, open My ads and tap Ask for more days, or renew it: ${mine}`],
      hi: [`आपका विज्ञापन "${title}" खत्म हो गया है और अब दिख नहीं रहा।`, `फिर दिखाने के लिए "मेरे विज्ञापन" खोलें और "और दिन माँगें" दबाएँ, या इसे दोबारा डालें: ${mine}`],
    },
  }[kind];
  if (!parts) return null;
  const footerEn = 'To stop these emails, open My details on the site and turn them off.';
  const footerHi = 'ये ईमेल बंद करने के लिए साइट पर "मेरी जानकारी" खोलें और इन्हें बंद करें।';
  const text = `${parts.en.join('\n')}\n\n---\n\n${parts.hi.join('\n')}\n\n---\n${footerEn}\n${footerHi}\n`;
  return { subject: oneLine(parts.subject), text };
}

/**
 * Sends the messages that are due. deps: { env: { RESEND_API_KEY, NOTIFY_FROM, SITE_URL }, rpc(name, args) -> { data, error }, fetchFn }.
 * With no email key set it does nothing at all (the messages stay in the queue), so deploying this is safe before the key exists.
 */
export async function sendDueNotifications({ env, rpc, fetchFn }) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM) return { status: 'not_configured', sent: 0, failed: 0 };
  const siteUrl = String(env.SITE_URL || '').replace(/\/$/, '');
  const { data: rows, error } = await rpc('claim_notifications', { p_limit: 50 });
  if (error) return { status: 'queue_error', sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const row of rows || []) {
    const mail = renderEmail(row.kind, row.data, { siteUrl });
    if (!mail || !row.email) {
      await rpc('mark_notification_failed', { p_id: row.id, p_error: mail ? 'no email address' : `unknown kind ${row.kind}` });
      failed += 1;
      continue;
    }
    try {
      const res = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: env.NOTIFY_FROM, to: [row.email], subject: mail.subject, text: mail.text }),
      });
      if (res.ok) {
        await rpc('mark_notification_sent', { p_id: row.id });
        sent += 1;
      } else {
        await rpc('mark_notification_failed', { p_id: row.id, p_error: `email service answered ${res.status}` });
        failed += 1;
      }
    } catch {
      await rpc('mark_notification_failed', { p_id: row.id, p_error: 'could not reach the email service' });
      failed += 1;
    }
  }
  return { status: 'ok', sent, failed };
}

/** True only when `given` equals `secret` (compared without stopping at the first wrong letter); an empty secret never matches. */
export function sameSecret(given, secret) {
  if (!secret || typeof given !== 'string' || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** The web call: checks the shared secret, then sends. Returns { status, body }. */
export async function handleSend(secretHeader, deps) {
  if (!sameSecret(secretHeader, deps.env.NOTIFY_SECRET)) return { status: 401, body: { error: 'secret' } };
  return { status: 200, body: await sendDueNotifications(deps) };
}
