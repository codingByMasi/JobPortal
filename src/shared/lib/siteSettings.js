// The settings an admin can change in the app (WhatsApp, UPI, emails, company, site address): their names, checks and "is it filled in?" rule.
import * as config from '../../config';

/** Settings key in the database -> name used in the code. */
export const SETTING_KEYS = {
  whatsapp_number: 'whatsappNumber',
  upi_id: 'upiId',
  upi_name: 'upiName',
  contact_email: 'contactEmail',
  grievance_name: 'grievanceName',
  grievance_email: 'grievanceEmail',
  company_name: 'companyName',
  site_url: 'siteUrl',
  qr_path: 'qrPath',
};

/** The example values of src/config.js. A setting that still holds one of these (or nothing) counts as NOT filled in. */
const EXAMPLES = {
  whatsappNumber: config.WHATSAPP_NUMBER,
  upiId: config.UPI_ID,
  upiName: config.UPI_NAME,
  contactEmail: config.CONTACT_EMAIL,
  grievanceName: config.GRIEVANCE_NAME,
  grievanceEmail: config.GRIEVANCE_EMAIL,
};

/** Starting values: the examples of src/config.js (used in demo mode, and until the real ones are loaded). */
export const DEFAULT_SETTINGS = {
  ...EXAMPLES,
  companyName: '',
  qrPath: '',
  siteUrl: config.isPlaceholder(config.SITE_URL) ? '' : config.SITE_URL,
};

/** Database rows [{ key, value }] on top of the defaults. An empty saved value clears the default (it must not fall back to an example). */
export function mergeSettings(rows) {
  const out = { ...DEFAULT_SETTINGS };
  for (const name of Object.keys(EXAMPLES)) out[name] = '';
  for (const { key, value } of rows) if (SETTING_KEYS[key]) out[SETTING_KEYS[key]] = value || '';
  return out;
}

/** True when the setting has a real value (not empty, not an example). `demo` is true in demo mode, where examples are fine. */
export function isFilledIn(name, value, demo = false) {
  const v = String(value ?? '').trim();
  if (!v) return false;
  return demo || v !== EXAMPLES[name];
}

const PATTERNS = {
  whatsappNumber: (v) => /^[0-9]{10,15}$/.test(v),
  upiId: (v) => /^[A-Za-z0-9._-]{2,50}@[A-Za-z0-9]{2,30}$/.test(v),
  contactEmail: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 120,
  grievanceEmail: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 120,
  upiName: (v) => v.length >= 2 && v.length <= 80,
  grievanceName: (v) => v.length >= 2 && v.length <= 80,
  companyName: (v) => v.length >= 2 && v.length <= 80,
  qrPath: (v) => /^qr\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(v),
  siteUrl: (v) => /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]{2,5})?$/.test(v),
};

/** Digits only; a 10-digit number gets 91 in front (the same rule as the database). */
export function cleanWhatsapp(text) {
  const digits = String(text || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/** Names of the settings whose text is wrong. Empty text is allowed (it clears the setting). */
export function badSettings(values) {
  return Object.keys(PATTERNS).filter((name) => {
    const raw = String(values[name] ?? '').trim();
    if (!raw) return false;
    return !PATTERNS[name](name === 'whatsappNumber' ? cleanWhatsapp(raw) : raw);
  });
}

/** Settings that must be filled in before the site takes payments / works fully, in the order they are shown to the admin. */
export const REQUIRED_SETTINGS = ['whatsappNumber', 'upiId', 'upiName', 'contactEmail', 'grievanceName', 'grievanceEmail', 'companyName', 'siteUrl'];

/** Names of the required settings that are still not filled in. */
export const missingSettings = (settings, demo = false) => REQUIRED_SETTINGS.filter((name) => !isFilledIn(name, settings[name], demo));
