// Demo: the site settings an admin can change. Same checks as the database (migration 0021).
import { badSettings, cleanWhatsapp, DEFAULT_SETTINGS, SETTING_KEYS } from '../../lib/siteSettings';
import { fail, logAdmin, needAdmin, save, state, wait } from './store';

/** Demo starts with the example values so every screen can be tried. */
const demoSettingRows = () => Object.entries(SETTING_KEYS).map(([key, name]) => ({ key, value: DEFAULT_SETTINGS[name] || '' })).filter((r) => r.value);

const rows = () => (state.db.site_settings ||= demoSettingRows());

export async function getSiteSettings() {
  await wait();
  return rows().map((r) => ({ ...r }));
}

export async function adminSaveSettings(values) {
  await wait();
  needAdmin();
  const clean = { ...values };
  if ('whatsappNumber' in clean) clean.whatsappNumber = cleanWhatsapp(clean.whatsappNumber);
  if (badSettings(clean).length) throw fail('BAD_SETTING', 'setting: bad');
  const detail = [];
  for (const [key, name] of Object.entries(SETTING_KEYS)) {
    if (!(name in clean)) continue;
    const value = String(clean[name] ?? '').trim();
    const row = rows().find((r) => r.key === key);
    if ((row?.value || '') === value) continue;
    detail.push(`${key}: ${row?.value || '(empty)'} -> ${value || '(empty)'}`);
    if (row) row.value = value;
    else rows().push({ key, value });
  }
  if (detail.length) {
    logAdmin('save_settings', null, detail.join('; ').slice(0, 500));
    save();
  }
}
