// Supabase: job alerts for visitors (migration 0035). Three calls only; the tables themselves are closed to the browser.
import { ok, supabase } from './client';

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leaves an email for alerts (a country and a kind of work are optional). A confirm mail follows; nothing is sent before it is confirmed. */
export async function subscribeJobAlert({ email, country, category, lang }) {
  ok(await supabase.rpc('subscribe_job_alert', { p_email: email, p_country: country || null, p_category: category || null, p_lang: lang === 'hi' ? 'hi' : 'en' }));
}

/** The link in the confirm mail. True when the alert exists. */
export async function confirmJobAlert(token) {
  if (!TOKEN.test(String(token || ''))) return false;
  return ok(await supabase.rpc('confirm_job_alert', { p_token: token })) === true;
}

/** The link in every alert mail: removes all alerts of that email. True when something was removed. */
export async function unsubscribeJobAlert(token) {
  if (!TOKEN.test(String(token || ''))) return false;
  return ok(await supabase.rpc('unsubscribe_job_alert', { p_token: token })) === true;
}
