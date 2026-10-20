// Supabase: the site settings an admin can change (WhatsApp, emails, company, site address).
import { SETTING_KEYS } from '../../lib/siteSettings';
import { ok, supabase } from './client';

/** Rows the current person may read: visitors get the public ones. */
export async function getSiteSettings() {
  return ok(await supabase.from('site_settings').select('key, value'));
}

/** Admin: saves the given settings (by name used in the code, e.g. { contactEmail: 'help@shop.in' }). Empty text clears one. */
export async function adminSaveSettings(values) {
  const byKey = Object.fromEntries(Object.entries(SETTING_KEYS).filter(([, name]) => name in values).map(([key, name]) => [key, values[name] ?? '']));
  ok(await supabase.rpc('admin_save_settings', { p_values: byKey }));
}
