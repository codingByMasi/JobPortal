// Demo: job alerts, with the same rules as the database (migration 0035). No email is sent in the demo; the confirm link token is kept in the demo data.
import { fail, save, state, uid, wait } from './store';

const COUNTRIES = ['uae', 'saudi', 'qatar', 'kuwait', 'oman', 'others'];
const CATEGORIES = ['plumber', 'electrician', 'driver', 'technician', 'cook', 'helper', 'office', 'other'];
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const alerts = () => (state.db.job_alerts ||= []);

export async function subscribeJobAlert({ email, country, category, lang }) {
  await wait();
  const mail = String(email || '').trim().toLowerCase();
  const c = country || null;
  const k = category || null;
  if (mail.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw fail('ALERT_EMAIL');
  if ((c && !COUNTRIES.includes(c)) || (k && !CATEGORIES.includes(k))) throw fail('NOT_ALLOWED');
  const list = alerts();
  if (list.some((a) => a.email === mail && a.country === c && a.category === k)) return;
  if (list.filter((a) => a.email === mail).length >= 5) throw fail('ALERT_LIMIT');
  list.push({ id: uid(), email: mail, country: c, category: k, lang: lang === 'hi' ? 'hi' : 'en', token: uid(), confirmed_at: null, created_at: new Date().toISOString() });
  save();
}

export async function confirmJobAlert(token) {
  await wait();
  if (!TOKEN.test(String(token || ''))) return false;
  const a = alerts().find((x) => x.token === token);
  if (!a) return false;
  a.confirmed_at ||= new Date().toISOString();
  save();
  return true;
}

export async function unsubscribeJobAlert(token) {
  await wait();
  if (!TOKEN.test(String(token || ''))) return false;
  const a = alerts().find((x) => x.token === token);
  if (!a) return false;
  state.db.job_alerts = alerts().filter((x) => x.email !== a.email);
  save();
  return true;
}
