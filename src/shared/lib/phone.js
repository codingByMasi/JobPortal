// Phone number rules in one place (used by the ad form, apply form, signup and the database mappers).

/** A typed number used in a link or saved with an ad: digits only; a 10-digit Indian mobile number gets 91 in front. */
export function normalizeWhatsapp(text = '') {
  let digits = String(text).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return digits;
}

/** True when the number (after normalizing) has 10 to 15 digits. */
export const isValidWhatsapp = (text) => /^\d{10,15}$/.test(normalizeWhatsapp(text));

/** A phone typed by a person (applicant or employer): digits, +, spaces, dashes; 7 to 20 characters. */
export const isValidPhone = (text) => /^[0-9+ -]{7,20}$/.test(String(text).trim());
